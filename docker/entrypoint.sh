#!/bin/sh

if [ "$ENABLE_SSL" = "true" ]; then
    SSL_LISTEN="listen 443 ssl;"
    SSL_CONFIG=$(
        cat <<EOF
ssl_certificate /etc/nginx/ssl/cert.pem;
ssl_certificate_key /etc/nginx/ssl/key.pem;
EOF
    )
else
    SSL_LISTEN=""
    SSL_CONFIG=""
fi

export SSL_LISTEN SSL_CONFIG

envsubst '${SSL_LISTEN} ${SSL_CONFIG}' </etc/nginx/nginx.conf.template >/etc/nginx/nginx.conf

envsubst </usr/share/nginx/html/index.html >/usr/share/nginx/html/index.html.tmp
mv /usr/share/nginx/html/index.html.tmp /usr/share/nginx/html/index.html

nginx -g "daemon off;"
