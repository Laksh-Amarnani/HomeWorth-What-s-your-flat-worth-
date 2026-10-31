# The website in one container: Flask served by gunicorn.
# Models and cleaned data are built beforehand (python prepare_data.py && python train.py) and copied in.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# predictor.py imports train.py for the shared feature list and price conversion
COPY app.py predictor.py train.py ./
COPY templates/ templates/
COPY static/ static/
COPY models/ models/
COPY data/clean/ data/clean/

# Run as a normal user, not root
RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# 1 worker keeps memory low; 4 threads handle several visitors
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 60 --access-logfile - app:app"]
