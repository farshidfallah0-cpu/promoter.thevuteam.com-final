FROM python:3.11-slim

WORKDIR /app
COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app /app

ENV SERVICE_ACCOUNT_JSON_PATH=/secrets/sa.json

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
