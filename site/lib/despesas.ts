import { hojeISO, intervaloDoPeriodo, lerPeriodo, PERIODOS, formatarData, type Periodo } from "@/lib/datas";
import type { criarClienteSupabase } from "@/lib/supabase/servidor";

type Supabase = Awaited<ReturnType<typeof criarClienteSupabase>>;
type Parametros = Record<string, string | string[] | undefined>;

export type FiltrosDespesas = {
  periodo: Periodo;
  de: string | null;
  ate: string | null;
  categoria: string;
  busca: string;
};

export type LinhaDespesa = {
  id: string;
  valor: number;
  descricao: string;
  data: string;
  categoria_id: string;
  origem: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(texto: string): boolean {
  return UUID.test(texto);
}

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Lê os filtros da barra de endereço (?periodo=mes&categoria=...&busca=...). */
export function lerFiltros(parametros: Parametros, hoje = hojeISO()): FiltrosDespesas {
  const periodo = lerPeriodo(texto(parametros.periodo));
  const { de, ate } = intervaloDoPeriodo(periodo, hoje, texto(parametros.de), texto(parametros.ate));
  const categoria = ehUuid(texto(parametros.categoria)) ? texto(parametros.categoria) : "";
  const busca = texto(parametros.busca).slice(0, 100);
  return { periodo, de, ate, categoria, busca };
}

/** Os mesmos filtros em formato de endereço (para exportar com o mesmo filtro). */
export function filtrosParaQuery(f: FiltrosDespesas): string {
  const q = new URLSearchParams({ periodo: f.periodo });
  if (f.periodo === "personalizado") {
    if (f.de) q.set("de", f.de);
    if (f.ate) q.set("ate", f.ate);
  }
  if (f.categoria) q.set("categoria", f.categoria);
  if (f.busca) q.set("busca", f.busca);
  return q.toString();
}

/** Escapa % e _ para a busca por texto não virar curinga. */
function padraoBusca(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Busca as despesas da pessoa logada com os filtros. O banco (RLS) garante
 * que só vêm as dela. "Todo o período" começa na primeira despesa.
 */
export async function buscarDespesas(supabase: Supabase, f: FiltrosDespesas, limite = 5000) {
  let consulta = supabase
    .from("despesas")
    .select("id, valor, descricao, data, categoria_id, origem")
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (f.de) consulta = consulta.gte("data", f.de);
  if (f.ate) consulta = consulta.lte("data", f.ate);
  if (f.categoria) consulta = consulta.eq("categoria_id", f.categoria);
  if (f.busca) consulta = consulta.ilike("descricao", padraoBusca(f.busca));

  const { data, error } = await consulta;
  const linhas = (data ?? []).map((d) => ({ ...d, valor: Number(d.valor) })) as LinhaDespesa[];

  let inicio = f.de;
  if (!inicio) {
    const { data: primeira } = await supabase.from("despesas").select("data").order("data", { ascending: true }).limit(1);
    inicio = primeira?.[0]?.data ?? null;
  }
  return { linhas, erro: error, inicio, fim: f.ate ?? hojeISO() };
}

export function descreverPeriodo(f: FiltrosDespesas, inicio: string | null, fim: string): string {
  const nome = PERIODOS.find((p) => p.valor === f.periodo)?.rotulo ?? "";
  if (!inicio) return nome;
  return `${nome} (${formatarData(inicio)} a ${formatarData(fim)})`;
}

export function totalPorCategoria(linhas: LinhaDespesa[]): Map<string, number> {
  const totais = new Map<string, number>();
  for (const l of linhas) totais.set(l.categoria_id, Math.round(((totais.get(l.categoria_id) ?? 0) + l.valor) * 100) / 100);
  return totais;
}

export function somar(linhas: { valor: number }[]): number {
  return Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
}
