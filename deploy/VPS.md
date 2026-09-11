# Meta Education: Docker, Nginx Proxy Manager и GitHub CI/CD

```text
push в main → тесты → сборка образа в GitHub → образ по SSH → запуск на VPS

Интернет → Nginx Proxy Manager :80/:443 → общая Docker-сеть proxy
                                            ├─ meta-education:3000
                                            └─ другие сайты
Meta Education → своя сеть database → Postgres
               → закрытый Yandex Object Storage
```

Nginx Proxy Manager устанавливается один раз на весь сервер и управляет доменами и SSL. CI/CD обновляет только Meta Education. GHCR, токен реестра и каталоги релизов не нужны.

## 1. Подготовьте сервер и общий прокси

Используйте существующего SSH-пользователя, у которого Docker работает **без sudo**. На VPS с Ubuntu/Debian:

```sh
docker info --format '{{.ServerVersion}}'
docker compose version
sudo install -d -m 750 -o "$USER" -g "$(id -gn)" /home/maggalon/meta-education
```

Нужен Compose v2 с `up --wait`. Если нет доступа к Docker: `sudo usermod -aG docker "$USER"`, затем подключитесь заново. Node.js, Git и rsync на VPS не требуются. Сборка Next.js выполняется в GitHub Actions.

**Выполните [однократную настройку Nginx Proxy Manager](PROXY.md)**: создайте сеть `proxy`, подключите первый сайт и перенесите на NPM порты 80/443. Инструкция учитывает, что сейчас их занимает Nginx на сервере. Если NPM уже настроен, используйте его и ту же сеть; второй экземпляр не нужен.

## 2. Задайте настройки приложения и Yandex

На компьютере, в PowerShell **из каталога проекта**, замените `USER`, `SERVER_IP` и путь к своему приватному SSH-ключу:

```powershell
scp -i "$env:USERPROFILE\.ssh\id_ed25519" .env.production.example USER@SERVER_IP:/home/maggalon/meta-education/
```

`id_ed25519` — пример имени существующего ключа, без `.pub`. Для нестандартного SSH-порта добавьте `-P 2222` после `scp`.

На VPS под тем же пользователем:

```sh
cd /home/maggalon/meta-education
cp -n .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
nano .env.production
```

Заполните `DOMAIN` (`meta-edu.ru`, без `https://`), `POSTGRES_PASSWORD` (полученная hex-строка), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` и три переменные `S3_*`. Пароль преподавателя — минимум 12 символов. `ADMIN_*` создают аккаунт только в пустой базе. Для существующей установки сохраните прежние параметры базы и её пароль.

В Yandex Cloud создайте **закрытый бакет**, сервисный аккаунт с ролью `storage.uploader` на этот бакет и статический ключ. Имя бакета → `S3_BUCKET`, `key_id` → `S3_ACCESS_KEY_ID`, `secret` → `S3_SECRET_ACCESS_KEY`. Endpoint и регион уже заданы в Compose. [Права доступа](https://yandex.cloud/ru/docs/storage/security/), [создание ключа](https://yandex.cloud/ru/docs/iam/operations/authentication/manage-access-keys).

Публичный доступ и CORS бакета не требуются: загрузки идут через сервер, скачивания — по временным ссылкам после проверки прав. `.env.production` хранится на VPS вне исходников; пароли и ключи Yandex в GitHub не переносятся.

## 3. Добавьте домен Meta Education в NPM

DNS-запись `A` для `meta-edu.ru` должна указывать на IPv4 VPS. Если IPv6 не настроен, уберите `AAAA`. В панели NPM: **Hosts → Proxy Hosts → Add Proxy Host**:

| Поле                  | Значение                           |
| --------------------- | ---------------------------------- |
| Domain Names          | `meta-edu.ru` — как `DOMAIN` в env |
| Scheme                | `http`                             |
| Forward Hostname / IP | `meta-education`                   |
| Forward Port          | `3000`                             |
| Websockets Support    | Включить                           |
| Cache Assets          | Оставить выключенным               |

Во вкладку **Advanced** вставьте содержимое [meta-education-advanced.conf](proxy/meta-education-advanced.conf):

```nginx
client_max_body_size 22m;
proxy_buffering off;
proxy_read_timeout 60s;
proxy_send_timeout 60s;
```

Лимит учитывает файл до 20 МБ и multipart. Во вкладке **SSL** выберите **Request a new SSL Certificate**, примите условия Let's Encrypt, включите **Force SSL** и **HTTP/2 Support**. В профиле администратора NPM укажите действующий email. NPM сам продлевает выпущенные им сертификаты. До первого деплоя платформа может отвечать 502; выпуск сертификата обслуживает сам NPM.

`meta-education:3000` — адрес внутри Docker. У приложения нет опубликованного порта на VPS, а у Postgres нет подключения к общей сети. `TRUST_PROXY=true` соответствует одному доверенному NPM перед приложением.

## 4. Дайте GitHub доступ по SSH

На компьютере создайте отдельный ключ без passphrase. Для добавления публичной части используйте свой **существующий** ключ входа на VPS:

```powershell
ssh-keygen -t ed25519 -C "github-actions-meta-education" -f "$env:USERPROFILE\.ssh\meta-education_deploy"
Get-Content "$env:USERPROFILE\.ssh\meta-education_deploy.pub" | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" USER@SERVER_IP 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
ssh -i "$env:USERPROFILE\.ssh\meta-education_deploy" USER@SERVER_IP "docker info --format '{{.ServerVersion}}'"
ssh-keyscan -p 22 -t ed25519 SERVER_IP | Set-Content -Encoding ascii "$env:USERPROFILE\.ssh\meta-education_known_hosts"
ssh-keygen -lf "$env:USERPROFILE\.ssh\meta-education_known_hosts"
```

Сравните отпечаток с `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` через доверенное подключение или консоль VPS. При совпадении используйте файл `meta-education_known_hosts` ниже.

В GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret            | Значение                                                               |
| ----------------- | ---------------------------------------------------------------------- |
| `VPS_HOST`        | IP или SSH hostname сервера                                            |
| `VPS_USER`        | SSH-пользователь, которому принадлежит `/home/maggalon/meta-education` |
| `VPS_SSH_KEY`     | Всё содержимое приватного `meta-education_deploy`, включая BEGIN/END   |
| `VPS_KNOWN_HOSTS` | Содержимое проверенного `meta-education_known_hosts`                   |

Для нестандартного SSH-порта добавьте **Variable** `VPS_SSH_PORT` и указывайте порт в ручных командах (`ssh -p`, `scp -P`). Путь текущего VPS закреплён прямо в `.github/workflows/ci-cd.yml`: `DEPLOY_ROOT: /home/maggalon/meta-education`. Переменная GitHub `VPS_DEPLOY_PATH` больше не используется. Для другого сервера измените `DEPLOY_ROOT` на результат `pwd -P` из его каталога проекта. CI передаёт готовый Docker-образ и обновляет только `app/compose.production.yaml`; `.env.production` хранится на уровень выше. Исходники на VPS больше не копируются. Общий прокси находится отдельно, в `/opt/nginx-proxy-manager`.

## 5. Запустите CI/CD

После настройки сервера и Secrets:

```sh
git add .
git commit -m "Use shared Nginx Proxy Manager"
git push -u origin main
```

Репозиторий GitHub должен быть добавлен как `origin`. В **Actions → Meta Education CI/CD** остаются два задания: `checks` проверяет типы, Compose и приложение с отдельной тестовой БД; `deploy` собирает Docker-образ на GitHub runner, передаёт его через `docker save | gzip | SSH → docker load` и запускает `docker compose up -d --no-build --wait` на VPS. В PR production-сборка также проверяется в GitHub. [Загрузка готового образа](https://docs.docker.com/reference/cli/docker/image/load/).

До замены контейнера завершается сборка, после запуска проверяется API с базой данных. Пересоздание одного контейнера может дать короткую паузу у платформы. NPM и первый сайт CI не перезапускает. На VPS нужна память только для работающих сервисов и загрузки образа, а место — для данных и Docker-образов. Сжатый образ передаётся потоком без отдельного архива на диске VPS. После успешного запуска удаляются только неиспользуемые образы Meta Education с меткой `io.meta-education.component=app`; volumes и образы других сайтов не затрагиваются.

После запуска проверьте вход на `https://meta-edu.ru` и загрузку/скачивание файла. CI не использует ваш Yandex-бакет и не проверяет публичный сертификат. Дальше достаточно push в `main`; повторный деплой — **Run workflow** для `main`.

