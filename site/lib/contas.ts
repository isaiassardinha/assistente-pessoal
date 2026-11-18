// Regras de contas a pagar, usadas pelo site e pelo robô.

import { formatarDataCurta, somarDias } from "./datas";

export type StatusConta = "a_pagar" | "paga" | "ignorada";

export type ContaBasica = {
  descricao: string;
  valor: number | null;
  vencimento: string; // AAAA-MM-DD
  status: StatusConta;
  paga_em?: string | null;
};

export type Situacao = "atrasada" | "hoje" | "proxima" | "a_pagar" | "paga" | "ignorada";

/** Dias entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Situação da conta hoje, com um texto curto para mostrar. */
export function situacaoDaConta(c: ContaBasica, hoje: string): { situacao: Situacao; texto: string } {
  if (c.status === "paga")
    return {
      situacao: "paga",
      texto: c.paga_em ? `Paga em ${formatarDataCurta(c.paga_em)}` : "Paga",
    };
  if (c.status === "ignorada") return { situacao: "ignorada", texto: "Ignorada" };
  const dias = diasEntre(hoje, c.vencimento);
  if (dias < 0)
    return {
      situacao: "atrasada",
      texto: dias === -1 ? "Venceu ontem" : `Venceu há ${-dias} dias`,
    };
  if (dias === 0) return { situacao: "hoje", texto: "Vence hoje" };
  if (dias === 1) return { situacao: "proxima", texto: "Vence amanhã" };
  if (dias <= 7) return { situacao: "proxima", texto: `Vence em ${dias} dias` };
  return {
    situacao: "a_pagar",
    texto: `Vence ${formatarDataCurta(c.vencimento)}`,
  };
}

export type Resumo = {
  aPagar: number; // soma das que têm valor
  semValor: number; // quantas ainda sem valor
  pagas: number;
  atrasadas: number; // quantidade
  qtdAPagar: number;
};

/** Totais de uma lista de contas (normalmente as de um mês). */
export function resumirContas(contas: ContaBasica[], hoje: string): Resumo {
  const r: Resumo = {
    aPagar: 0,
    semValor: 0,
    pagas: 0,
    atrasadas: 0,
    qtdAPagar: 0,
  };
  for (const c of contas) {
    if (c.status === "paga") r.pagas += c.valor ?? 0;
    if (c.status !== "a_pagar") continue;
    r.qtdAPagar++;
    if (c.valor == null) r.semValor++;
    else r.aPagar += c.valor;
    if (c.vencimento < hoje) r.atrasadas++;
  }
  r.aPagar = Math.round(r.aPagar * 100) / 100;
  r.pagas = Math.round(r.pagas * 100) / 100;
  return r;
}

/** Primeiro e último dia do mês AAAA-MM. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return {
    inicio: `${mes}-01`,
    fim: `${mes}-${String(ultimo).padStart(2, "0")}`,
  };
}

/** Mês AAAA-MM válido (entre 2000 e 2100) ou o mês de hoje. */
export function lerMes(texto: string | undefined | null, hoje: string): string {
  return texto && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(texto) ? texto : hoje.slice(0, 7);
}

export function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** Vencimento de uma conta fixa num mês (dia 31 em fevereiro vira o último dia). */
export function vencimentoNoMes(mes: string, dia: number): string {
  const { fim } = limitesDoMes(mes);
  const ultimo = Number(fim.slice(8));
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

export { somarDias };
