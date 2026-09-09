# CI/CD через GitHub: VPS с существующим Nginx и Yandex Object Storage

Эта инструкция заменяет схему с отдельным Caddy. Установленный на VPS Nginx продолжает обслуживать текущий сайт. Для платформы добавляется отдельный домен, например `ege.example.ru`, и отдельный server block.

```text
PR в main → типы + тесты с Postgres + сборка без публикации
push в main → проверки → Docker-образ в GHCR → SSH → обновление приложения

Интернет → существующий Nginx :443
              ├─ старый домен → существующий сайт
              └─ ege.example.ru → 127.0.0.1:33000 → контейнер Meta Education
                                                    ├─ Postgres в Docker
                                                    └─ закрытый бакет Yandex
```

Production Compose содержит только `app` и `postgres`. Он не занимает 80/443; приложение публикуется только на loopback. CI не изменяет Nginx и не перезапускает другие сайты. Релиз использует точный digest образа вместо изменяемого тега `latest`.

## 1. Проверьте сервер и домен

Нужны Docker, Compose v2 с `up --wait`, Bash, `flock` из util-linux, SSH и Nginx на хосте. Команды создания пользователя и пути Nginx ниже приведены для Ubuntu/Debian.

```sh
docker --version
docker compose version
docker compose up --help
command -v bash flock
uname -m
sudo nginx -t
sudo ss -ltnp
```