### Переход после зависшей сборки на VPS

Отправьте обновлённые `.github/workflows/ci-cd.yml` и `compose.production.yaml` в `main` и откройте новый запуск, созданный push. Повтор старого запуска использует прежний workflow со сборкой на сервере. Существующие `.env.production`, NPM, сеть `proxy` и volume Postgres сохраняются. Оставшиеся исходники и кеш старой сборки для нового деплоя не нужны; автоматической очистки общего Docker build cache нет.

Задание `deploy` использует `ubuntu-24.04` (`linux/amd64`) и до сборки сверяет архитектуру Docker на VPS. Для ARM64 используйте в этом задании `runs-on: ubuntu-24.04-arm`; конфигурация приложения не меняется. Если архитектуры отличаются, деплой остановится с явной ошибкой до передачи образа.

## Логи и обслуживание

```sh
cd /home/maggalon/meta-education/app
dc() { docker compose --env-file ../.env.production -f compose.production.yaml "$@"; }
dc ps
dc logs --tail=100 app
```

После изменения env: `dc up -d --no-build --wait`. Новая сборка и доставка — push в `main` или **Run workflow**. Не запускайте `next build` или `docker build` на VPS. При ошибке версии — исправление или `git revert` и push. `down` для обновления не нужен; данные Postgres сохраняются.

Резервная копия БД:

```sh
umask 077
dc exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "../backup-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Храните регулярные резервные копии вне VPS. Отдельно сохраняйте данные/сертификаты NPM и файлы Yandex. Изменение `POSTGRES_PASSWORD` в env не меняет пароль существующей базы.

## Переход с прежнего названия «Точка»

Для прежней установки в `/opt/tochka` укажите `DEPLOY_ROOT: /opt/tochka` в workflow, сохраните SSH-пользователя и `.env.production`. Стандартные прежние ресурсы: `COMPOSE_PROJECT_NAME=tochka-production`, `POSTGRES_USER=tochka`, `POSTGRES_DB=tochka`; при других именах используйте фактические. Это сохраняет существующий volume, аккаунты и файлы. Префикс таблиц `tochka_`, прежние cookie и `TOCHKA_DATA_DIR` поддерживаются.

`APP_PORT=33000` больше не используется. Старый Nginx server block заменяется записью `meta-education:3000` в NPM; порядок переключения описан в [PROXY.md](PROXY.md). Прежние `current`, `previous`, `releases` и `image.env` не используются, удалять их для перехода не требуется.
