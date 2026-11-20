// =====================================================================
// Passagens aéreas: preços do Google Flights pelo SerpApi (serpapi.com).
//  - busca na hora (datas fixas) e "datas mais baratas" (calendário);
//  - vigias: o robô consulta algumas vezes por dia e avisa abaixo do alvo;
//  - a cota mensal do SerpApi é uma só para todo mundo: a rotina divide o
//    que sobrou pelos dias que faltam no mês e guarda uma reserva para as
//    buscas feitas na hora pelo WhatsApp.
// As funções puras (montar pedido, ler resposta, decidir aviso, orçamento)
// ficam separadas da chamada à internet e são testadas.
// =====================================================================

import { formatarDataCurta, somarDias, ultimoDiaDoMes } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { config } from "./config";

export class PassagensNaoConfigurado extends Error {}
export class CotaEsgotada extends Error {}
export class ErroNaBusca extends Error {}

export const AEROPORTOS = /^[A-Z]{3}(,[A-Z]{3}){0,5}$/;

export type Pedido = {
  origem: string; // "GRU" ou "GRU,CGH,VCP"
  destino: string;
  ida: string; // AAAA-MM-DD
  volta?: string | null; // vazio = só ida
  adultos?: number;
  soDireto?: boolean;
};

export type PedidoCalendario = {
  origem: string;
  destino: string;
  de: string; // primeira data de ida possível
  ate: string; // última data de ida possível
  diasViagem?: number | null; // vazio = só ida
  adultos?: number;
  soDireto?: boolean;
};

export type Voo = {
  preco: number;
  companhias: string[];
  paradas: number;
  escalas: string[]; // códigos dos aeroportos de conexão
  duracaoMin: number | null;
  partida: string | null; // "2026-03-10 22:35" (hora local do aeroporto)
  chegada: string | null;
};

export type ResultadoVoos = {
  voos: Voo[]; // do mais barato para o mais caro
  nivel: "baixo" | "normal" | "alto" | null; // avaliação do próprio Google
  faixaTipica: [number, number] | null;
  link: string;
};

export type DataBarata = { ida: string; volta: string | null; preco: number };

// ------------------------------------------------------------ pedidos (puros)

function base(adultos?: number, soDireto?: boolean): Record<string, string> {
  return {
    currency: "BRL",
    hl: "pt",
    gl: "br",
    adults: String(Math.min(9, Math.max(1, adultos ?? 1))),
    stops: soDireto ? "1" : "0",
  };
}

export function parametrosVoos(p: Pedido): Record<string, string> {
  return {
    engine: "google_flights",
    departure_id: p.origem,
    arrival_id: p.destino,
    outbound_date: p.ida,
    ...(p.volta ? { return_date: p.volta, type: "1" } : { type: "2" }),
    sort_by: "2", // mais barato primeiro
    ...base(p.adultos, p.soDireto),
  };
}

export function parametrosCalendario(p: PedidoCalendario): Record<string, string> {
  return {
    engine: "google_flights_calendar",
    departure_id: p.origem,
    arrival_id: p.destino,
    date_range_start: p.de,
    date_range_end: p.ate,
    ...(p.diasViagem ? { type: "1", round_trip_days: String(p.diasViagem) } : { type: "2" }),
    ...base(p.adultos, p.soDireto),
  };
}

