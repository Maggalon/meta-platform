# Общий Nginx Proxy Manager для нескольких сайтов

Один NPM принимает HTTP/HTTPS всех доменов. Сайты подключаются к общей Docker-сети `proxy` под разными DNS-псевдонимами: `meta-education:3000`, `first-site:3000` и т. д. Одинаковые внутренние порты не конфликтуют. Базы данных остаются в сетях своих проектов.

## 1. Запустите NPM рядом с действующим Nginx

На VPS под своим SSH-пользователем:

```sh
sudo install -d -m 750 -o "$USER" -g "$(id -gn)" /opt/nginx-proxy-manager
docker network inspect proxy >/dev/null 2>&1 || docker network create proxy
```

Это обычная bridge-сеть без публикации портов приложений. `external: true` в Compose означает, что сеть общая и создана отдельно; это не открывает её в интернет. Не создавайте `proxy` с `--internal`: приложению нужен исходящий доступ к Yandex, а NPM — к Let's Encrypt. Подключайте к ней только доверенные приложения. [Сети Compose](https://docs.docker.com/compose/how-tos/networking/).

На компьютере, из каталога проекта в PowerShell:

```powershell
scp -i "$env:USERPROFILE\.ssh\id_ed25519" deploy/proxy/compose.yaml USER@SERVER_IP:/opt/nginx-proxy-manager/compose.yaml
```

Замените путь к ключу, пользователя и IP. На VPS предварительно запустите NPM на свободных локальных портах, пока установленный Nginx продолжает занимать 80/443:

```sh
cd /opt/nginx-proxy-manager
NPM_BIND_IP=127.0.0.1 NPM_HTTP_PORT=8080 NPM_HTTPS_PORT=8443 docker compose up -d --wait --wait-timeout 180
```

Если 8080/8443 заняты, выберите другие временные порты и используйте их при проверке ниже. Панель NPM привязана к `127.0.0.1:81`. Если 81 уже занят, поменяйте его host-порт в Compose и адрес назначения SSH-туннеля.

На компьютере откройте туннель и оставьте его работающим:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" -N -L 8181:127.0.0.1:81 USER@SERVER_IP
```

Откройте [панель NPM](http://localhost:8181), создайте администратора с действующим email и своим паролем. Управление доступно только через SSH; публично порт 81 открывать не требуется. NPM использует встроенную SQLite, данные и сертификаты сохраняются в Docker volumes. [Установка NPM](https://nginxproxymanager.com/setup/).

## 2. Подготовьте маршрут первого сайта

Посмотрите имя работающего контейнера и его внутренний порт:

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Например, для отображения `127.0.0.1:3001->3000/tcp` внутренний порт — **3000**. Подключите существующий контейнер к сети без перезапуска, заменив `EXISTING_CONTAINER` его именем:

```sh
docker network connect --alias first-site proxy EXISTING_CONTAINER
```

Если он уже подключён, повторять команду не нужно. В NPM создайте **Proxy Host** для домена первого сайта: Scheme `http`, Forward Hostname `first-site`, Forward Port — его внутренний порт. Сначала сохраните без SSL. Если прежний Nginx обслуживал дополнительные пути, например отдельный `/api`, перенесите эти маршруты в Custom Locations соответствующего Proxy Host.

Проверьте маршрут на VPS, подставив действующий домен:

```sh
curl -I -H 'Host: first-site.example.ru' http://127.0.0.1:8080/
```

Ответ должен соответствовать вашему сайту, без 502. Если Meta Education уже работает по прежней схеме, аналогично подключите её контейнер с `--alias meta-education` и заранее добавьте маршрут `meta-education:3000` по [инструкции платформы](VPS.md#3-добавьте-домен-meta-education-в-npm).

Сохраните подключение **в Compose первого сайта и его репозитории**, чтобы оно переживало обновления через CI/CD. Добавьте сеть к существующему web-сервису, сохранив его остальные сети. Пример фрагмента для сервиса `web`, который сейчас использует `default`:

```yaml
services:
  web:
    networks:
      default:
      proxy:
        aliases:
          - first-site

