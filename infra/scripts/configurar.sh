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

# NOME | é segredo? (s/n) | onde encontrar | formato esperado (regex)
VARIAVEIS=(
  "SITE_URL|n|Endereço do site, ex.: https://sc.hayahtraining.com|^https://[a-z0-9.-]+$"
  "SUPABASE_URL|n|Supabase > Project Settings > Data API > Project URL|^https://[a-z0-9]+\\.supabase\\.co$"
  "SUPABASE_PUBLISHABLE_KEY|n|Supabase > Project Settings > API Keys > Publishable key (começa com sb_publishable_)|^sb_publishable_[A-Za-z0-9_-]{10,80}$"
  "SUPABASE_SECRET_KEY|s|Supabase > Project Settings > API Keys > Secret keys (começa com sb_secret_). Chave mestra: só aqui no servidor.|^sb_secret_[A-Za-z0-9_-]{10,80}$"
  "GEMINI_API_KEY|s|Google AI Studio (aistudio.google.com) > Get API key (começa com AIza). Com pagamento ativado e teto de gastos.|^AIza[A-Za-z0-9_-]{30,60}$"
)
# Opcionais: só são perguntadas quando pedidas pelo nome (assistente-configurar NOME)
OPCIONAIS=(
  "NUMEROS_PERMITIDOS|n|Opcional. Números com DDI separados por vírgula (ex.: 5511999998888). Vazio = todos os aprovados.|^[0-9,]*$"
  "GOOGLE_CLIENT_ID|n|Google Cloud > Google Auth Platform > Clientes > ID do cliente (termina em .apps.googleusercontent.com)|^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$"
  "GOOGLE_CLIENT_SECRET|s|Google Cloud > Google Auth Platform > Clientes > Chave secreta do cliente (começa com GOCSPX-)|^GOCSPX-[A-Za-z0-9_-]{20,60}$"
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

# Tira o que alguns terminais colocam ao colar (marcas de "colar", espaços,
# quebras de linha e caracteres invisíveis).
limpar() {
  printf '%s' "$1" | sed -e 's/\x1b\[20[01]~//g' | LC_ALL=C tr -cd '[:graph:]'
}

perguntar() {
  local nome="$1" segredo="$2" dica="$3" formato="$4" valor tentativa
  echo
  echo "== $nome"
  echo "   Onde achar: $dica"
  for tentativa in 1 2 3; do
    if [ "$segredo" = s ]; then
      read -r -s -p "   Cole o valor (não vai aparecer na tela) e aperte Enter: " valor; echo
    else
      read -r -p "   Cole o valor e aperte Enter: " valor
    fi
    valor="$(limpar "$valor")"
    if [ -z "$valor" ]; then echo "   (vazio, pulei)"; return; fi
    if [ -n "$formato" ] && ! printf '%s' "$valor" | grep -Eq "$formato"; then
      echo "   ATENÇÃO: isso não parece um $nome (tamanho ${#valor}, começa com \"${valor:0:6}…\"). Tente de novo ($tentativa de 3)."
      continue
    fi
    gravar "$nome" "$valor"
    echo "   OK, salvo (tamanho ${#valor}, começa com \"${valor:0:6}…\")."
    mudou=1
    return
  done
  echo "   Não salvei $nome. Rode de novo: assistente-configurar $nome"
}

mudou=0
if [ $# -ge 1 ]; then
  for linha in "${VARIAVEIS[@]}" "${OPCIONAIS[@]}"; do
    IFS='|' read -r nome segredo dica formato <<<"$linha"
    if [ "$nome" = "$1" ]; then perguntar "$nome" "$segredo" "$dica" "$formato"; achou=1; fi
  done
  [ "${achou:-0}" = 1 ] || { echo "Configuração desconhecida: $1"; exit 1; }
else
  for linha in "${VARIAVEIS[@]}"; do
    IFS='|' read -r nome segredo dica formato <<<"$linha"
    if [ -z "$(valor_atual "$nome")" ]; then perguntar "$nome" "$segredo" "$dica" "$formato"; faltava=1; fi
  done
  [ "${faltava:-0}" = 1 ] || echo "Todas as configurações já estão preenchidas. Para trocar uma: assistente-configurar NOME"
fi

if [ "$mudou" = 1 ]; then
  echo
  echo "Aplicando (reiniciando o site e o robô)…"
  systemctl restart assistente-site
  if systemctl list-unit-files assistente-robo.service >/dev/null 2>&1; then systemctl restart assistente-robo || true; fi
  echo "Pronto."
fi
