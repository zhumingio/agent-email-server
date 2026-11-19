#!/bin/sh
# 首次申请 Let's Encrypt 证书（HTTP-01 / webroot）
# 前置条件：域名 A 记录已指向本机，且公网 80 端口能访问到本机的 nginx。
# 用法：./scripts/issue-cert.sh <域名> <邮箱>
#   例：./scripts/issue-cert.sh mgmt.example.com admin@example.com
# 续期：docker compose --profile acme up -d certbot
set -e
cd "$(dirname "$0")/.."

DOMAIN="${1:-${ZMAIL_DOMAIN:-}}"
EMAIL="${2:-${ACME_EMAIL:-}}"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "用法: $0 <域名> <邮箱>" >&2
  exit 2
fi

mkdir -p data/acme-webroot certs
# 先确保 nginx 在运行（ACME 校验从 :80 的 /.well-known/acme-challenge/ 读取）
docker compose up -d nginx

echo "[1/3] 申请证书: $DOMAIN"
docker compose --profile acme run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive \
  --keep-until-expiring

echo "[2/3] 同步证书到 nginx 读取路径"
docker compose --profile acme run --rm certbot sh -c \
  "cp -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/letsencrypt/fullchain.pem && \
   cp -f /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/letsencrypt/privkey.pem && \
   chmod 600 /etc/letsencrypt/privkey.pem"

echo "[3/3] 重建 nginx 以启用 HTTPS"
docker compose up -d --force-recreate nginx
echo "完成：https://$DOMAIN:${ZMAIL_HTTPS_PORT:-22345}/"
echo "提醒：compose 的 ZMAIL_DOMAIN 应设为同一域名，否则 :80 跳转目标会不对。"
