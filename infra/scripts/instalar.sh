#!/usr/bin/env bash
# =====================================================================
# Instalação do servidor (Ubuntu 24.04). Pode rodar mais de uma vez sem
# estragar nada. Roda como root, depois do "primeiro acesso"
# (docs/servidor.md), que cria o usuário e baixa o projeto do GitHub.
#
# O que faz:
#   fuso de Brasília, atualizações automáticas de segurança, firewall
#   (só SSH, 80 e 443), proteção contra tentativas de senha (fail2ban),
#   memória extra (swap), Node.js 22, Caddy (HTTPS), serviços do systemd
#   e a primeira publicação do site.
# =====================================================================
set -euo pipefail

DOMINIO="${DOMINIO:-sc.hayahtraining.com}"
USUARIO=assistente
CASA=/home/$USUARIO
REPO=$CASA/app

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
[ -d "$REPO/.git" ] || { echo "Projeto não encontrado em $REPO. Faça o primeiro acesso antes."; exit 1; }

passo() { echo; echo "==> $*"; }
export DEBIAN_FRONTEND=noninteractive

passo "Fuso horário de Brasília"
timedatectl set-timezone America/Sao_Paulo

passo "Atualizando o sistema (pode levar alguns minutos)"
apt-get update -q
apt-get -y -q -o Dpkg::Options::="--force-confold" upgrade
apt-get install -y -q curl ca-certificates gnupg git ufw fail2ban unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https

passo "Atualizações automáticas de segurança"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

passo "Memória extra (swap de 2 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

passo "Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

passo "Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs
fi
node -v

passo "Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
caddy version

passo "Pastas e configurações do assistente"
id "$USUARIO" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USUARIO"
install -d -m 755 -o "$USUARIO" -g "$USUARIO" "$CASA/versoes"
install -d -m 750 -o root -g "$USUARIO" /etc/assistente
install -d -m 755 /var/lib/assistente
echo "$DOMINIO" > /etc/assistente/dominio
if [ ! -f /etc/assistente/site.env ]; then
  printf 'SITE_URL=https://%s\n' "$DOMINIO" > /etc/assistente/site.env
fi
chown root:"$USUARIO" /etc/assistente/site.env
chmod 640 /etc/assistente/site.env

passo "Serviços (systemd) e Caddy"
install -m 755 "$REPO/infra/scripts/publicar.sh" /usr/local/sbin/assistente-publicar
install -m 755 "$REPO/infra/scripts/configurar.sh" /usr/local/sbin/assistente-configurar
install -m 644 "$REPO"/infra/systemd/*.service "$REPO"/infra/systemd/*.timer /etc/systemd/system/
sed "s/__DOMINIO__/$DOMINIO/g" "$REPO/infra/caddy/Caddyfile.modelo" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl daemon-reload
systemctl enable assistente-site >/dev/null
systemctl enable caddy >/dev/null
systemctl reload-or-restart caddy

passo "Primeira publicação do site (alguns minutos)"
/usr/local/sbin/assistente-publicar --forcar
systemctl enable --now assistente-publicar.timer >/dev/null

passo "Configurações do sistema (chaves do Supabase etc.)"
/usr/local/sbin/assistente-configurar

echo
echo "================================================================"
echo " PRONTO. Servidor instalado."
echo "   Site:      https://$DOMINIO"
echo "   Versão:    $(cut -c1-7 /var/lib/assistente/versao-no-ar)"
echo "   O servidor procura versões novas no GitHub a cada 2 minutos."
echo "================================================================"
