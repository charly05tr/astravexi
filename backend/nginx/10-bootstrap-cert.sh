#!/bin/sh
# Runs before nginx starts. The HTTPS server block needs a certificate file to exist, but certbot can only
# issue one once nginx serves the ACME challenge on port 80. Break the cycle with a temporary self-signed
# cert; the README explains how to replace it with the real one. Also reloads nginx periodically so renewed
# certs are picked up.
set -e

live="/etc/letsencrypt/live/${DOMAIN}"
if [ ! -f "${live}/fullchain.pem" ]; then
  echo "bootstrap-cert: no certificate for ${DOMAIN}, creating a temporary self-signed one"
  mkdir -p "${live}"
  openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
    -keyout "${live}/privkey.pem" -out "${live}/fullchain.pem" -subj "/CN=${DOMAIN}"
fi

(while :; do sleep 6h; nginx -s reload; done) &
