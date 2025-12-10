# 🚀 Быстрый старт VideoPlatform

## 1. Подготовка сервера

### Требования:
- Linux VPS (Ubuntu/Debian)
- Docker и Docker Compose
- Открытые порты 80 и 443
- Домен, указывающий на ваш сервер

### Установка Docker:
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## 2. Настройка DNS

В панели управления вашего домена создайте записи:

```
A    example.com        → YOUR_SERVER_IP
CNAME www.example.com   → example.com
```

## 3. Развертывание

```bash
# Клонируйте репозиторий
git clone <your-repo-url>
cd videoplatform

# Настройте домен и SSL
sudo ./setup-ssl.sh
```

Скрипт попросит ввести:
- Ваш домен (например: `example.com`)
- Ваш email для Let's Encrypt

## 4. Готово! 🎉

Ваше приложение доступно по адресу:
**https://your-domain.com**

## Управление

```bash
# Остановка
sudo docker-compose down

# Перезапуск
sudo docker-compose restart

# Логи
sudo docker-compose logs -f

# Обновление SSL
sudo ./update-ssl.sh
```

## Автоматическое обновление SSL

SSL сертификаты автоматически обновляются каждые 12 часов через встроенный контейнер в Docker Compose. Никаких дополнительных настроек не требуется!

## Troubleshooting

### Проблемы с SSL
```bash
# Проверить сертификаты
sudo certbot certificates

# Принудительное обновление
sudo ./update-ssl.sh
```

### Проблемы с nginx
```bash
# Проверить конфигурацию
sudo docker-compose exec nginx nginx -t

# Перезапустить nginx
sudo docker-compose restart nginx
```

### Проблемы с доменом
```bash
# Проверить DNS
nslookup your-domain.com
dig your-domain.com
```
