#!/bin/sh

if [ "$ENABLE_SSL" = "true" ]; then
    envsubst '${ENABLE_SSL}' </etc/nginx/nginx.conf.template >/etc/nginx/nginx.conf
else
    sed '/{% if $ENABLE_SSL == "true" %}/,/{% endif %}/d' /etc/nginx/nginx.conf.template >/etc/nginx/nginx.conf
fi

envsubst < /usr/share/nginx/html/index.html > /usr/share/nginx/html/index.html.tmp
mv /usr/share/nginx/html/index.html.tmp /usr/share/nginx/html/index.html

nginx -g "daemon off;"
