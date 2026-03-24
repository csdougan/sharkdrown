FROM ghcr.io/csdougan/sharkdrown-baseos:1.0
ARG IMAGE_VERSION="1.0"
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt gunicorn
COPY . .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
