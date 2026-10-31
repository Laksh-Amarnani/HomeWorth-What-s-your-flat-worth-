#!/usr/bin/env bash
# Delete everything deploy_ecs.sh created so nothing keeps costing money.
#
#   export AWS_REGION=ap-south-1
#   ./scripts/cleanup_ecs.sh
set -euo pipefail
: "${AWS_REGION:?Set AWS_REGION first}"
STACK_NAME="${STACK_NAME:-homeworth}"
ECR_REPOSITORY="${ECR_REPOSITORY:-homeworth}"

read -r -p "Delete stack '${STACK_NAME}' and ECR repo '${ECR_REPOSITORY}' in ${AWS_REGION}? Type 'yes': " ok
[ "$ok" = "yes" ] || { echo "Cancelled."; exit 1; }

echo "Deleting CloudFormation stack (5-10 minutes)..."
aws cloudformation delete-stack --region "$AWS_REGION" --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --region "$AWS_REGION" --stack-name "$STACK_NAME"

aws ecr delete-repository --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY" --force >/dev/null 2>&1 \
  && echo "Deleted ECR repository" || echo "(no ECR repository)"
echo "Done. Check the AWS Billing console tomorrow to confirm nothing is still running."
