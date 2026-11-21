#!/usr/bin/env bash
# =====================================================================
# Publica a versão mais nova do GitHub (ramo main) no servidor.
#
# Roda sozinho a cada 2 minutos (assistente-publicar.timer) e não faz
# nada se não houver versão nova. Para forçar: assistente-publicar --forcar
#
# Segurança da publicação:
#   - cada versão é montada numa pasta própria (versoes/<código>)
#   - só troca a versão no ar se a construção der certo
#   - depois de trocar, confere se o site respondeu com a versão nova;
#     se não respondeu, VOLTA para a versão anterior sozinho
# =====================================================================
set -euo pipefail

USUARIO=assistente
CASA=/home/$USUARIO
REPO=$CASA/app
VERSOES=$CASA/versoes
ATUAL=$CASA/atual
ESTADO=/var/lib/assistente
FORCAR="${1:-}"

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }

# nunca duas publicações ao mesmo tempo
exec 9>/run/assistente-publicar.lock
flock -n 9 || { echo "Outra publicação já está em andamento."; exit 0; }

log() { echo "[$(date '+%F %T')] $*"; }
como() { runuser -u "$USUARIO" -- "$@"; }

mkdir -p "$ESTADO"
# ffmpeg: converte a voz das respostas em áudio para o formato do WhatsApp
if ! command -v ffmpeg >/dev/null 2>&1; then
  log "Instalando o ffmpeg (uma vez só)"
  { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg; } >/dev/null 2>&1 || log "AVISO: não deu para instalar o ffmpeg agora"
fi
como git -C "$REPO" fetch -q origin main
NOVA="$(como git -C "$REPO" rev-parse origin/main)"
NO_AR="$(cat "$ESTADO/versao-no-ar" 2>/dev/null || true)"
COM_ERRO="$(cat "$ESTADO/versao-com-erro" 2>/dev/null || true)"

if [ "$FORCAR" != "--forcar" ]; then
  [ "$NOVA" = "$NO_AR" ] && exit 0          # nada novo
  [ "$NOVA" = "$COM_ERRO" ] && exit 0       # essa já deu erro; só tenta de novo com --forcar
fi

# Se a versão nova traz um script de publicação diferente, usa o NOVO
# (senão mudanças na publicação só valeriam na versão seguinte).
if [ -z "${PUBLICAR_SCRIPT_NOVO:-}" ]; then
  script_novo="$(mktemp)"
  como git -C "$REPO" show "$NOVA:infra/scripts/publicar.sh" > "$script_novo" 2>/dev/null || true
  if [ -s "$script_novo" ] && ! cmp -s "$script_novo" "$0"; then
    log "A versão nova traz um script de publicação atualizado; usando ele."
    chmod 755 "$script_novo"
    exec 9>&-
    PUBLICAR_SCRIPT_NOVO=1 exec bash "$script_novo" "$@"
  fi
  rm -f "$script_novo"
fi

log "Publicando a versão ${NOVA:0:7}"
# Pasta própria para cada tentativa (nunca apaga a versão que está no ar,
# mesmo quando a mesma versão é publicada de novo com --forcar).
DESTINO="$VERSOES/${NOVA}-$(date +%Y%m%d%H%M%S)"
como mkdir -p "$DESTINO"
como bash -c "git -C '$REPO' archive '$NOVA' | tar -x -C '$DESTINO'"
echo "$NOVA" | como tee "$DESTINO/site/.versao" >/dev/null
[ -d "$DESTINO/robo" ] && echo "$NOVA" | como tee "$DESTINO/robo/.versao" >/dev/null

# ---- construir o site e o robô (com os testes) -----------------------
falhar_construcao() {
  log "ERRO ao testar/construir $1 da versão ${NOVA:0:7}. A versão no ar NÃO foi alterada."
  echo "$NOVA" > "$ESTADO/versao-com-erro"
  rm -rf "$DESTINO"
  exit 1
}
como bash -c "cd '$DESTINO/site' && npm ci --no-audit --no-fund --loglevel=error \
      && npm test && set -a && . /etc/assistente/site.env && set +a && npm run build" || falhar_construcao "o site"
