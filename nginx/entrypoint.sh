#!/bin/sh
# zmail nginx 入口：根据 ./certs/ 是否有正式证书自动选择 HTTPS / HTTP 配置。
# - 存在 fullchain.pem + privkey.pem  -> 使用 HTTPS（443 + 80 跳转）
# - 否则                              -> 使用 HTTP（仅 80），保证 compose up 即可访问
set -e

if [ -f /etc/nginx/certs/fullchain.pem ] && [ -f /etc/nginx/certs/privkey.pem ]; then
  cp /nginx-conf/https.conf /etc/nginx/conf.d/default.conf
  echo "[zmail-nginx] 检测到 TLS 证书，启用 HTTPS (:443 + :80->443)"
else
  cp /nginx-conf/http.conf /etc/nginx/conf.d/default.conf
  echo "[zmail-nginx] 未检测到 TLS 证书（./certs/ 中缺少 fullchain.pem / privkey.pem），启用 HTTP (:80)。"
  echo "[zmail-nginx] 部署正式环境：把证书放入 ./certs/ 后执行 docker compose up -d --force-recreate nginx 即可切换 HTTPS。"
fi

exec /docker-entrypoint.sh nginx -g 'daemon off;'
