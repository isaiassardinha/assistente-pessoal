// Registro simples (aparece em: journalctl -u assistente-robo).
// Nunca registrar conteúdo de mensagens nem dados pessoais.

function agora() {
  return new Date().toISOString();
}

// Erros de rede ("fetch failed") escondem o motivo real em `cause`.
// Mostra a cadeia de causas (só a mensagem, sem dados).
function detalhar(parte: unknown): unknown {
  if (!(parte instanceof Error)) return parte;
  let texto = `${parte.name}: ${parte.message}`;
  let causa: unknown = (parte as { cause?: unknown }).cause;
  for (let i = 0; causa && i < 3; i++) {
    const c = causa as { message?: string; code?: string };
    texto += ` (causa: ${c.code ? c.code + " " : ""}${c.message ?? String(causa)})`;
    causa = (causa as { cause?: unknown }).cause;
  }
  return texto;
}

export const log = {
  info: (...partes: unknown[]) => console.log(agora(), "INFO", ...partes),
  aviso: (...partes: unknown[]) => console.warn(agora(), "AVISO", ...partes.map(detalhar)),
  erro: (...partes: unknown[]) => console.error(agora(), "ERRO", ...partes.map(detalhar)),
};
