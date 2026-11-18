// Datas sempre no horário de Brasília, não importa onde o servidor esteja.
// Datas "de calendário" são texto no formato AAAA-MM-DD (como no banco).

export const FUSO = "America/Sao_Paulo";

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Data de hoje em Brasília: "2026-11-16" */
export function hojeISO(agora: Date = new Date()): string {
  return formatoDia.format(agora);
}

function partes(dataISO: string): [number, number, number] {
  const [a, m, d] = dataISO.split("-").map(Number);
  return [a, m, d];
}

function deUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = partes(dataISO);
  return deUTC(Date.UTC(a, m - 1, d + dias));
}

/** 0 = domingo, 1 = segunda ... 6 = sábado */
export function diaDaSemana(dataISO: string): number {
  const [a, m, d] = partes(dataISO);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Primeiro dia do mês da data: "2026-11-16" -> "2026-11-01" */
export function inicioDoMes(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}

export function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = partes(texto);
  return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDiaDoMes(a, m) && a >= 2000 && a <= 2100;
}

export type Periodo = "semana" | "mes" | "mes-passado" | "30dias" | "ano" | "tudo" | "personalizado";

export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "mes", rotulo: "Este mês" },
  { valor: "semana", rotulo: "Esta semana" },
  { valor: "mes-passado", rotulo: "Mês passado" },
  { valor: "30dias", rotulo: "Últimos 30 dias" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "tudo", rotulo: "Todo o período" },
  { valor: "personalizado", rotulo: "Escolher datas" },
];

export type Intervalo = { de: string | null; ate: string | null };

/**
 * Converte um período em datas (de/até, inclusive).
 *  "esta semana" = segunda até hoje; "este mês" = dia 1 até hoje.
 *  "tudo" = sem limite (quem usa decide onde começa).
 */
export function intervaloDoPeriodo(periodo: Periodo, hoje: string, de?: string, ate?: string): Intervalo {
  switch (periodo) {
    case "semana": {
      const voltar = (diaDaSemana(hoje) + 6) % 7; // segunda = 0
      return { de: somarDias(hoje, -voltar), ate: hoje };
    }
    case "mes":
      return { de: inicioDoMes(hoje), ate: hoje };
    case "mes-passado": {
      const fimMesPassado = somarDias(inicioDoMes(hoje), -1);
      return { de: inicioDoMes(fimMesPassado), ate: fimMesPassado };
    }
    case "30dias":
      return { de: somarDias(hoje, -29), ate: hoje };
    case "ano":
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
    case "tudo":
      return { de: null, ate: null };
    case "personalizado": {
      const d = de && dataValida(de) ? de : null;
      const a = ate && dataValida(ate) ? ate : null;
      if (d && a && d > a) return { de: a, ate: d };
      return { de: d, ate: a };
    }
  }
}

export function lerPeriodo(texto: string | undefined | null): Periodo {
  return PERIODOS.some((p) => p.valor === texto) ? (texto as Periodo) : "mes";
}

/** "2026-11-16" -> "16/11/2026" */
export function formatarData(dataISO: string): string {
  const [a, m, d] = dataISO.split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-11-16" -> "16/11" */
export function formatarDataCurta(dataISO: string): string {
  const [, m, d] = dataISO.split("-");
  return `${d}/${m}`;
}

// ---------------------------------------------------------------------
// Data + hora (lembretes): o campo do navegador dá "2026-11-17T09:00"
// no horário de Brasília; o banco guarda o instante exato.
// ---------------------------------------------------------------------

function minutosDeDiferenca(instante: Date): number {
  const nome =
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO, timeZoneName: "longOffset" })
      .formatToParts(instante)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT-03:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nome);
  if (!m) return 0;
  const minutos = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutos : minutos;
}

/** "2026-11-17T09:00" (Brasília) -> instante em ISO. Null se inválido. */
export function localParaInstante(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, a, mes, d, h, mi] = m.map(Number);
  if (!dataValida(local.slice(0, 10)) || h > 23 || mi > 59) return null;
  const comoUTC = Date.UTC(a, mes - 1, d, h, mi);
  let utc = comoUTC - minutosDeDiferenca(new Date(comoUTC)) * 60_000;
  const conferir = minutosDeDiferenca(new Date(utc));
  utc = comoUTC - conferir * 60_000;
  return new Date(utc).toISOString();
}

const formatoLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Instante -> "2026-11-17T09:00" em Brasília (para o campo de edição). */
export function instanteParaLocal(iso: string): string {
  const p = Object.fromEntries(formatoLocal.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Instante -> "17/11/2026 às 09:00" em Brasília. */
export function formatarDataHora(iso: string): string {
  const local = instanteParaLocal(iso);
  return `${formatarData(local.slice(0, 10))} às ${local.slice(11)}`;
}

/** Instante (ISO) de N horas atrás. */
export function horasAtras(horas: number): string {
  return new Date(Date.now() - horas * 3_600_000).toISOString();
}
