#!/usr/bin/env bash
# Exercise release state, backup gating and rollback with a deterministic Docker stub.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
mkdir -p "$temporary/bin"
export MOCK_LOG="$temporary/docker.log"
export PATH="$temporary/bin:$PATH"
cat > "$temporary/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
release=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    compose) shift ;;
    --project-name|-f) shift 2 ;;
    --env-file)
      if [[ "$2" == */image.env ]]; then release=$(basename "$(dirname "$2")"); fi
      shift 2 ;;
    *) break ;;
  esac
done
printf '%s %s\n' "$release" "$*" >> "$MOCK_LOG"
case "$*" in
  'pull app') [[ "$release" != "${MOCK_FAIL_PULL:-}" ]] ;;
  'exec -T postgres sh -c exec pg_dump'*)
    [[ "$release" != "${MOCK_FAIL_BACKUP:-}" ]] || exit 1
    printf 'test database dump\n' ;;
  'up '*app) [[ "$release" != "${MOCK_FAIL_START:-}" ]] ;;
  'exec -T app node'*) [[ "$release" != "${MOCK_FAIL_PROBE:-}" ]] ;;
  *) exit 0 ;;
esac
MOCK
chmod +x "$temporary/bin/docker"
root="$temporary/platform"
mkdir -p "$root/releases"
printf 'DOMAIN=ege.example.test\n' > "$root/.env.production"
release() {
  mkdir -p "$root/releases/$1"
  printf 'APP_IMAGE=ghcr.io/example/meta-education@sha256:%064d\n' 0 > "$root/releases/$1/image.env"
  cp "$repo/compose.production.yaml" "$root/releases/$1/compose.production.yaml"
}
activate() { bash "$repo/deploy/activate.sh" "$root" "$1" > "$temporary/output" 2>&1; }
expect_failure() {
  if activate "$1"; then echo "Expected release $1 to fail" >&2; exit 1; fi
}
for id in first second pull-failure backup-failure start-failure probe-failure; do release "$id"; done
activate first
[[ $(readlink "$root/current") == "$root/releases/first" && ! -e "$root/previous" ]]
[[ -n $(find "$root/backups" -name '*.dump' -print -quit) ]]
activate second
[[ $(readlink "$root/current") == "$root/releases/second" ]]
[[ $(readlink "$root/previous") == "$root/releases/first" ]]
export MOCK_FAIL_PULL=pull-failure
expect_failure pull-failure
if grep -q 'pull-failure up ' "$MOCK_LOG"; then exit 1; fi
export MOCK_FAIL_BACKUP=backup-failure
expect_failure backup-failure
if grep -q 'backup-failure up .*app$' "$MOCK_LOG"; then exit 1; fi
export MOCK_FAIL_START=start-failure
expect_failure start-failure
grep -q 'Previous application release restored' "$temporary/output"
export MOCK_FAIL_PROBE=probe-failure
expect_failure probe-failure
grep -q 'Previous application release restored' "$temporary/output"
[[ $(readlink "$root/current") == "$root/releases/second" ]]
[[ $(readlink "$root/previous") == "$root/releases/first" ]]
grep -q 'second up .*--pull never .*app$' "$MOCK_LOG"
grep -q 'DOMAIN=ege.example.test' "$root/.env.production"
if grep -Eq ' (down|prune|rm) ' "$MOCK_LOG"; then exit 1; fi
expect_failure '../outside'

root="$temporary/first-deploy-failure"
mkdir -p "$root/releases"
printf 'DOMAIN=ege.example.test\n' > "$root/.env.production"
release cold-failure
export MOCK_FAIL_START=cold-failure
expect_failure cold-failure
[[ ! -e "$root/current" ]]
grep -q 'no previous CI release' "$temporary/output"
echo 'PASS: release activation, previous release, backups, pull/backup failure gates, start/probe rollback, first-deploy failure and path validation.'
