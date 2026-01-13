FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Generate initial dashboard
RUN python generate_dashboard.py || true

EXPOSE 8082

CMD ["python", "ais_integration.py"]