Workflow собирает `linux/amd64` для VPS с `uname -m = x86_64`. Для ARM64 замените `runs-on` в job `image` на доступный вашему репозиторию ARM runner, например `ubuntu-24.04-arm`, и `platforms` на `linux/arm64`. См. [доступные GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Убедитесь, что локальный TCP-порт **33000** свободен. Если занят, одинаково измените `APP_PORT` и `proxy_pass` в Nginx. Открывать 33000 и 5432 во внешнем firewall не нужно. SSH должен быть доступен GitHub-hosted runner; при ограничении SSH по IP потребуется подходящая сеть/VPN для runner.

Создайте DNS-запись `A`: `ege.example.ru` → IPv4 VPS. Шаблон Nginx ниже рассчитан на IPv4. Уберите `AAAA` этого домена, пока не настроите для него IPv6: потребуется соответствующий `listen [::]:80` и HTTPS-listener в новом server block. На первом запуске используйте прямой DNS без CDN-прокси. HTTPS обязателен для production-сессии.

## 2. Подготовьте репозиторий

В Git должны попасть `.github/workflows/ci-cd.yml`, `deploy/`, Dockerfile, Compose и исходники. Секретные env-файлы, дампы и рабочие данные исключены через `.gitignore`. Для нового репозитория, в каталоге проекта:

```sh
git init -b main
git add .
git status --short
git commit -m "Add platform and GitHub deployment"
git remote add origin git@github.com:OWNER/REPOSITORY.git
```

Замените `OWNER/REPOSITORY`. Если Git уже настроен, используйте существующие репозиторий и remote. **Push выполните после настройки VPS и Secrets:** push в `main` запускает деплой. Для другой основной ветки замените `main` во всех условиях workflow и в проверке текущего коммита.

## 3. Подготовьте пользователя и SSH

На VPS под администратором:

```sh
sudo adduser --disabled-password --gecos "" meta-education-deploy
sudo usermod -aG docker meta-education-deploy
sudo install -d -m 750 -o meta-education-deploy -g meta-education-deploy /opt/meta-education
sudo install -d -m 700 -o meta-education-deploy -g meta-education-deploy /home/meta-education-deploy/.ssh
sudo -u meta-education-deploy touch /home/meta-education-deploy/.ssh/authorized_keys
sudo chmod 600 /home/meta-education-deploy/.ssh/authorized_keys
```

Группа `docker` фактически даёт административный доступ к серверу. Используйте отдельный SSH-ключ для workflow и допускайте в `main` только доверенный код.

На компьютере, в **PowerShell**, создайте ключ за пределами репозитория:

```powershell
ssh-keygen -t ed25519 -C "github-actions-meta-education" -f "$env:USERPROFILE\.ssh\meta-education_deploy"
Get-Content "$env:USERPROFILE\.ssh\meta-education_deploy.pub"
```

Для автоматического подключения оставьте passphrase пустой. Публичную строку добавьте в `authorized_keys` нового пользователя, сохранив остальные строки. Приватный файл понадобится только для GitHub Secret. Проверьте новый вход, чтобы применилось членство в группе Docker:

```powershell
ssh -i "$env:USERPROFILE\.ssh\meta-education_deploy" meta-education-deploy@SERVER_IP "docker info --format '{{.ServerVersion}}'"
```

## 4. Сохраните настройки приложения на VPS

Перенесите обновлённый архив из проекта. На компьютере:

```powershell
scp -i "$env:USERPROFILE\.ssh\meta-education_deploy" "D:\Antigravity Projects\meta-platform\meta-education-vps.tar.gz" meta-education-deploy@SERVER_IP:/opt/meta-education/
ssh -i "$env:USERPROFILE\.ssh\meta-education_deploy" meta-education-deploy@SERVER_IP
```

На VPS под `meta-education-deploy`:

```sh
umask 077
mkdir -p /opt/meta-education/bootstrap
tar -xzf /opt/meta-education/meta-education-vps.tar.gz -C /opt/meta-education/bootstrap
cd /opt/meta-education
cp bootstrap/.env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
nano .env.production
```

Если `.env.production` уже существует, редактируйте его, не заменяя шаблоном. Значение из `openssl` используйте только для новой базы: изменение переменной не меняет пароль уже работающего Postgres.

```dotenv
DOMAIN=ege.example.ru
APP_PORT=33000
TRUST_PROXY=true
COMPOSE_PROJECT_NAME=meta-education-production
POSTGRES_USER=meta_education
POSTGRES_DB=meta_education
POSTGRES_PASSWORD=СГЕНЕРИРОВАННАЯ_HEX_СТРОКА
ADMIN_EMAIL=teacher@example.ru
ADMIN_PASSWORD='УНИКАЛЬНЫЙ_ПАРОЛЬ_МИНИМУМ_12_СИМВОЛОВ'
ADMIN_NAME='Ваше имя'
S3_BUCKET=имя-вашего-бакета
S3_ACCESS_KEY_ID=идентификатор-статического-ключа
S3_SECRET_ACCESS_KEY='секретная-часть-ключа'
```

`DOMAIN` — без `https://` и пути; `APP_URL` получается автоматически. `DEMO_MODE=false` задан в Compose. `ADMIN_*` создают первого преподавателя в пустой базе; существующему пользователю пароль меняется в интерфейсе. `APP_IMAGE` сюда не добавляйте: CI записывает его отдельно в каждом релизе.

Yandex: закрытый бакет стандартного класса, сервисный аккаунт с `storage.uploader` на бакет и статический ключ `key_id` / `secret`. Endpoint `https://storage.yandexcloud.net` и регион `ru-central1` уже заданы. [Права Yandex](https://yandex.cloud/ru/docs/storage/security/), [создание ключа](https://yandex.cloud/ru/docs/iam/operations/authentication/manage-access-keys).

Загрузка идёт с сервера и не требует CORS. Скачивание — по подписанному URL на 60 секунд после проверки прав приложением. Не ограничивайте чтение одним IP VPS: ссылку открывает браузер ученика. Бакет остаётся закрытым; временная ссылка даёт доступ получившему её до истечения срока.

## 5. Разрешите VPS скачивать образ из GHCR

Workflow публикует `ghcr.io/owner/repository` через встроенный `GITHUB_TOKEN`. Для скачивания приватного образа на VPS создайте **Personal access token (classic)** с `read:packages` у GitHub-пользователя с доступом к пакету. При SSO авторизуйте токен для организации. [Документация GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Под **тем же `meta-education-deploy`**, без sudo:

```sh
read -rsp 'GHCR read:packages token: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_LOGIN --password-stdin
unset GHCR_TOKEN
chmod 600 ~/.docker/config.json
```

Токен вводится интерактивно. Docker сохраняет авторизацию для будущих `pull`; следите за сроком действия токена. Для публичного пакета логин на VPS не обязателен. При первой публикации пакет по умолчанию приватный и связывается с репозиторием workflow.

## 6. Добавьте новый домен в Nginx

Под администратором VPS добавьте **новый файл**, сохранив конфигурацию текущего сайта. Сначала убедитесь, что имя `meta-education.conf` ещё не используется:

```sh
sudo cp /opt/meta-education/bootstrap/deploy/nginx/meta-education.conf /etc/nginx/sites-available/meta-education.conf
sudo nano /etc/nginx/sites-available/meta-education.conf
sudo ln -s /etc/nginx/sites-available/meta-education.conf /etc/nginx/sites-enabled/meta-education.conf
sudo nginx -t && sudo systemctl reload nginx
```

Замените `ege.example.ru` своим доменом. `proxy_pass http://127.0.0.1:33000` должен совпадать с `APP_PORT`. Если Nginx использует `/etc/nginx/conf.d/*.conf`, поместите файл туда без симлинка и без дублирования server block.

Конфиг передаёт `Host` и протокол, перезаписывает `X-Forwarded-For` через `$remote_addr` для ограничения входов по IP и разрешает файлы до 20 МБ с запасом на multipart. Поэтому `TRUST_PROXY=true` здесь допустим. [Директивы Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).

Настройте HTTPS тем же способом, которым обслуживаете текущий сайт. Если используется Certbot с Nginx:

```sh
sudo certbot --nginx -d ege.example.ru --redirect
sudo nginx -t
```

Выбирайте только новый домен. Если Certbot ещё не установлен и вы выбираете его для нового домена, используйте [инструкцию Certbot для Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap), учитывая уже используемый механизм выпуска и продления сертификатов. До первого деплоя платформа может возвращать 502. После запуска контейнера Nginx начнёт передавать запросы приложению.

Не меняйте владельца портов 80/443 или конфиг основного сайта. `nginx -t` проверяет всю конфигурацию, `reload` применяет её без остановки Nginx. После настройки проверьте оба домена.

## 7. Добавьте GitHub Actions Secrets

В репозитории: **Settings → Secrets and variables → Actions → Secrets → New repository secret**.

| Secret            | Значение                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- |
| `VPS_HOST`        | IPv4 или SSH hostname, без протокола и порта                                          |
| `VPS_USER`        | `meta-education-deploy`                                                               |
| `VPS_SSH_KEY`     | Всё содержимое приватного `meta-education_deploy`, включая BEGIN/END и переносы строк |
| `VPS_KNOWN_HOSTS` | Проверенная строка ключа SSH-сервера в формате known_hosts                            |

Для нестандартного SSH-порта добавьте во вкладке **Variables** переменную `VPS_SSH_PORT`. По умолчанию 22; в командах ручного SSH/scp также укажите свой порт. Переменная `VPS_DEPLOY_PATH` задаёт каталог релизов; по умолчанию `/opt/meta-education`. Для обновления ранее установленной платформы сохраните прежний путь, как описано ниже.

Чтобы получить `VPS_KNOWN_HOSTS`, в PowerShell:

```powershell
ssh-keyscan -p 22 -t ed25519 SERVER_IP | Set-Content -Encoding ascii "$env:USERPROFILE\.ssh\meta-education_vps_known_hosts"
ssh-keygen -lf "$env:USERPROFILE\.ssh\meta-education_vps_known_hosts"
Get-Content "$env:USERPROFILE\.ssh\meta-education_vps_known_hosts"
```

Сравните отпечаток с `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, выполненным через доверенную консоль провайдера или уже проверенное SSH-подключение. Только после совпадения сохраните строку в Secret. Имя/IP должно совпадать с `VPS_HOST`; для нестандартного порта используется `[HOST]:PORT`. Если сервер не использует ed25519, получите действующий тип его ключа. Workflow использует `StrictHostKeyChecking=yes`, без нового доверия к `ssh-keyscan` при каждом деплое.

Пароли приложения, ключи Yandex и GHCR PAT на VPS **не передаются в GitHub**. `GITHUB_TOKEN` GitHub создаёт автоматически; `packages: write` задан только для job сборки. Защитите `main` доступными вашему репозиторию branch rules: PR и успешные `checks`/`image` перед merge. Workflow использует repository Secrets и не зависит от доступности production Environment в тарифе приватного репозитория.

## 8. Запустите CI/CD

```sh
git push -u origin main
```

Откройте **Actions → Meta Education CI/CD**:

1. `checks`: генерация типов, TypeScript, проверки Bash/отката и тесты приложения с отдельным Postgres.
2. `image`: сборка и публикация `ghcr.io/owner/repository:sha-COMMIT`; VPS использует digest.
3. `deploy`: доставка небольшого релиза по SSH, скачивание образа, запуск Postgres при первом развёртывании, дамп базы, замена только `app`.
4. Healthcheck страницы и проверка `/api/data`: без сессии ожидается 401, что также проверяет доступ к базе и отключение деморежима.

Релизы лежат в `/opt/meta-education/releases/COMMIT-RUN-ATTEMPT`; `current` указывает на успешный, `previous` — на предыдущий. При ошибке скачивания образа или создания дампа работающий `app` не заменяется. Если новое приложение не прошло проверку, скрипт пытается вернуть предыдущий контейнер и его Compose-конфигурацию; workflow остаётся красным. При первом CI-деплое предыдущего релиза ещё нет.

При замене единственного контейнера возможен короткий 502 на домене платформы. Другой сайт продолжает работать. При отмене job вручную, потере VPS или принудительном завершении процесса проверьте состояние по SSH: при аварии инфраструктуры автоматический откат не гарантируется.

Откройте `https://ваш-домен`, войдите с `ADMIN_EMAIL`/`ADMIN_PASSWORD`, создайте приглашение и проверьте цепочку задание → файл → сдача → рецензия. CI не обращается к вашему Yandex-бакету и не проверяет публичные DNS/сертификат.

Дальше: ветка → PR → проверки → merge в `main` → деплой. Повторный запуск текущего `main`: **Run workflow**. Если в `main` уже есть новый коммит, устаревший запуск пропускает отправку на VPS.

## 9. Логи и ручной откат

На VPS под `meta-education-deploy` объявите функцию для текущей SSH-сессии:

```sh
deploy_root=/opt/meta-education
cd "$deploy_root"
dc() {
  docker compose --env-file "$deploy_root/.env.production" \
    --env-file "$deploy_root/current/image.env" \
    -f "$deploy_root/current/compose.production.yaml" "$@"
}
dc ps
dc logs --tail=100 app
curl -I http://127.0.0.1:33000/
curl -I https://ege.example.ru/
```

Если первый деплой не завершился и `current` ещё нет, замените его в команде конкретным `releases/COMMIT-RUN-ATTEMPT` из лога Actions. Ручной откат:

```sh
previous_release=$(basename "$(readlink -f "$deploy_root/previous")")
bash "$deploy_root/current/deploy/activate.sh" "$deploy_root" "$previous_release"
```

Скрипт создаёт дамп и активирует выбранный релиз. Следующий push опять развернёт `main`, поэтому постоянное исправление делайте через `git revert`/PR. Откат возвращает приложение, **не откатывая данные**. Изменения схемы должны быть совместимы с предыдущей версией; восстановление базы — отдельная операция с учётом новых работ учеников.

После изменения `.env.production`: `dc up -d --no-deps --wait app`. `restart` не применяет новые env. Смена `POSTGRES_PASSWORD` у существующей базы требует отдельной смены пароля в Postgres. Обновление самого Postgres и Nginx выполняется отдельно от CI приложения.

## 10. Резервные копии

Перед каждым деплоем создаётся `/opt/meta-education/backups/*.dump`. Дополнительная копия вручную, после объявления `dc` выше:

```sh
umask 077
dc exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$deploy_root/backups/manual-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Переносите копии базы за пределы VPS; для файлов настройте резервирование/версионирование Yandex. Дампы перед деплоем не заменяют ежедневное резервирование. Автоматической очистки релизов, образов и дампов нет: контролируйте место и сохраняйте предыдущий образ для отката. Не используйте общий `docker system prune` на сервере с несколькими сайтами и `down -v` для обновления платформы.

## Переход с прежнего названия «Точка»

Для новой установки используйте имена Meta Education из этой инструкции. Если платформа уже развёрнута в `/opt/tochka`, сохраните её ресурсы при обновлении:

1. Сделайте дамп существующей базы. В GitHub Variables задайте `VPS_DEPLOY_PATH=/opt/tochka`; в `VPS_USER` оставьте действующего SSH-пользователя, например `tochka-deploy`, и его ключ. Перемещение каталога и пересоздание пользователя не требуется.
2. В существующем `/opt/tochka/.env.production` сохраните пароли и параметры Yandex и добавьте значения ниже. Они подключают прежний Compose-проект и его volume вместо создания пустой базы:

```dotenv
COMPOSE_PROJECT_NAME=tochka-production
POSTGRES_USER=tochka
POSTGRES_DB=tochka
```

3. Если прежде использовали другой `-p`, пользователя или имя базы, укажите фактические значения. Для ручных команд выше используйте `deploy_root=/opt/tochka`. Скрипт дампа берёт пользователя и базу из окружения контейнера.
4. Существующий Nginx server block продолжает работать с тем же доменом и портом. Не добавляйте второй такой же блок из нового файла `meta-education.conf`: измените уже подключённый конфиг при необходимости.

Служебный префикс SQL-таблиц `tochka_` сохранён как формат хранения данных. Прежние session-cookie и `TOCHKA_DATA_DIR` принимаются для совместимости; новые сессии и настройки используют имена Meta Education. Существующие аккаунты, их email/пароли, бакет и ключи объектов не переименовываются автоматически. Новые демобазы создаются с адресами `@meta-education.demo`.

Если меняете имя GitHub-репозитория на `meta-education`, обновите remote на компьютере и проверьте доступ VPS к новому пакету GHCR. Workflow сам берёт имя образа из `github.repository`; опубликованный ранее пакет остаётся доступным для отката.

Прежний Caddy исключён из новой конфигурации, но существующий контейнер сам не удаляется. Если он действительно запускался, адресно остановите только Caddy этой платформы после настройки Nginx. Не используйте `--remove-orphans` или остановку всех контейнеров. До первого успешного CI-релиза сохраните прежний рабочий образ и Compose: автоматический откат на него ещё не настроен. Выключение деморежима не удаляет демоаккаунты из ранее использованной базы.

## Диагностика

| Симптом                        | Что проверить                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| SSH permission denied          | Пользователь, authorized_keys, приватный Secret, порт, новое подключение после изменения docker group |
| Host key verification failed   | Проверенный VPS_KNOWN_HOSTS, совпадение имени/IP/порта                                                |
| GHCR unauthorized              | Login под meta-education-deploy, срок PAT, read:packages, доступ к пакету и SSO                       |
| Publish image: 403             | Actions/Packages разрешены организацией; существующий пакет связан с репозиторием                     |
| exec format error              | Архитектура VPS и platforms/runner в workflow                                                         |
| Bind 33000 failed              | Порт занят; согласованно измените APP_PORT и proxy_pass                                               |
| 502 у платформы                | dc ps, логи app, локальный порт, завершился ли первый deploy                                          |
| Вход возвращает на форму / 403 | HTTPS, DOMAIN, Host и X-Forwarded-Proto                                                               |
| Не загружается файл            | Ключи/роль/бакет Yandex, исходящий HTTPS, client_max_body_size                                        |
| Диск заполняется               | Релизы, образы и backups; сохраните рабочий и предыдущий релиз при очистке                            |

Текущий MVP рассчитан на одного преподавателя и небольшое учебное пространство; ограничения описаны в README. Дополнительно: [публикация образов в GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [Compose up --wait](https://docs.docker.com/reference/cli/docker/compose/up/).