/** Link para abrir a mesma busca no Google Flights (e comprar). */
export function linkGoogleFlights(p: Pedido): string {
  const o = p.origem.split(",")[0];
  const d = p.destino.split(",")[0];
  const q = `Flights from ${o} to ${d} on ${p.ida}` + (p.volta ? ` through ${p.volta}` : " one way");
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=BRL&hl=pt-BR`;
}

// ------------------------------------------------------------ respostas (puras)

type Bruto = Record<string, unknown>;
const lista = (v: unknown): Bruto[] => (Array.isArray(v) ? (v as Bruto[]) : []);
const objeto = (v: unknown): Bruto => (v && typeof v === "object" ? (v as Bruto) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Erro devolvido pelo SerpApi: sem voo não é erro (lista vazia); cota acabou é. */
export function conferirErro(json: Bruto, status = 200): void {
  const erro = str(json.error);
  if (!erro && status < 400) return;
  const texto = erro ?? `HTTP ${status}`;
  if (/hasn't returned any results|no results/i.test(texto)) return;
  if (status === 429 || /run out of searches|searches left|plan limit/i.test(texto)) throw new CotaEsgotada(texto);
  if (status === 401 || /invalid api key/i.test(texto)) throw new PassagensNaoConfigurado("chave do SerpApi inválida");
  throw new ErroNaBusca(texto.slice(0, 200));
}

export function lerVoos(json: Bruto, pedido: Pedido): ResultadoVoos {
  const opcoes = [...lista(json.best_flights), ...lista(json.other_flights)];
  const vistos = new Set<string>();
  const voos: Voo[] = [];
  for (const o of opcoes) {
    const preco = num(o.price);
    const trechos = lista(o.flights);
    if (preco == null || preco <= 0 || trechos.length === 0) continue;
    const primeiro = trechos[0];
    const ultimo = trechos[trechos.length - 1];
    const voo: Voo = {
      preco,
      companhias: [...new Set(trechos.map((t) => str(t.airline)).filter((x): x is string => !!x))],
      paradas: trechos.length - 1,
      escalas: lista(o.layovers)
        .map((l) => str(l.id))
        .filter((x): x is string => !!x),
      duracaoMin: num(o.total_duration),
      partida: str(objeto(primeiro.departure_airport).time),
      chegada: str(objeto(ultimo.arrival_airport).time),
    };
    const chave = `${voo.preco}|${voo.companhias.join()}|${voo.partida}|${voo.chegada}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    voos.push(voo);
  }
  voos.sort((a, b) => a.preco - b.preco || (a.duracaoMin ?? 9e9) - (b.duracaoMin ?? 9e9));

  const insights = objeto(json.price_insights);
  const nivelBruto = str(insights.price_level);
  const nivel = nivelBruto === "low" ? "baixo" : nivelBruto === "typical" ? "normal" : nivelBruto === "high" ? "alto" : null;
  const faixa = lista(insights.typical_price_range) as unknown[];
  const faixaTipica = faixa.length === 2 && num(faixa[0]) != null && num(faixa[1]) != null ? ([faixa[0], faixa[1]] as [number, number]) : null;

  const linkGoogle = str(objeto(json.search_metadata).google_flights_url);
  return { voos, nivel, faixaTipica, link: linkGoogle?.startsWith("https://") ? linkGoogle : linkGoogleFlights(pedido) };
}

export function lerCalendario(json: Bruto): DataBarata[] {
  const datas: DataBarata[] = [];
  for (const p of lista(json.prices)) {
    const ida = str(p.outbound_date);
    const preco = num(p.price);
    if (!ida || preco == null || preco <= 0) continue;
    datas.push({ ida, volta: str(p.return_date), preco });
  }
  return datas.sort((a, b) => a.preco - b.preco || a.ida.localeCompare(b.ida));
}

// ------------------------------------------------------------ textos (puros)

