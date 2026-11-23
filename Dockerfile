FROM python:3.13-slim
WORKDIR /app

COPY requirements.txt .
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir -r requirements.txt \
 && python -m pip uninstall -y pip

COPY backend.py index.html ./
COPY static ./static

# Mount a Coolify volume at /data for database persistence
VOLUME /data
ENV DB_PATH=/data/checkins.db

EXPOSE 8000

# Single worker avoids SQLite write contention; threads handle concurrency
CMD ["gunicorn", "backend:app", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4"]
