#!/usr/bin/env bash
set -Eeuo pipefail
cd "${1:?Informe o diretório remoto do projeto}"
exec 9>.deploy.lock
flock -n 9 || { echo 'Outro deploy está em andamento.' >&2; exit 1; }
APP=volei-formador-de-times
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PREVIOUS_IMAGE=$(docker inspect "$APP" --format '{{.Image}}')
PREVIOUS_TAG="volei-formador-de-times:rollback-$STAMP"
docker tag "$PREVIOUS_IMAGE" "$PREVIOUS_TAG"
APP_STOPPED=0
APP_REPLACED=0
recover() {
  status=$?
  if (( status != 0 )); then
    echo "Deploy falhou. Imagem anterior preservada: $PREVIOUS_TAG" >&2
    if (( APP_STOPPED == 1 && APP_REPLACED == 0 )); then
      echo 'Reiniciando o container anterior; o banco não será restaurado automaticamente.' >&2
      docker start "$APP" || true
    fi
  fi
  exit "$status"
}
trap recover EXIT

docker compose config --quiet
test "$(docker inspect volei-postgres --format '{{.State.Running}}')" = true
# Build first: the current application and PostgreSQL keep serving while this runs.
docker compose build "$APP"
mkdir -p backups
chmod 700 backups
docker compose stop "$APP"
APP_STOPPED=1
# Run as the deployment owner so backup files are readable for off-server copies.
docker compose run --rm --no-deps -T --interactive=false --user "$(id -u):$(id -g)" "$APP" npm run db:backup </dev/null
docker compose run --rm --no-deps -T --interactive=false --user "$(id -u):$(id -g)" "$APP" npm run db:migrate </dev/null
APP_REPLACED=1
docker compose up -d --no-deps "$APP"
for attempt in $(seq 1 30); do
  health=$(docker inspect "$APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
  if [[ "$health" == healthy ]]; then
    docker compose ps "$APP" postgres
    echo "Versão anterior: $PREVIOUS_TAG"
    echo "Backups: $(pwd)/backups"
    exit 0
  fi
  sleep 2
done
docker logs --tail 80 "$APP" >&2
echo 'A nova versão não passou na verificação de saúde.' >&2
exit 1