export function duracaoLegivel(min: number | null): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`;
}

/** "10/03 22:35" a partir de "2026-03-10 22:35" */
export function horarioLegivel(t: string | null): string {
  if (!t) return "";
  const [data, hora] = t.split(" ");
  return `${formatarDataCurta(data)}${hora ? ` ${hora}` : ""}`;
}

export function descreverVoo(v: Voo): string {
  const paradas = v.paradas === 0 ? "direto" : `${v.paradas} parada${v.paradas > 1 ? "s" : ""}${v.escalas.length ? ` (${v.escalas.join(", ")})` : ""}`;
  return [formatarReais(v.preco), v.companhias.join("/") || "companhia não informada", paradas, duracaoLegivel(v.duracaoMin)]
    .filter(Boolean)
    .join(", ");
}

export function rotaLegivel(v: { origem: string; destino: string; descricao?: string | null }): string {
  return v.descricao?.trim() || `${v.origem.replace(/,/g, "/")} → ${v.destino.replace(/,/g, "/")}`;
}

export function datasLegiveis(v: {
  ida: string;
  ida_ate?: string | null;
  volta?: string | null;
  dias_viagem?: number | null;
  so_ida?: boolean;
}): string {
  if (v.ida_ate) {
    const janela = `saída entre ${formatarDataCurta(v.ida)} e ${formatarDataCurta(v.ida_ate)}`;
    return v.so_ida || !v.dias_viagem ? `${janela}, só ida` : `${janela}, ${v.dias_viagem} dias de viagem`;
  }
  return v.volta ? `${formatarDataCurta(v.ida)} a ${formatarDataCurta(v.volta)}` : `${formatarDataCurta(v.ida)}, só ida`;
}

export type EstadoAviso = {
  preco_alvo: number;
  abaixo_do_alvo: boolean;
  ultimo_aviso_preco: number | null;
};

/**
 * Avisa quando o preço entra abaixo do alvo. Enquanto continuar abaixo, só
 * avisa de novo se cair pelo menos mais 5%. Se voltar para cima do alvo e
 * cair de novo, avisa de novo.
 */
export function decidirAviso(estado: EstadoAviso, preco: number | null): { avisar: boolean; abaixo: boolean } {
  if (preco == null) return { avisar: false, abaixo: estado.abaixo_do_alvo };
  if (preco > estado.preco_alvo) return { avisar: false, abaixo: false };
  if (!estado.abaixo_do_alvo || estado.ultimo_aviso_preco == null) return { avisar: true, abaixo: true };
  return { avisar: preco <= estado.ultimo_aviso_preco * 0.95, abaixo: true };
}

export function montarAvisoPassagem(a: {
  rota: string;
  datas: string;
  adultos: number;
  preco: number;
  alvo: number;
  quedaExtra: boolean;
  detalhe: string;
  menorJaVisto: number | null;
  nivel: ResultadoVoos["nivel"];
  link: string;
}): string {
  const linhas = [
    a.quedaExtra ? `✈️ *Caiu mais: ${a.rota}*` : `✈️ *Passagem abaixo do alvo: ${a.rota}*`,
    `${a.datas}${a.adultos > 1 ? ` · ${a.adultos} adultos` : ""}`,
    "",
    `*${formatarReais(a.preco)}* (seu alvo: ${formatarReais(a.alvo)})`,
    a.detalhe,
  ];
  if (a.menorJaVisto != null && a.menorJaVisto < a.preco) linhas.push(`Menor preço que já vi nesta rota: ${formatarReais(a.menorJaVisto)}`);
  if (a.nivel) linhas.push(`Para o Google, este preço está ${a.nivel === "baixo" ? "baixo" : a.nivel === "alto" ? "alto" : "dentro do normal"}.`);
  linhas.push("", `Ver e comprar: ${a.link}`, "", "O preço pode mudar até a compra. Para parar de vigiar, é só me pedir.");
  return linhas.join("\n");
}

// ------------------------------------------------------------ orçamento (puro)

/**
 * Quantas buscas as vigias ainda podem fazer hoje. Guarda uma reserva para
 * as buscas na hora e divide o resto igualmente pelos dias que faltam no mês.
 * `restantes` já desconta o que foi usado hoje.
 */
export function buscasDasVigiasHoje(o: { restantes: number; porMes: number; feitasHoje: number; hoje: string }): number {
  const reserva = Math.max(10, Math.round(o.porMes * 0.2));
  const [a, m, d] = o.hoje.split("-").map(Number);
  const diasQueFaltam = ultimoDiaDoMes(a, m) - d + 1;
  const disponivel = Math.max(0, o.restantes - reserva);
  const doDia = Math.floor((disponivel + o.feitasHoje) / diasQueFaltam);
  return Math.max(0, doDia - o.feitasHoje);
}

// ------------------------------------------------------------ internet

const ENDERECO = "https://serpapi.com";

async function chamar(caminho: string, parametros: Record<string, string>): Promise<Bruto> {
  if (!config.serpapiChave) throw new PassagensNaoConfigurado("SERPAPI_KEY não configurada");
  const url = `${ENDERECO}${caminho}?${new URLSearchParams({ ...parametros, api_key: config.serpapiChave })}`;
  let resposta: Response;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  } catch (e) {
    throw new ErroNaBusca(`sem resposta do SerpApi: ${(e as Error).message}`);
  }
  let json: Bruto = {};
  try {
    json = objeto(await resposta.json());
  } catch {
    // corpo vazio ou não-JSON: decide pelo status
  }
  conferirErro(json, resposta.status);
  return json;
}

let cotaGuardada: { restantes: number; porMes: number; em: number } | null = null;

/** Buscas que ainda restam no mês (a consulta da conta não gasta busca). Guarda por 30 min. */
export async function cota(): Promise<{ restantes: number; porMes: number }> {
  if (cotaGuardada && Date.now() - cotaGuardada.em < 30 * 60_000) return cotaGuardada;
  const json = await chamar("/account.json", {});
  const restantes = num(json.total_searches_left) ?? num(json.plan_searches_left) ?? 0;
  const porMes = num(json.searches_per_month) ?? 0;
  cotaGuardada = { restantes, porMes, em: Date.now() };
  return cotaGuardada;
}

function gastouUma() {
  if (cotaGuardada) cotaGuardada.restantes = Math.max(0, cotaGuardada.restantes - 1);
}

export function passagensConfigurado(): boolean {
  return !!config.serpapiChave;
}

export async function buscarVoos(p: Pedido): Promise<ResultadoVoos> {
  const json = await chamar("/search.json", parametrosVoos(p));
  gastouUma();
  return lerVoos(json, p);
}

export async function buscarDatasBaratas(p: PedidoCalendario): Promise<DataBarata[]> {
  const json = await chamar("/search.json", parametrosCalendario(p));
  gastouUma();
  return lerCalendario(json);
}

/** Vigia: preço mais barato agora (datas fixas ou a melhor data da janela). */
export async function menorPrecoDaVigia(v: {
  origem: string;
  destino: string;
  ida: string;
  ida_ate: string | null;
  volta: string | null;
  dias_viagem: number | null;
  so_ida: boolean;
  adultos: number;
  so_direto: boolean;
}): Promise<{ preco: number | null; detalhe: Record<string, unknown>; texto: string; link: string; nivel: ResultadoVoos["nivel"] }> {
  if (!v.ida_ate) {
    const pedido: Pedido = { origem: v.origem, destino: v.destino, ida: v.ida, volta: v.so_ida ? null : v.volta, adultos: v.adultos, soDireto: v.so_direto };
    const r = await buscarVoos(pedido);
    const melhor = r.voos[0];
    return {
      preco: melhor?.preco ?? null,
      detalhe: melhor ? { ...melhor, nivel: r.nivel } : {},
      texto: melhor ? descreverVoo(melhor) : "",
      link: r.link,
      nivel: r.nivel,
    };
  }
  const datas = await buscarDatasBaratas({
    origem: v.origem,
    destino: v.destino,
    de: v.ida,
    ate: v.ida_ate,
    diasViagem: v.so_ida ? null : v.dias_viagem,
    adultos: v.adultos,
    soDireto: v.so_direto,
  });
  const melhor = datas[0];
  const volta = melhor ? (melhor.volta ?? (v.so_ida || !v.dias_viagem ? null : somarDias(melhor.ida, v.dias_viagem))) : null;
  return {
    preco: melhor?.preco ?? null,
    detalhe: melhor ? { ida: melhor.ida, volta } : {},
    texto: melhor ? `Melhor data: ${formatarDataCurta(melhor.ida)}${volta ? ` a ${formatarDataCurta(volta)}` : ", só ida"}` : "",
    link: linkGoogleFlights({ origem: v.origem, destino: v.destino, ida: melhor?.ida ?? v.ida, volta }),
    nivel: null,
  };
}

/** Para a página de saúde: nunca espera a internet (usa o último valor e atualiza por trás). */
export async function situacaoPassagens(): Promise<string> {
  if (!config.serpapiChave) return "falta configurar";
  if (!cotaGuardada || Date.now() - cotaGuardada.em >= 30 * 60_000) {
    cota().catch(() => {
      cotaGuardada = null;
    });
  }
  return cotaGuardada ? `configurado (${cotaGuardada.restantes} buscas restantes no mês)` : "configurado";
}
