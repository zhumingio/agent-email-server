#!/bin/sh
# zmail nginx 入口：
#  1) 用 envsubst 渲染域名/端口（ZMAIL_DOMAIN、ZMAIL_HTTPS_PORT）
#  2) 根据 ./certs/ 是否有证书选择 HTTPS / HTTP 配置
#  3) 常驻监视证书变化（certbot / acme.sh 续期后自动 reload，无需重启容器）
set -e

: "${ZMAIL_DOMAIN:=mail.example.com}"
: "${ZMAIL_HTTPS_PORT:=22345}"
export ZMAIL_DOMAIN ZMAIL_HTTPS_PORT

CONF=/etc/nginx/conf.d/default.conf
mkdir -p /var/www/certbot

render() {
  # $1 = 模板路径
  envsubst '${ZMAIL_DOMAIN} ${ZMAIL_HTTPS_PORT}' < "$1" > "$CONF"
}

have_cert() {
  [ -s /etc/nginx/certs/fullchain.pem ] && [ -s /etc/nginx/certs/privkey.pem ]
}

cert_fingerprint() {
  cat /etc/nginx/certs/fullchain.pem /etc/nginx/certs/privkey.pem 2>/dev/null | md5sum | cut -d' ' -f1
}

if have_cert; then
  render /nginx-conf/https.conf
  MODE=https
  echo "[zmail-nginx] 检测到 TLS 证书，启用 HTTPS (:443 + :80 跳转/ACME)，域名=${ZMAIL_DOMAIN} 端口=${ZMAIL_HTTPS_PORT}"
else
  render /nginx-conf/http.conf
  MODE=http
  echo "[zmail-nginx] 未检测到 TLS 证书（./certs/ 缺少 fullchain.pem / privkey.pem），启用 HTTP (:80)。"
  echo "[zmail-nginx] 申请证书：./scripts/issue-cert.sh <域名> <邮箱>；或放自签证书后 docker compose up -d --force-recreate nginx。"
fi

LAST_FP="$(cert_fingerprint)"

# 证书签发/续期后自动切换 + reload
watch_certs() {
  while :; do
    sleep 300 || exit 0
    if have_cert; then
      FP="$(cert_fingerprint)"
      if [ "$MODE" != "https" ]; then
        render /nginx-conf/https.conf
        MODE=https
        echo "[zmail-nginx] 发现新证书，已切换 HTTPS 并 reload"
        nginx -s reload 2>/dev/null || true
      elif [ "$FP" != "$LAST_FP" ]; then
        echo "[zmail-nginx] 证书已更新，reload"
        nginx -s reload 2>/dev/null || true
      fi
      LAST_FP="$FP"
    fi
  done
}

watch_certs &

exec /docker-entrypoint.sh nginx -g 'daemon off;'
