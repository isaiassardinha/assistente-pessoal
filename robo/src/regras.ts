// Regras que o CÓDIGO confere, sem depender da IA (funções puras, testadas).

import { createHash, randomInt } from "node:crypto";
import { lerValor } from "@/lib/dinheiro";

/** "Saúde" -> "saude" (minúsculas, sem acento) */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ------------------------------------------------------------------ valores

/** Todos os valores em dinheiro escritos nos textos: "50", "1.234,56", "R$ 3 mil", "2,5k". */
export function valoresNoTexto(texto: string): number[] {
  const valores: number[] = [];
  const t = semAcento(texto);
  const padrao = /(\d[\d.,]*)(\s*(mil|k)\b)?/g;
  for (const m of t.matchAll(padrao)) {
    const bruto = m[1].replace(/[.,]$/, "");
    const base = lerValor(bruto);
    if (base === null) continue;
    valores.push(m[2] ? Math.round(base * 1000 * 100) / 100 : base);
  }
  if (/(^|[^a-z0-9])mil([^a-z0-9]|$)/.test(t) && !/\d\s*mil/.test(t)) valores.push(1000);
  return valores;
}

/** O valor foi realmente dito pela pessoa? */
export function valorFoiDito(valor: number, textosDaPessoa: string[]): boolean {
  return textosDaPessoa.some((t) => valoresNoTexto(t).some((v) => Math.abs(v - valor) < 0.005));
}

// -------------------------------------------------------------- categorias

/** Acha a categoria pelo nome (sem diferenciar maiúsculas e acentos). */
export function encontrarCategoria<T extends { nome: string }>(nome: string, categorias: T[]): T | undefined {
  const alvo = semAcento(nome.trim());
  return categorias.find((c) => semAcento(c.nome) === alvo);
}

/** A categoria foi dita pela pessoa? (aceita plural: "mercados") */
export function categoriaFoiDita(nomeCategoria: string, textosDaPessoa: string[]): boolean {
  const alvo = semAcento(nomeCategoria).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const padrao = new RegExp(`(^|[^a-z0-9])${alvo}`);
  return textosDaPessoa.some((t) => padrao.test(semAcento(t)));
}

// -------------------------------------------------------------- anotações

function palavras(texto: string): string[] {
  return semAcento(texto).match(/[a-z0-9]+/g) ?? [];
}

/**
 * A anotação foi realmente dita pela pessoa? Todo número/código precisa
 * aparecer igualzinho, e a maior parte das palavras importantes também.
 */
export function textoFoiDito(texto: string, textosDaPessoa: string[], minimo = 0.6): boolean {
  const ditas = new Set(textosDaPessoa.flatMap(palavras));
  const alvo = palavras(texto).filter((p) => p.length >= 3 || /\d/.test(p));
  if (alvo.length === 0) return false;
  if (alvo.some((p) => /\d/.test(p) && !ditas.has(p))) return false;
  return alvo.filter((p) => ditas.has(p)).length / alvo.length >= minimo;
}

// ------------------------------------------------------------------ horário

/** A pessoa disse um horário? ("9h", "09:30", "às 8", "meio-dia", "daqui a 10 minutos") */
export function horaFoiDita(textosDaPessoa: string[]): boolean {
  const padroes = [
    /\b\d{1,2}\s?(h|hs|hrs?|horas?)\b/,
    /\b\d{1,2}h\d{2}\b/,
    /\b\d{1,2}:\d{2}\b/,
    /\bas \d{1,2}\b/,
    /\bmeio[- ]?dia\b/,
    /\bmeia[- ]?noite\b/,
    /\b(daqui a|daqui|em) \d+ ?(min|mins|minutos?|h|horas?)\b/,
    /\b(da manha|da tarde|da noite|de manha|de tarde|de noite)\b/,
  ];
  return textosDaPessoa.some((t) => {
    const s = semAcento(t);
    return padroes.some((p) => p.test(s));
  });
}

// ------------------------------------------------------------- datas ditas

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/**
 * A data (AAAA-MM-DD) foi dita pela pessoa? Aceita o número do dia
 * ("dia 25", "25/11"), "hoje", "amanhã", "depois de amanhã" e dia da semana.
 */
