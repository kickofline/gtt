FROM python:3.13-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend.py barcode-checkin.html ./

# Mount a Coolify volume at /data for database persistence
VOLUME /data
ENV DB_PATH=/data/checkins.db

EXPOSE 8000

# Single worker avoids SQLite write contention; threads handle concurrency
CMD ["gunicorn", "backend:app", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "4"]
