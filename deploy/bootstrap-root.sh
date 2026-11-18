#!/usr/bin/env bash
# CRAZYSHOOT 一次性 root 引导脚本
# 只做：静态目录 + Nginx vhost + Let's Encrypt 证书 + reload。
# 不碰其他站点，不写任何密码/密钥。可重复执行。
set -euo pipefail

DOMAIN="crazyshoot.haokee.org"
ROOT="/var/www/crazyshoot"
WEB="$ROOT/current"
AVAILABLE="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 运行：sudo bash $0" >&2
  exit 1
fi

if ! id haokee >/dev/null 2>&1; then
  echo "找不到 haokee 用户" >&2
  exit 1
fi

echo "==> 创建静态目录"
install -d -o haokee -g www-data -m 2775 "$ROOT" "$ROOT/releases" "$ROOT/shared"
install -d -o haokee -g www-data -m 2775 "$WEB"

if [ ! -f "$WEB/index.html" ]; then
  cat > "$WEB/index.html" <<'HTML'
<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRAZYSHOOT // 部署中</title>
<style>
body{margin:0;background:#0b0e11;color:#e6efec;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;display:grid;place-items:center;min-height:100vh}
.box{text-align:center;border:1px solid rgba(230,239,236,.14);padding:42px 52px;background:#0e1317}
.k{font-size:11px;letter-spacing:.28em;color:#35e0d0}.t{font-size:42px;letter-spacing:.08em;margin:12px 0}.s{font-size:12px;color:#819095;letter-spacing:.12em}
</style></head><body><div class="box"><div class="k">CRAZYSHOOT // BOOTSTRAP</div><div class="t">CRAZYSHOOT</div><div class="s">系统在线 · 资源同步中</div></div></body></html>
HTML
  chown haokee:www-data "$WEB/index.html"
  chmod 644 "$WEB/index.html"
fi

mkdir -p "$WEB/.well-known/acme-challenge"
chown -R haokee:www-data "$WEB/.well-known"
chmod -R 755 "$WEB/.well-known"

backup_if_exists() {
  if [ -f "$AVAILABLE" ]; then
    cp -a "$AVAILABLE" "$AVAILABLE.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

write_http_only() {
  cat > "$AVAILABLE" <<EOF
# CRAZYSHOOT — HTTP only bootstrap (ACME + fallback)
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $WEB;
    index index.html;
    server_tokens off;
    client_max_body_size 2m;

    location ^~ /.well-known/acme-challenge/ {
        root $WEB;
        default_type text/plain;
        try_files \$uri =404;
    }

    location = /healthz {
        default_type text/plain;
        return 200 "ok\n";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
}

write_full() {
  cat > "$AVAILABLE" <<EOF
# CRAZYSHOOT — managed by deploy/bootstrap-root.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        root $WEB;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    root $WEB;
    index index.html;
    server_tokens off;
    client_max_body_size 2m;

    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml application/wasm model/gltf-binary;
    gzip_min_length 1024;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location = /healthz {
        default_type text/plain;
        return 200 "ok\n";
    }

    location /signal {
        proxy_pass http://127.0.0.1:18789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
}

backup_if_exists
echo "==> 写入 HTTP vhost（先保证 ACME/确认页可用）"
write_http_only
ln -sfn "$AVAILABLE" "$ENABLED"
nginx -t
systemctl reload nginx
echo "    HTTP vhost 已启用"

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "==> 申请 Let's Encrypt 证书"
  if certbot certonly --webroot -w "$WEB" -d "$DOMAIN" \
      --non-interactive --agree-tos --keep-until-expiring \
      --deploy-hook "systemctl reload nginx"; then
    echo "    证书申请成功"
  else
    echo "!! 证书申请失败。" >&2
    echo "   常见原因：Cloudflare 代理强制 HTTPS / WAF 拦截 /.well-known；" >&2
    echo "   可临时把 Cloudflare SSL 模式设为 Flexible 或关闭 Always Use HTTPS 后重跑本脚本。" >&2
    echo "   当前 HTTP vhost 已保留，Cloudflare Flexible 模式下网站仍可访问。" >&2
    exit 2
  fi
fi

echo "==> 写入完整 HTTPS vhost"
write_full
nginx -t
systemctl reload nginx
echo "==> 完成：https://$DOMAIN"
echo "    静态目录：$WEB"
echo "    信令反代：/signal → 127.0.0.1:18789"