export function dataFoiDita(data: string, textosDaPessoa: string[], hoje: string): boolean {
  const dia = Number(data.slice(8, 10));
  const textos = textosDaPessoa.map(semAcento);
  const somar = (n: number) => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (textos.some((t) => new RegExp(`(^|[^0-9])0?${dia}([^0-9]|$)`).test(t))) return true;
  if (data === hoje && textos.some((t) => /\bhoje\b/.test(t))) return true;
  if (data === somar(1) && textos.some((t) => /\bamanha\b/.test(t) && !/depois de amanha/.test(t))) return true;
  if (data === somar(2) && textos.some((t) => /depois de amanha/.test(t))) return true;
  const semana = DIAS_SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()];
  const distancia =
    (Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, dia) - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))) /
    86_400_000;
  if (distancia > 0 && distancia <= 7 && textos.some((t) => new RegExp(`\\b${semana}\\b`).test(t))) return true;
  return false;
}

/** O dia do mês (1 a 31) foi dito pela pessoa? */
export function diaFoiDito(dia: number, textosDaPessoa: string[]): boolean {
  return textosDaPessoa.some((t) => new RegExp(`(^|[^0-9])0?${dia}([^0-9]|$)`).test(semAcento(t)));
}

// ------------------------------------------------------------- confirmação

/** A pessoa disse claramente que sim? */
export function respostaAfirmativa(texto: string): boolean {
  const s = semAcento(texto).trim();
  if (/\b(nao|negativo|cancela|cancelar|espera|pera)\b/.test(s)) return false;
  return /^(sim|s|pode|confirmo|confirma|confirmado|isso|ok|okay|beleza|claro|manda|uhum|aham|positivo|correto|certo|exato)\b/.test(s);
}

// ---------------------------------------------------------------- celular

/**
 * No Brasil, alguns números aparecem no WhatsApp sem o 9 da frente
 * (cadastros antigos). Devolve as duas formas para comparar.
 */
export function variantesCelular(digitos: string): string[] {
  const d = digitos.replace(/\D/g, "");
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") return [d, d.slice(0, 4) + d.slice(5)];
  if (d.startsWith("55") && d.length === 12 && /[6-9]/.test(d[4])) return [d, `${d.slice(0, 4)}9${d.slice(4)}`];
  return [d];
}

/** Modo "só números liberados": vazio = todos. */
export function numeroPermitido(digitos: string, permitidos: string[]): boolean {
  if (permitidos.length === 0) return true;
  const variantes = variantesCelular(digitos);
  return permitidos.some((p) => variantesCelular(p).some((v) => variantes.includes(v)));
}

// ------------------------------------------------------ código de verificação

export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCodigo(codigo: string, usuarioId: string): string {
  return createHash("sha256").update(`${usuarioId}:${codigo}`).digest("hex");
}

// --------------------------------------------------------- limite de envio

/** Limita quantas mensagens cada pessoa pode mandar por minuto. */
export class LimitadorPorMinuto {
  private registros = new Map<string, number[]>();
  constructor(private maximo: number) {}

  permitir(chave: string, agora = Date.now()): boolean {
    const recentes = (this.registros.get(chave) ?? []).filter((t) => agora - t < 60_000);
    if (recentes.length >= this.maximo) {
      this.registros.set(chave, recentes);
      return false;
    }
    recentes.push(agora);
    this.registros.set(chave, recentes);
    return true;
  }
}

// ------------------------------------------------------- texto das respostas

/** Mantém no máximo 1 emoji na resposta (regra de estilo do assistente). */
export function limitarEmojis(texto: string, maximo = 1): string {
  let contagem = 0;
  return texto.replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, (e) => (++contagem <= maximo ? e : ""));
}

// ------------------------------------------------------------------ grupos

/** Tira do texto as menções "@5511999998888" (ou "@<código>") dos números dados. */
export function tirarMencoes(texto: string, usuarios: string[]): string {
  let t = texto;
  for (const u of usuarios.filter(Boolean)) {
    t = t.replace(new RegExp(`@${u.replace(/[^0-9A-Za-z]/g, "")}\\b`, "g"), " ");
  }
  return t.replace(/[ \t]{2,}/g, " ").replace(/^[\s,:;-]+/, "").trim();
}

/** Possíveis códigos de ligação de grupo (6 letras/números, sem 0/O/1/I) ditos na mensagem. */
export function codigosDeLigacao(texto: string): string[] {
  const achados = texto.match(/(?<![A-Za-z0-9])[A-HJ-NP-Za-hj-np-z2-9]{6}(?![A-Za-z0-9])/g) ?? [];
  return [...new Set(achados.map((c) => c.toUpperCase()))].slice(0, 5);
}