networks:
  default:
  proxy:
    external: true
    name: proxy
```

Сохраните текущие `image`/`build`, volumes, окружение и параметры БД. Приложение внутри контейнера должно слушать `0.0.0.0`, а не только `127.0.0.1`. После переключения уберите у web-сервиса публикацию `ports`, оставив внутренний порт, и примените Compose этого сайта. Не удаляйте публикацию раньше, если её пока использует старый Nginx. Meta Education уже настроена так в `compose.production.yaml`.

## 3. Передайте NPM порты 80/443 и включите SSL

У всех переносимых доменов `A` должна указывать на IPv4 VPS. Приведённый Compose публикует IPv4; не оставляйте `AAAA` без отдельно настроенного IPv6. Входящие TCP 80/443 должны быть доступны из интернета; исходящий HTTPS — разрешён.

Переключение требует короткого технического перерыва: оба прокси не могут одновременно слушать одни и те же 80/443. Когда маршруты подготовлены и проверены, на VPS:

```sh
sudo systemctl stop nginx
cd /opt/nginx-proxy-manager
docker compose up -d --wait --wait-timeout 180
```

Без временных переменных Compose переносит NPM на 80/443, сохраняя его настройки. В SSL-вкладке каждого Proxy Host запросите **новый сертификат Let's Encrypt**, примите условия и включите **Force SSL**, **HTTP/2 Support**. До выпуска сертификатов HTTPS переносимых сайтов может быть недоступен. Если Meta Education ещё не развёрнута, продолжите [настройку платформы](VPS.md#2-задайте-настройки-приложения-и-yandex).

NPM автоматически продлевает свои сертификаты; отдельный cron или Certbot на хосте для них не нужен. Для стандартной HTTP-проверки оставляйте порт 80 доступным и DNS актуальным. Импортированный вручную сертификат автоматически не продлевается — для этой схемы заказывайте сертификаты через NPM. [Продление в NPM](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/v2.15.1/backend/internal/certificate.js), [проверка Let's Encrypt](https://letsencrypt.org/docs/challenge-types/).

Проверьте оба сайта по HTTPS. После успешного переключения отключите автозапуск прежнего Nginx:

```sh
sudo systemctl disable nginx
```

Если хостовый `certbot.timer` обслуживал только эти перенесённые домены, отключите его: `sudo systemctl disable --now certbot.timer`. При установке Certbot через snap/cron отключите соответствующее старое задание вместо systemd-таймера. Старые конфиги и сертификаты пока сохраните.

Если переключение не удалось, верните NPM на временные порты и запустите прежний Nginx:

```sh
cd /opt/nginx-proxy-manager
NPM_BIND_IP=127.0.0.1 NPM_HTTP_PORT=8080 NPM_HTTPS_PORT=8443 docker compose up -d --wait --wait-timeout 180
sudo systemctl start nginx
```

Это возвращает прежнюю схему, пока старые конфиги и публикации портов первого сайта сохранены.

## Новые сайты и обслуживание

Для следующего сайта: отдельный Compose-проект → сеть `proxy` с уникальным псевдонимом → Proxy Host с доменом и внутренним портом → сертификат Let's Encrypt. Используйте уникальные имена вроде `first-site`, а не общий `app`. Дополнительные внешние порты для сайтов не нужны.

Логи прокси: `docker compose -f /opt/nginx-proxy-manager/compose.yaml logs --tail=100 proxy-manager`. Версия NPM закреплена в Compose; обновляйте её отдельно от приложений. В резервные копии включайте оба volume: `nginx-proxy-manager_npm-data` (в том числе SQLite) и `nginx-proxy-manager_letsencrypt`. Для согласованной файловой копии SQLite остановите NPM на время копирования или используйте SQLite backup. `down -v` удаляет настройки и сертификаты — для обновления используйте `up -d`.
