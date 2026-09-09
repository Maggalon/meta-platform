#!/usr/bin/env bash
# Invoked by CI over SSH, or manually to activate an existing release.
set -Eeuo pipefail
umask 077

root=$(realpath -e "${1:?Usage: activate.sh DEPLOY_ROOT RELEASE_ID}")
release_id=${2:?Release ID is required}
[[ "$release_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,120}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
release=$(realpath -e "$root/releases/$release_id")
[[ "$release" == "$root/releases/$release_id" ]] || { echo 'Release must be inside DEPLOY_ROOT/releases' >&2; exit 1; }
# Compose reads COMPOSE_PROJECT_NAME from .env.production; existing deployments
# can keep their project/volume identity while new installations use the new name.
if [[ -n "${META_EDUCATION_COMPOSE_PROJECT:-${TOCHKA_COMPOSE_PROJECT:-}}" ]]; then
  export COMPOSE_PROJECT_NAME=${META_EDUCATION_COMPOSE_PROJECT:-$TOCHKA_COMPOSE_PROJECT}
fi
[[ -f "$root/.env.production" && -f "$release/compose.production.yaml" && -f "$release/image.env" ]]
[[ $(wc -l < "$release/image.env") -eq 1 ]]
grep -Eq '^APP_IMAGE=[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$' "$release/image.env"
# Env files are data for Compose, never executable shell scripts.
unset APP_IMAGE COMPOSE_FILE COMPOSE_PROFILES

exec 9>"$root/.deploy.lock"
flock -w 300 9

previous=''
if [[ -L "$root/current" ]]; then
  previous=$(realpath -e "$root/current")
  [[ "$previous" == "$root/releases/"* && -f "$previous/image.env" && -f "$previous/compose.production.yaml" ]]
elif [[ -e "$root/current" ]]; then
  echo 'DEPLOY_ROOT/current must be a release symlink' >&2
  exit 1
fi

compose() {
  local folder=$1
  shift
  docker compose --env-file "$root/.env.production" \
    --env-file "$folder/image.env" -f "$folder/compose.production.yaml" "$@"
}

probe() {
  # Verify PostgreSQL and authorization too: root-page health alone does not use DB.
  compose "$1" exec -T app node -e \
    "fetch('http://127.0.0.1:3000/api/data',{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"
}

atomic_link() {
  local target=$1 name=$2
  ln -s "$target" "$root/.$name.$$"
  mv -Tf "$root/.$name.$$" "$root/$name"
}

changed=0
failure() {
  local status=$1
  trap - ERR HUP INT TERM
  set +e
  echo "Release $release_id failed (exit $status)." >&2
  compose "$release" logs --tail=60 app >&2
  if [[ "$changed" == 1 && -n "$previous" ]]; then
    echo 'Restoring the previous application release; database is preserved.' >&2
    if compose "$previous" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app && probe "$previous"; then
      echo 'Previous application release restored.' >&2
    else
      echo 'Automatic rollback failed; inspect the application logs on the VPS.' >&2
    fi
  elif [[ "$changed" == 1 ]]; then
    echo 'First deployment: no previous CI release is available for rollback.' >&2
  fi
  exit "$status"
}
trap 'failure $?' ERR
trap 'failure 130' HUP INT TERM

compose "$release" config --quiet
echo "Pulling application for release $release_id..."
compose "$release" pull app
# Start on first deployment; leave an existing PostgreSQL container untouched.
compose "$release" up -d --no-recreate --wait --wait-timeout 120 postgres

mkdir -p "$root/backups"
backup="$root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release_id-$$.dump"
# Expand PostgreSQL credentials inside the container, never in the host shell.
# shellcheck disable=SC2016
compose "$release" exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup.partial"
[[ -s "$backup.partial" ]]
mv "$backup.partial" "$backup"
echo 'Database backup saved. Starting the new application...'

changed=1
compose "$release" up -d --no-deps --no-build --pull never --wait --wait-timeout 180 app
probe "$release"
if [[ -n "$previous" && "$previous" != "$release" ]]; then
  atomic_link "$previous" previous
fi
atomic_link "$release" current
changed=0
trap - ERR HUP INT TERM
echo "Release $release_id is healthy and active."
