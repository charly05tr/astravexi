FROM nginx:stable

# openssl creates the temporary self-signed cert on first run (see 10-bootstrap-cert.sh).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy and chmod here so the script stays executable even when git on Windows drops the mode bit.
COPY 10-bootstrap-cert.sh /docker-entrypoint.d/10-bootstrap-cert.sh
RUN chmod +x /docker-entrypoint.d/10-bootstrap-cert.sh
