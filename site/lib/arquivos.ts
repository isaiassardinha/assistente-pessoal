// Regras de arquivos do "Cérebro", usadas pelo site e pelo robô.

export const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB (mesmo limite do banco e do cofre)

/** Tipos que o assistente sabe ler, pela extensão. */
const POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const ACEITOS = new Set(Object.values(POR_EXTENSAO));

export const EXTENSOES_ACEITAS = Object.keys(POR_EXTENSAO);
export const DESCRICAO_TIPOS = "PDF, Word (.docx), texto (.txt, .md, .csv) e fotos (JPG, PNG, WEBP, HEIC)";

export function extensao(nome: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Tipo do arquivo, se for aceito. Confia primeiro no tipo informado (sem os
 * parâmetros, ex.: "; charset=utf-8") e, se ele for genérico, na extensão.
 */
export function tipoDoArquivo(nome: string, mime: string | null | undefined): string | null {
  const informado = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (ACEITOS.has(informado)) return informado;
  const pelaExtensao = POR_EXTENSAO[extensao(nome)];
  if (pelaExtensao && (!informado || informado === "application/octet-stream" || informado.startsWith("text/") || informado === "image/jpg")) {
    return pelaExtensao;
  }
  return null;
}

export function ehImagem(mime: string): boolean {
  return mime.startsWith("image/");
}

export function ehTexto(mime: string): boolean {
  return mime.startsWith("text/");
}

/** Nome limpo para guardar (sem pastas, sem caracteres estranhos, até 120). */
export function nomeSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "";
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(-120);
  return limpo || "arquivo";
}

/** Caminho no cofre: sempre dentro da pasta da própria pessoa. */
export function caminhoNoCofre(usuarioId: string, nome: string, id: string, origem: "site" | "whatsapp" = "site"): string {
  return `${usuarioId}/${origem}/${id}-${nomeSeguro(nome)}`;
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
