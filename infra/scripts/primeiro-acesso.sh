#!/usr/bin/env bash
# =====================================================================
# PRIMEIRO ACESSO (rodar uma única vez, como root, no terminal da Hostinger)
#
# Cria o usuário "assistente" e uma "chave de leitura" para o servidor
# baixar o projeto do GitHub. No final mostra uma linha que começa com
# "ssh-ed25519": ela deve ser cadastrada no GitHub em
#   Settings > Deploy keys > Add deploy key  (sem marcar "Allow write access")
#
# Este arquivo é a versão comentada do comando colado no terminal
# (docs/servidor.md, passo 1).
# =====================================================================
set -euo pipefail
id assistente >/dev/null 2>&1 || useradd -m -s /bin/bash assistente
apt-get update -qq && apt-get install -y -qq git openssh-client >/dev/null
runuser -u assistente -- bash -c '
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C servidor-assistente
  grep -q "Host github.com" ~/.ssh/config 2>/dev/null || printf "Host github.com\n  StrictHostKeyChecking accept-new\n" >> ~/.ssh/config
  chmod 600 ~/.ssh/config'
echo
echo "=== COPIE A LINHA ABAIXO E CADASTRE NO GITHUB (Deploy keys) ==="
cat /home/assistente/.ssh/id_ed25519.pub
