#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
REMOTE_USER="${REMOTE_USER:-xdmt}"
REMOTE_HOST="${REMOTE_HOST:-85.209.93.46}"
REMOTE_PORT="${REMOTE_PORT:-9213}"
REMOTE_PATH="/home/${REMOTE_USER}/projects/volei-formador-de-times"
PUBLIC_URL="${PUBLIC_URL:-https://volei.anyco.com.br}"
SSH=(ssh -p "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

echo '[1/4] Verificando acesso e configuração...'
bash -n ops/deploy-remote.sh
"${SSH[@]}" "$REMOTE_USER@$REMOTE_HOST" "test -d '$REMOTE_PATH' && docker compose version && docker inspect volei-postgres --format '{{.State.Status}}'"

echo '[2/4] Sincronizando código (dados e backups preservados)...'
rsync -az --itemize-changes -e "ssh -p $REMOTE_PORT -o BatchMode=yes -o ConnectTimeout=15" \
  --exclude node_modules/ --exclude dist/ --exclude .git/ \
  --exclude .env --exclude ".env.*" --exclude .deploy.lock \
  --exclude data/ --exclude pgdata/ --exclude backups/ --exclude .codex/ --exclude .agents/ \
  --exclude SERVER-ROLES.md \
  ./ "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

echo '[3/4] Compilando, salvando backup e aplicando a migração...'
"${SSH[@]}" "$REMOTE_USER@$REMOTE_HOST" "bash -s -- '$REMOTE_PATH'" < ops/deploy-remote.sh

echo '[4/4] Verificando acesso público por HTTPS...'
curl --fail --silent --show-error --retry 5 --retry-delay 2 "$PUBLIC_URL/api/health" |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(!j.data?.healthy)process.exit(1);console.log('HTTPS saudável; temporada '+j.data.seasonId)})"
curl --fail --silent --show-error --output /dev/null "$PUBLIC_URL/"
echo "Deploy concluído: $PUBLIC_URL"
