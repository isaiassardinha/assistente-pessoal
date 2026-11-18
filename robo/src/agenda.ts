// Agenda pelo "endereço secreto no formato iCal" (só leitura).

import ical, { type VEvent } from "node-ical";
import { instanteParaLocal } from "@/lib/datas";

export type Compromisso = {
  chave: string; // identificador do compromisso + início (para não avisar duas vezes)
  titulo: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  dia: string; // AAAA-MM-DD no horário de Brasília (ou a data do dia inteiro)
  local: string;
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "val" in v) return String((v as { val: unknown }).val ?? "");
  return "";
}

function diaLocal(d: Date): string {
  // datas "dia inteiro" chegam como meia-noite local do servidor
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Compromissos entre `de` e `ate`, já com repetições, exceções e alterações aplicadas. */
export function compromissosDoIcs(ics: string, de: Date, ate: Date): Compromisso[] {
  const dados = ical.sync.parseICS(ics);
  const lista: Compromisso[] = [];
  for (const item of Object.values(dados)) {
    if (!item || item.type !== "VEVENT") continue;
    const ev = item as VEvent;
    if (ev.recurrenceid) continue; // alterações de uma ocorrência: já entram pela expansão do evento principal
    if (String(ev.status ?? "").toUpperCase() === "CANCELLED") continue;
    let instancias;
    try {
      instancias = ical.expandRecurringEvent(ev, { from: de, to: ate, expandOngoing: true, maxIterations: 5000 });
    } catch {
      continue; // regra de repetição estranha: pula só este evento
    }
    for (const i of instancias) {
      const inicio = new Date(i.start);
      const fim = new Date(i.end ?? i.start);
      const cancelado = String((i.event as VEvent | undefined)?.status ?? "").toUpperCase() === "CANCELLED";
      if (cancelado || fim < de || inicio > ate) continue;
      lista.push({
        chave: `${ev.uid ?? texto(ev.summary)}|${inicio.toISOString()}`.slice(0, 590),
        titulo: texto(i.summary).trim() || "(sem título)",
        inicio,
        fim,
        diaInteiro: i.isFullDay,
        dia: i.isFullDay ? diaLocal(inicio) : instanteParaLocal(inicio.toISOString()).slice(0, 10),
        local: texto((i.event as VEvent | undefined)?.location ?? ev.location).trim(),
      });
    }
  }
  return lista.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Hora "HH:MM" no horário de Brasília. */
export function horaLocal(d: Date): string {
  return instanteParaLocal(d.toISOString()).slice(11, 16);
}

export function descreverCompromisso(c: Compromisso): string {
  const quando = c.diaInteiro ? "dia todo" : `${horaLocal(c.inicio)}–${horaLocal(c.fim)}`;
  return `${quando} ${c.titulo}${c.local ? ` (${c.local})` : ""}`;
}

const LIMITE_ICS = 8 * 1024 * 1024;

/** Link secreto do Google Agenda (ou outro iCal https). */
export function linkIcsValido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /\.ics(\?|$)|\/ical\//i.test(u.pathname + u.search) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Baixa o arquivo da agenda (com limite de tempo e tamanho). */
export async function baixarIcs(url: string): Promise<string> {
  if (!linkIcsValido(url)) throw new Error("link da agenda inválido");
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow", headers: { "user-agent": "AssistentePessoal/1.0" } });
  if (!r.ok) throw new Error(`agenda respondeu ${r.status}`);
  const corpo = await r.text();
  if (corpo.length > LIMITE_ICS) throw new Error("agenda grande demais");
  if (!corpo.includes("BEGIN:VCALENDAR")) throw new Error("o link não devolveu uma agenda");
  return corpo;
}
