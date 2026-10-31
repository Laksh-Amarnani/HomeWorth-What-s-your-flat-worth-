#!/usr/bin/env bash
# Build the Docker image, push it to Amazon ECR and create/update the
# CloudFormation stack (network, load balancer, ECS Fargate service).  
#
# Usage (Git Bash, from the project folder):
#   export AWS_REGION=ap-south-1
#   ./scripts/deploy_ecs.sh
set -euo pipefail

: "${AWS_REGION:?Set AWS_REGION first, e.g. export AWS_REGION=ap-south-1}"
STACK_NAME="${STACK_NAME:-homeworth}"
ECR_REPOSITORY="${ECR_REPOSITORY:-homeworth}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"

cd "$(dirname "$0")/.."
[ -f models/model.joblib ] || { echo "models/model.joblib is missing: run python train.py first"; exit 1; }


ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_URI="${REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
echo "Account ${ACCOUNT_ID}, region ${AWS_REGION}, image ${IMAGE_URI}"

if ! aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$ECR_REPOSITORY" >/dev/null 2>&1; then
  echo "Creating ECR repository ${ECR_REPOSITORY}"
  aws ecr create-repository --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY" >/dev/null
  # keep only the 5 newest images (storage costs money)
  aws ecr put-lifecycle-policy --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY" \
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 5","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},"action":{"type":"expire"}}]}' >/dev/null
fi

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker build --platform linux/amd64 -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

PARAMS=("ImageUri=${IMAGE_URI}")
[ -n "${CERTIFICATE_ARN:-}" ] && PARAMS+=("CertificateArn=${CERTIFICATE_ARN}")

aws cloudformation deploy \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file infra/ecs-fargate.yaml \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMS[@]}"

URL="$(aws cloudformation describe-stacks --region "$AWS_REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteUrl'].OutputValue" --output text)"
echo
echo "Deployed. Website: ${URL}"
echo "The first start takes 1-2 minutes before the page loads."
