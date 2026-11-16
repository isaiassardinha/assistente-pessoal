// Regras de validação dos formulários. Funções puras (testadas em validacao.test.ts).

export const SENHA_MINIMO = 8;
export const SENHA_MAXIMO = 72;

/**
 * Normaliza um celular para só dígitos com DDI, ex.: "5511912345678".
 * Aceita "(11) 91234-5678", "11912345678", "+55 11 91234-5678".
 * Números estrangeiros precisam começar com "+".
 * Devolve null se não parecer um celular válido.
 */
export function normalizarCelular(entrada: string): string | null {
  const bruto = entrada.trim();
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, "");

  if (bruto.startsWith("+") && !digitos.startsWith("55")) {
    return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
  }

  let nacional = digitos;
  if (nacional.startsWith("55") && (nacional.length === 12 || nacional.length === 13)) {
    nacional = nacional.slice(2);
  }
  if (nacional.startsWith("0")) nacional = nacional.slice(1); // "011..."

  // DDD (11 a 99) + número de 8 ou 9 dígitos; celular com 9 dígitos começa com 9
  if (!/^[1-9][1-9]\d{8,9}$/.test(nacional)) return null;
  if (nacional.length === 11 && nacional[2] !== "9") return null;
  return `55${nacional}`;
}

/** Mostra um celular de forma amigável: +55 (11) 91234-5678 */
export function formatarCelular(celular: string | null | undefined): string {
  if (!celular) return "";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(celular);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${celular}`;
}

export function validarEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validarNome(nome: string): boolean {
  const n = nome.trim();
  return n.length >= 1 && n.length <= 100;
}

/** Devolve a mensagem de erro, ou null se a senha estiver ok. */
export function problemaNaSenha(senha: string, confirmacao?: string): string | null {
  if (senha.length < SENHA_MINIMO) return `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`;
  if (senha.length > SENHA_MAXIMO) return `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`;
  if (confirmacao !== undefined && senha !== confirmacao) return "As duas senhas não são iguais.";
  return null;
}

export function validarCodigo6(codigo: string): boolean {
  return /^\d{6}$/.test(codigo.trim());
}

/**
 * Só aceita caminhos internos do site ("/painel"). Evita que um link
 * malicioso use o login para mandar a pessoa para outro site.
 */
export function caminhoSeguro(caminho: string | null | undefined, padrao = "/painel"): string {
  if (!caminho) return padrao;
  if (!caminho.startsWith("/") || caminho.startsWith("//") || caminho.startsWith("/\\")) return padrao;
  if (/[\r\n]/.test(caminho)) return padrao;
  return caminho;
}
