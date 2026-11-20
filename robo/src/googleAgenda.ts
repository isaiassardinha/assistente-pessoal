// Google Agenda pelo login do Google (ler, criar, mudar e apagar compromissos).

import { instanteParaLocal } from "@/lib/datas";
import type { Compromisso } from "./agenda";
import { config } from "./config";

export class GoogleRecusou extends Error {}

const FUSO = "America/Sao_Paulo";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const tokens = new Map<string, { token: string; validoAte: number }>();

/** Troca o "token de renovação" (guardado criptografado) por um de acesso, válido ~1h. */
export async function tokenDeAcesso(chave: string, refreshToken: string): Promise<string> {
  const guardado = tokens.get(chave);
  if (guardado && guardado.validoAte > Date.now() + 60_000) return guardado.token;
  if (!config.googleClientId || !config.googleClientSecret) throw new GoogleRecusou("login do Google não configurado no servidor");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const dados = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !dados.access_token) {
    if (dados.error === "invalid_grant" || dados.error === "unauthorized_client" || dados.error === "invalid_client") {
      throw new GoogleRecusou(`Google recusou (${dados.error})`);
    }
    throw new Error(`token do Google: ${r.status} ${dados.error ?? ""}`);
  }
  tokens.set(chave, { token: dados.access_token, validoAte: Date.now() + (dados.expires_in ?? 3600) * 1000 });
  return dados.access_token;
}

export function esquecerToken(chave: string) {
  tokens.delete(chave);
}

async function chamar(token: string, caminho: string, opcoes: { method?: string; body?: unknown } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: opcoes.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status === 401 || r.status === 403) throw new GoogleRecusou(`agenda respondeu ${r.status}`);
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new Error(`agenda do Google: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}

type EventoGoogle = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/** Converte um evento da API para o formato usado no resto do sistema. */
export function paraCompromisso(e: EventoGoogle): Compromisso | null {
  if (e.status === "cancelled" || !e.start) return null;
  const diaInteiro = !!e.start.date && !e.start.dateTime;
  const inicio = diaInteiro ? new Date(`${e.start.date}T03:00:00Z`) : new Date(e.start.dateTime!);
  const fim = diaInteiro ? new Date(`${e.end?.date ?? e.start.date}T03:00:00Z`) : new Date(e.end?.dateTime ?? e.start.dateTime!);
  return {
    chave: `${e.id}|${inicio.toISOString()}`,
    id: e.id,
    titulo: (e.summary ?? "").trim() || "(sem título)",
    inicio,
    fim,
    diaInteiro,
    dia: diaInteiro ? e.start.date! : instanteParaLocal(inicio.toISOString()).slice(0, 10),
    local: (e.location ?? "").trim(),
  };
}

export async function listarEventos(token: string, de: Date, ate: Date): Promise<Compromisso[]> {
  const q = new URLSearchParams({
    timeMin: de.toISOString(),
    timeMax: ate.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: FUSO,
  });
  const dados = (await chamar(token, `?${q}`)) as { items?: EventoGoogle[] } | null;
  return (dados?.items ?? []).map(paraCompromisso).filter((x): x is Compromisso => !!x);
}

export type NovoEvento = { titulo: string; data: string; inicio?: string; fim?: string; local?: string; diaInteiro?: boolean };

/** Corpo do evento para a API (horário de Brasília). */
export function corpoDoEvento(e: NovoEvento) {
  const base = { summary: e.titulo, ...(e.local ? { location: e.local } : {}) };
  if (e.diaInteiro || !e.inicio) {
    const d = new Date(`${e.data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return { ...base, start: { date: e.data }, end: { date: d.toISOString().slice(0, 10) } };
  }
  return {
    ...base,
    start: { dateTime: `${e.data}T${e.inicio}:00`, timeZone: FUSO },
    end: { dateTime: `${e.fim && e.fim > e.inicio ? e.data : proximoDia(e.data, e.fim)}T${e.fim ?? somarHora(e.inicio)}:00`, timeZone: FUSO },
  };
}

function somarHora(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function proximoDia(data: string, fim?: string): string {
  if (!fim) return data;
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function criarEvento(token: string, e: NovoEvento): Promise<Compromisso> {
  const criado = (await chamar(token, "", { method: "POST", body: corpoDoEvento(e) })) as EventoGoogle;
  return paraCompromisso(criado)!;
}

export async function mudarEvento(token: string, id: string, e: NovoEvento): Promise<Compromisso | null> {
  const r = (await chamar(token, `/${encodeURIComponent(id)}`, { method: "PATCH", body: corpoDoEvento(e) })) as EventoGoogle | null;
  return r ? paraCompromisso(r) : null;
}

export async function buscarEvento(token: string, id: string): Promise<Compromisso | null> {
  const r = (await chamar(token, `/${encodeURIComponent(id)}`)) as EventoGoogle | null;
  return r ? paraCompromisso(r) : null;
}

export async function apagarEvento(token: string, id: string): Promise<boolean> {
  return (await chamar(token, `/${encodeURIComponent(id)}`, { method: "DELETE" })) !== null;
}

/** Id de evento do Google (inclusive ocorrência de repetição, com "_"). */
export function idDeEventoValido(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{5,1024}$/.test(id);
}

/** Depois que a pessoa autoriza no Google: troca o código de uso único pelo token de renovação. */
export async function trocarCodigo(codigo: string, redirectUri: string, permissao: "agenda" | "drive" = "agenda"): Promise<string> {
  if (!config.googleClientId || !config.googleClientSecret) throw new GoogleRecusou("login do Google não configurado no servidor");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code: codigo,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const dados = (await r.json().catch(() => ({}))) as { refresh_token?: string; scope?: string; error?: string };
  if (!r.ok) throw new GoogleRecusou(`troca do código: ${r.status} ${dados.error ?? ""}`);
  if (!dados.refresh_token) throw new GoogleRecusou("o Google não mandou o token de renovação");
  const escopos = (dados.scope ?? "").split(" ");
  const temPermissao =
    permissao === "drive"
      ? escopos.some((s) => s.endsWith("/auth/drive.file") || s.endsWith("/auth/drive"))
      : escopos.some((s) => s.endsWith("/auth/calendar.events") || s.endsWith("/auth/calendar"));
  if (!temPermissao) {
    throw new SemPermissaoMarcada(`a permissão ${permissao === "drive" ? "do Drive" : "da agenda"} não foi marcada`);
  }
  return dados.refresh_token;
}

/** A pessoa desmarcou a caixinha da agenda na tela do Google. */
export class SemPermissaoMarcada extends GoogleRecusou {}

/** Nome da agenda principal (normalmente o e-mail da conta). */
export async function nomeDaAgenda(token: string): Promise<string> {
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return "Google Agenda";
  const d = (await r.json().catch(() => ({}))) as { id?: string; summary?: string };
  return (d.id || d.summary || "Google Agenda").slice(0, 200);
}

export function redirectUriValido(uri: string): boolean {
  return /^https:\/\/[a-z0-9.-]+(:\d+)?\/auth\/google\/retorno$/.test(uri) || uri === "http://localhost:3000/auth/google/retorno";
}
