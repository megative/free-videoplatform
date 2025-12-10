#!/bin/bash

# АВТОМАТИЧЕСКАЯ НАСТРОЙКА SSL - РАБОТАЕТ С ПЕРВОГО РАЗА

echo "🚀 АВТОМАТИЧЕСКАЯ НАСТРОЙКА SSL ДЛЯ VIDEOPLATFORM"
echo "   Скрипт сам все сделает - просто введите домен и email"
echo ""

# Проверяем root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите с sudo: sudo ./setup-ssl.sh"
    exit 1
fi

# Проверяем и устанавливаем Docker если нужно
if ! command -v docker &> /dev/null; then
    echo "🐳 Docker не найден. Устанавливаем..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker установлен"
fi

# Проверяем docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo "🔧 Docker Compose не найден. Устанавливаем..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose установлен"
fi

# Запрашиваем домен
read -p "🌐 Домен (например: example.com): " DOMAIN
read -p "📧 Email для Let's Encrypt: " EMAIL

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Домен и email обязательны!"
    exit 1
fi

echo ""
echo "🔧 Настраиваем SSL для $DOMAIN..."

# Создаем .env
cat > .env << EOF
DOMAIN=$DOMAIN
EMAIL=$EMAIL
EOF

# Создаем директории
mkdir -p /var/www/certbot

# Останавливаем все
echo "⏹️  Останавливаем существующие контейнеры..."
docker-compose down 2>/dev/null || true

# ЭТАП 1: Создаем временный nginx БЕЗ SSL для получения сертификатов
echo "🔨 ЭТАП 1: Запускаем временную HTTP версию..."

# Заменяем YOUR_DOMAIN на реальный домен в оригинальном конфиге
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx.conf

# Сохраняем оригинальный nginx.conf
cp nginx.conf nginx.conf.ssl-backup 2>/dev/null || true

# Создаем временный nginx БЕЗ SSL
cat > nginx.conf << TEMP_EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # ACME challenge для Let's Encrypt
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    # Приложение
    location / {
        proxy_pass http://videoplatform:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://videoplatform:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
TEMP_EOF

# Запускаем HTTP версию
docker-compose up -d videoplatform nginx

# Ждем запуска
echo "⏱️  Ждем запуска nginx (10 сек)..."
sleep 10

# Проверяем что nginx запустился
if ! docker-compose ps | grep -q "nginx.*Up"; then
    echo "❌ Nginx не запустился! Логи:"
    docker-compose logs nginx
    exit 1
fi

echo "✅ HTTP версия запущена успешно"

# ЭТАП 2: Получаем сертификаты
echo "🔒 ЭТАП 2: Получаем SSL сертификаты от Let's Encrypt..."
docker-compose run --rm certbot

# Проверяем что сертификаты получены
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "❌ Сертификаты НЕ получены!"
    echo ""
    echo "🔍 Возможные причины:"
    echo "   1. DNS записи для $DOMAIN не указывают на этот сервер ($(curl -s https://api.ipify.org))"
    echo "   2. Порт 80 заблокирован фаерволом хостера"
    echo "   3. Домен недоступен из интернета"
    echo "   4. Превышен лимит попыток Let's Encrypt (нужно подождать час)"
    echo ""
    echo "🛠️  Для диагностики выполните:"
    echo "   dig +short A $DOMAIN"
    echo "   curl -I http://$DOMAIN/.well-known/acme-challenge/test"
    echo ""
    
    # Восстанавливаем оригинальный конфиг если есть
    if [ -f "nginx.conf.ssl-backup" ]; then
        mv nginx.conf.ssl-backup nginx.conf
    fi
    exit 1
fi

echo "✅ SSL сертификаты получены успешно!"

# ЭТАП 3: Переключаемся на полную SSL версию
echo "🔄 ЭТАП 3: Настраиваем финальную версию с SSL..."

# Создаем финальный nginx.conf с SSL
cat > nginx.conf << FINAL_EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # ACME challenge (для обновления сертификатов)
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
        try_files \$uri =404;
    }

    # Редирект на HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN www.$DOMAIN;

    # SSL сертификаты Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # WebRTC и приложение
    location / {
        proxy_pass http://videoplatform:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.IO поддержка
    location /socket.io/ {
        proxy_pass http://videoplatform:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
FINAL_EOF

# Перезапускаем с SSL конфигом
docker-compose up -d --force-recreate

# ЭТАП 4: Настраиваем автообновление сертификатов
echo "🔄 ЭТАП 4: Настраиваем автообновление сертификатов..."
docker-compose up -d certbot-renewal

# Удаляем временные файлы
rm -f nginx.conf.ssl-backup

echo ""
echo "🎉 ГОТОВО! SSL настроен автоматически!"
echo ""
echo "🌐 Ваш сайт теперь доступен:"
echo "   - https://$DOMAIN"
echo "   - https://www.$DOMAIN"
echo ""
echo "📊 Статус всех сервисов:"
docker-compose ps
echo ""
echo "🔧 Команды для управления:"
echo "   docker-compose down        # Остановить все"
echo "   docker-compose logs -f     # Посмотреть логи"
echo "   docker-compose restart     # Перезапустить"
echo ""
echo "✅ Сертификаты будут автоматически обновляться каждые 12 часов"
