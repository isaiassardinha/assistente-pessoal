#!/usr/bin/env bash
# =====================================================================
# Cadastra as chaves e configurações do sistema no servidor, sem que elas
# passem pelo GitHub nem por ninguém. Pergunta só o que ainda falta.
#
#   assistente-configurar            -> pergunta o que estiver faltando
#   assistente-configurar NOME       -> troca o valor de uma configuração
#
# Os valores ficam em /etc/assistente/site.env (só root e o sistema leem).
# =====================================================================
set -euo pipefail

ARQUIVO=/etc/assistente/site.env
[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
touch "$ARQUIVO"

# NOME | é segredo? (s/n) | onde encontrar
VARIAVEIS=(
  "SITE_URL|n|Endereço do site, ex.: https://sc.hayahtraining.com"
  "SUPABASE_URL|n|Supabase > Project Settings > Data API > Project URL"
  "SUPABASE_PUBLISHABLE_KEY|n|Supabase > Project Settings > API Keys > Publishable key (começa com sb_publishable_)"
  "SUPABASE_SECRET_KEY|s|Supabase > Project Settings > API Keys > Secret keys (começa com sb_secret_). Chave mestra: só aqui no servidor."
  "GEMINI_API_KEY|s|Google AI Studio (aistudio.google.com) > Get API key. Com pagamento ativado e teto de gastos."
)
# Opcionais: só são perguntadas quando pedidas pelo nome (assistente-configurar NOME)
OPCIONAIS=(
  "NUMEROS_PERMITIDOS|n|Opcional. Números com DDI separados por vírgula (ex.: 5511999998888). Vazio = todos os aprovados."
)

valor_atual() { grep -E "^$1=" "$ARQUIVO" | tail -1 | cut -d= -f2- || true; }

gravar() {
  local nome="$1" valor="$2" temp
  temp="$(mktemp)"
  grep -vE "^$nome=" "$ARQUIVO" > "$temp" || true
  printf '%s=%s\n' "$nome" "$valor" >> "$temp"
  install -m 640 -o root -g assistente "$temp" "$ARQUIVO"
  rm -f "$temp"
}

perguntar() {
  local nome="$1" segredo="$2" dica="$3" valor
  echo
  echo "== $nome"
  echo "   Onde achar: $dica"
  if [ "$segredo" = s ]; then
    read -r -s -p "   Cole o valor (não vai aparecer na tela) e aperte Enter: " valor; echo
  else
    read -r -p "   Cole o valor e aperte Enter: " valor
  fi
  valor="$(printf '%s' "$valor" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  if [ -z "$valor" ]; then echo "   (vazio, pulei)"; return; fi
  gravar "$nome" "$valor"
  echo "   OK, salvo."
}

mudou=0
if [ $# -ge 1 ]; then
  for linha in "${VARIAVEIS[@]}" "${OPCIONAIS[@]}"; do
    IFS='|' read -r nome segredo dica <<<"$linha"
    if [ "$nome" = "$1" ]; then perguntar "$nome" "$segredo" "$dica"; mudou=1; fi
  done
  [ "$mudou" = 1 ] || { echo "Configuração desconhecida: $1"; exit 1; }
else
  for linha in "${VARIAVEIS[@]}"; do
    IFS='|' read -r nome segredo dica <<<"$linha"
    if [ -z "$(valor_atual "$nome")" ]; then perguntar "$nome" "$segredo" "$dica"; mudou=1; fi
  done
  [ "$mudou" = 1 ] || echo "Todas as configurações já estão preenchidas. Para trocar uma: assistente-configurar NOME"
fi

if [ "$mudou" = 1 ]; then
  echo
  echo "Aplicando (reiniciando o site e o robô)…"
  systemctl restart assistente-site
  if systemctl list-unit-files assistente-robo.service >/dev/null 2>&1; then systemctl restart assistente-robo || true; fi
  echo "Pronto."
fi