if [ -d "$DESTINO/robo" ]; then
  como bash -c "cd '$DESTINO/robo' && npm ci --no-audit --no-fund --loglevel=error && npm test && npm run build" \
    || falhar_construcao "o robô"
  [ -f "$DESTINO/robo/dist/index.js" ] || falhar_construcao "o robô (arquivo final não foi gerado)"
fi

# ---- senha interna entre o site e o robô, e pasta de dados do robô ----
if ! grep -q '^INTERNO_TOKEN=' /etc/assistente/site.env; then
  echo "INTERNO_TOKEN=$(openssl rand -hex 32)" >> /etc/assistente/site.env
  log "Senha interna site-robô criada"
fi
# chave que criptografa as senhas das conexões (e-mail, agenda). Se um dia ela
# se perder, basta cada pessoa conectar de novo: nada mais depende dela.
if ! grep -q '^CONEXOES_CHAVE=' /etc/assistente/site.env; then
  echo "CONEXOES_CHAVE=$(openssl rand -hex 32)" >> /etc/assistente/site.env
  log "Chave das conexões criada"
fi
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$CASA/dados"

# ---- atualizar configurações do servidor que vêm com a versão --------
install -m 644 "$DESTINO"/infra/systemd/*.service "$DESTINO"/infra/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload

DOMINIO="$(cat /etc/assistente/dominio)"
sed "s/__DOMINIO__/$DOMINIO/g" "$DESTINO/infra/caddy/Caddyfile.modelo" > /tmp/Caddyfile.novo
if ! cmp -s /tmp/Caddyfile.novo /etc/caddy/Caddyfile; then
  if caddy validate --config /tmp/Caddyfile.novo --adapter caddyfile >/dev/null 2>&1; then
    install -m 644 /tmp/Caddyfile.novo /etc/caddy/Caddyfile
    systemctl reload caddy 9>&-
    log "Configuração do Caddy atualizada"
  else
    log "AVISO: Caddyfile novo é inválido; mantive o anterior"
  fi
fi

# ---- trocar a versão no ar --------------------------------------------
ANTERIOR=""
[ -L "$ATUAL" ] && ANTERIOR="$(readlink -f "$ATUAL")"
ln -sfn "$DESTINO" "$ATUAL.novo" && mv -Tf "$ATUAL.novo" "$ATUAL"
systemctl restart assistente-site 9>&-
if [ -d "$DESTINO/robo" ]; then
  systemctl enable assistente-robo >/dev/null 2>&1 || true
  systemctl restart assistente-robo 9>&-
fi

responde() { curl -fsS --max-time 3 "$1" 2>/dev/null | grep -q "$NOVA"; }
no_ar=0
for _ in $(seq 1 60); do
  if responde http://127.0.0.1:3000/api/saude && { [ ! -d "$DESTINO/robo" ] || responde http://127.0.0.1:3001/saude; }; then
    no_ar=1; break
  fi
  sleep 1
done

if [ "$no_ar" = 1 ]; then
  echo "$NOVA" > "$ESTADO/versao-no-ar"
  rm -f "$ESTADO/versao-com-erro"
  date -Iseconds > "$ESTADO/publicada-em"
  install -m 755 "$DESTINO/infra/scripts/publicar.sh" /usr/local/sbin/assistente-publicar
  install -m 755 "$DESTINO/infra/scripts/configurar.sh" /usr/local/sbin/assistente-configurar
  # guarda só as 3 versões mais recentes
  ls -1dt "$VERSOES"/*/ 2>/dev/null | tail -n +4 | while read -r velha; do
    [ "$(readlink -f "$velha")" = "$(readlink -f "$ATUAL")" ] || rm -rf "$velha"
  done
  log "OK: versão ${NOVA:0:7} no ar"
else
  log "ERRO: a versão ${NOVA:0:7} não respondeu. Voltando para a anterior."
  echo "$NOVA" > "$ESTADO/versao-com-erro"
  if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR" ]; then
    ln -sfn "$ANTERIOR" "$ATUAL.novo" && mv -Tf "$ATUAL.novo" "$ATUAL"
    systemctl restart assistente-site 9>&-
    if [ -d "$ANTERIOR/robo" ]; then systemctl restart assistente-robo 9>&-; else systemctl stop assistente-robo 9>&- 2>/dev/null || true; fi
    log "Versão anterior restaurada"
  fi
  rm -rf "$DESTINO"
  exit 1
fi
