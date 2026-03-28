FROM ghcr.io/csdougan/sharkdrown-baseos:1.0
ARG IMAGE_VERSION="1.02"
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Expose port
EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
