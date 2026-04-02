FROM ghcr.io/csdougan/baseos:1.0
ARG IMAGE_VERSION="0.0.3"
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y pandoc tidy && rm -rf /var/lib/apt/lists/*
COPY . .

# Expose port
EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
