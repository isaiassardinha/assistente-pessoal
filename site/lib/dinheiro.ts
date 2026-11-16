// Valores em reais: ler o que a pessoa digita e mostrar no formato R$ 1.234,56.

const VALOR_MAXIMO = 9_999_999_999.99;

/**
 * Lê um valor digitado: "50", "50,5", "1.234,56", "R$ 3.000", "1234.56".
 * Devolve null se não for um valor positivo válido.
 */
export function lerValor(entrada: string): number | null {
  let t = entrada.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t || !/^[\d.,]+$/.test(t)) return null;

  if (t.includes(",")) {
    // vírgula = decimal; pontos = milhar
    if ((t.match(/,/g) ?? []).length > 1) return null;
    const [inteiro, decimal] = t.split(",");
    if (inteiro.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(inteiro)) return null;
    if (decimal.length === 0 || decimal.length > 2) return null;
    t = `${inteiro.replace(/\./g, "")}.${decimal}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "3.000" = três mil
  } else if ((t.match(/\./g) ?? []).length > 1) {
    return null;
  } else if (t.includes(".") && t.split(".")[1].length > 2) {
    return null;
  }

  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > VALOR_MAXIMO) return null;
  return Math.round(n * 100) / 100;
}

const formatoReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 1234.5 -> "R$ 1.234,50" */
export function formatarReais(valor: number): string {
  return formatoReais.format(valor).replace(/ /g, " ");
}

/** Para preencher campos de edição: 1234.5 -> "1234,50" */
export function valorParaCampo(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}
