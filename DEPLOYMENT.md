# Развертывание VideoPlatform на Linux VPS

## Требования

- Linux VPS с Docker и Docker Compose
- Открытые порты 80 и 443
- Минимум 1GB RAM
- Домен, указывающий на ваш сервер

## Быстрое развертывание с доменом и SSL

1. **Клонируйте репозиторий:**
   ```bash
   git clone <your-repo-url>
   cd videoplatform
   ```

2. **Настройте домен и SSL:**
   ```bash
   sudo ./setup-ssl.sh
   ```

3. **Следуйте инструкциям скрипта** - введите ваш домен и email


## Настройка DNS

Перед запуском `setup-ssl.sh` убедитесь, что:

1. **A-запись** вашего домена указывает на IP вашего сервера
2. **CNAME-запись** `www` указывает на ваш домен
3. DNS изменения применились (может занять до 24 часов)

Пример DNS записей:
```
A    example.com        → YOUR_SERVER_IP
CNAME www.example.com   → example.com
```

## Структура файлов

```
videoplatform/
├── docker-compose.yml              # Продакшен с nginx и SSL
├── nginx.conf                      # Конфигурация nginx
├── setup-ssl.sh                    # Автоматическая настройка SSL
└── update-ssl.sh                   # Обновление SSL сертификатов
```

## Управление

```bash
# Остановка
docker-compose down

# Перезапуск
docker-compose restart

# Логи
docker-compose logs -f

# Обновление SSL сертификатов
sudo ./update-ssl.sh
```

## Автоматическое обновление SSL

SSL сертификаты автоматически обновляются каждые 12 часов через встроенный контейнер `certbot-renewal` в Docker Compose. Никаких дополнительных настроек не требуется!

Если нужно обновить сертификаты вручную:
```bash
sudo ./update-ssl.sh
```

## Безопасность

- ✅ Let's Encrypt SSL сертификаты
- ✅ Автоматический редирект HTTP → HTTPS
- ✅ Nginx reverse proxy
- ✅ Приложение запускается от непривилегированного пользователя
- ✅ Docker network изоляция

## Мониторинг

```bash
# Статус всех контейнеров
docker-compose ps

# Использование ресурсов
docker stats

# Логи nginx
docker-compose logs nginx

# Логи приложения
docker-compose logs videoplatform
```

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
docker-compose exec nginx nginx -t

# Перезапустить nginx
docker-compose restart nginx
```

### Проблемы с доменом
```bash
# Проверить DNS
nslookup your-domain.com
dig your-domain.com
```
