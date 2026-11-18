// Registro simples (aparece em: journalctl -u assistente-robo).
// Nunca registrar conteúdo de mensagens nem dados pessoais.

function agora() {
  return new Date().toISOString();
}

export const log = {
  info: (...partes: unknown[]) => console.log(agora(), "INFO", ...partes),
  aviso: (...partes: unknown[]) => console.warn(agora(), "AVISO", ...partes),
  erro: (...partes: unknown[]) => console.error(agora(), "ERRO", ...partes),
};
