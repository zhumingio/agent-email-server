#!/bin/sh
# 自签名证书（内网 / 无法用 HTTP-01 校验时的兜底方案）
# 浏览器不会信任自签证书（仍会告警），适合内网临时使用；正式环境请用 issue-cert.sh。
# 用法：./scripts/gen-selfsigned.sh <域名或主机名> [额外 SAN，逗号分隔]
#   例：./scripts/gen-selfsigned.sh mgmt.example.com IP:192.168.200.5,DNS:localhost
# 生成后重启 nginx 生效；浏览器需手动信任一次才能消除告警。
set -e
cd "$(dirname "$0")/.."

NAME="${1:-${ZMAIL_DOMAIN:-mail.example.com}}"
EXTRA="${2:-}"
SAN="DNS:$NAME"
[ -n "$EXTRA" ] && SAN="$SAN,$EXTRA"

if ! command -v openssl >/dev/null 2>&1; then
  echo "未找到 openssl，请先安装（apt install openssl）" >&2
  exit 2
fi

mkdir -p certs
echo "生成自签名证书: CN=$NAME  SAN=$SAN  (3650 天)"
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout certs/privkey.pem -out certs/fullchain.pem \
  -subj "/CN=$NAME" -addext "subjectAltName=$SAN"

chmod 600 certs/privkey.pem
chmod 644 certs/fullchain.pem
openssl x509 -in certs/fullchain.pem -noout -subject -dates

docker compose up -d --force-recreate nginx
echo "完成：https://$NAME:${ZMAIL_HTTPS_PORT:-22345}/（自签证书需手动信任）"
