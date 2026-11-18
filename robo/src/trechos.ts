// Quebra textos longos em trechos para a busca pelo sentido (funções puras).

const TAMANHO = 1500; // caracteres por trecho (cerca de uma página curta)
const SOBRA = 200; // repete o fim do trecho anterior para não cortar uma ideia ao meio
export const MAXIMO_TRECHOS = 1500; // ~2 MB de texto por documento

/** Limpa espaços repetidos e linhas vazias em excesso. */
export function normalizarTexto(texto: string): string {
  return (
    texto
      // o banco não aceita o caractere nulo; PDFs às vezes trazem ele e outros de controle
      .replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g, " ")
      // pedaços de emoji/caractere quebrados (sem par)
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\t\f\v ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Divide o texto em trechos de até TAMANHO caracteres, preferindo cortar em
 * fim de parágrafo, depois em fim de frase, depois em espaço.
 */
export function quebrarEmTrechos(textoBruto: string, tamanho = TAMANHO, sobra = SOBRA): string[] {
  const texto = normalizarTexto(textoBruto);
  if (!texto) return [];
  if (texto.length <= tamanho) return [texto];

  const trechos: string[] = [];
  let inicio = 0;
  while (inicio < texto.length && trechos.length < MAXIMO_TRECHOS) {
    let fim = Math.min(inicio + tamanho, texto.length);
    if (fim < texto.length) {
      const janela = texto.slice(inicio, fim);
      const minimo = Math.floor(tamanho * 0.5);
      const corte = [janela.lastIndexOf("\n\n"), Math.max(janela.lastIndexOf(". "), janela.lastIndexOf(".\n")), janela.lastIndexOf(" ")]
        .find((p) => p >= minimo);
      if (corte !== undefined) fim = inicio + corte + 1;
    }
    const trecho = texto.slice(inicio, fim).trim();
    if (trecho) trechos.push(trecho);
    if (fim >= texto.length) break;
    // começa o próximo um pouco antes, no começo de uma palavra
    let proximo = Math.max(fim - sobra, inicio + 1);
    const espaco = texto.indexOf(" ", proximo);
    if (espaco !== -1 && espaco < fim) proximo = espaco + 1;
    inicio = proximo;
  }
  return trechos;
}

/** O texto parece ter vindo de um PDF escaneado (quase sem texto)? */
export function pareceEscaneado(texto: string, paginas: number): boolean {
  const letras = texto.replace(/[^\p{L}\p{N}]/gu, "").length;
  return letras < Math.max(1, paginas) * 80;
}
