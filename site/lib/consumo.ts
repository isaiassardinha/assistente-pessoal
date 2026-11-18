// Consumo da IA: totais para as telas (funções puras).

import { diasEntre, limitesDoMes } from "./contas";

export type LinhaUso = {
  dia: string;
  usuario_id: string | null;
  tipo: string;
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number;
};

export const NOMES_TIPO: Record<string, string> = {
  conversa: "Conversas no WhatsApp",
  audio: "Áudios transcritos",
  leitura: "Leitura de documentos e fotos",
  resumo: "Resumos de documentos",
  vetores: "Preparar documentos para busca",
  pergunta: "Perguntas na tela Cérebro",
  autoteste: "Autoteste do sistema",
  email: "Triagem de e-mails",
};

export type Total = { chamadas: number; entrada: number; saida: number; custo: number };
const vazio = (): Total => ({ chamadas: 0, entrada: 0, saida: 0, custo: 0 });

function somar(t: Total, l: LinhaUso) {
  t.chamadas += Number(l.chamadas);
  t.entrada += Number(l.tokens_entrada);
  t.saida += Number(l.tokens_saida);
  t.custo += Number(l.custo_usd);
}

export function resumirUso(linhas: LinhaUso[], hoje: string, mes: string) {
  const total = vazio();
  const hojeTotal = vazio();
  const porTipo = new Map<string, Total>();
  const porPessoa = new Map<string, Total>();
  const porDia = new Map<string, number>();
  for (const l of linhas) {
    somar(total, l);
    if (l.dia === hoje) somar(hojeTotal, l);
    if (!porTipo.has(l.tipo)) porTipo.set(l.tipo, vazio());
    somar(porTipo.get(l.tipo)!, l);
    const quem = l.usuario_id ?? "sistema";
    if (!porPessoa.has(quem)) porPessoa.set(quem, vazio());
    somar(porPessoa.get(quem)!, l);
    porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + Number(l.custo_usd));
  }
  // previsão do mês no ritmo atual (só para o mês corrente)
  const { inicio, fim } = limitesDoMes(mes);
  const diasNoMes = diasEntre(inicio, fim) + 1;
  const diasPassados = mes === hoje.slice(0, 7) ? diasEntre(inicio, hoje) + 1 : diasNoMes;
  const previsao = (total.custo / Math.max(1, diasPassados)) * diasNoMes;
  const ordenar = (m: Map<string, Total>) => [...m.entries()].sort((a, b) => b[1].custo - a[1].custo);
  return { total, hoje: hojeTotal, porTipo: ordenar(porTipo), porPessoa: ordenar(porPessoa), porDia, previsao };
}

export function formatarDolar(v: number): string {
  if (v > 0 && v < 0.01) return "menos de US$ 0,01";
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatarTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return String(n);
}

/** Cotação do dólar (AwesomeAPI, gratuita), guardada por 6 horas. Sem cotação = só US$. */
export async function cotacaoDolar(): Promise<number | null> {
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(2500),
    });
    const dados = (await r.json()) as { USDBRL?: { bid?: string } };
    const v = Number(dados.USDBRL?.bid);
    return Number.isFinite(v) && v > 1 && v < 20 ? v : null;
  } catch {
    return null;
  }
}

export function emReais(usd: number, cotacao: number | null): string {
  if (!cotacao) return "";
  const v = usd * cotacao;
  if (v > 0 && v < 0.01) return "menos de R$ 0,01";
  return `≈ R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
