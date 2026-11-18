// Login do Google para a agenda (ler e criar compromissos).
// O "client id" é público; o segredo fica só no robô, que faz a troca do código.

import { timingSafeEqual } from "node:crypto";
import { urlDoSite } from "@/lib/config";

export const COOKIE_ESTADO = "google_estado";
export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";

export function googleConfigurado(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function enderecoDeRetorno(): string {
  return urlDoSite("/auth/google/retorno");
}

/** Endereço da tela de autorização do Google. */
export function enderecoDeAutorizacao(estado: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: enderecoDeRetorno(),
    response_type: "code",
    scope: ESCOPO_AGENDA,
    access_type: "offline", // para continuar funcionando sem a pessoa por perto
    prompt: "consent", // garante o token de renovação mesmo em reconexão
    include_granted_scopes: "true",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Compara o "estado" que voltou do Google com o guardado no cookie (evita conexão forjada). */
export function estadoConfere(recebido: string | null, guardado: string | undefined): boolean {
  if (!recebido || !guardado || !/^[a-f0-9]{64}$/.test(guardado)) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(guardado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Resultado que volta para a página Minha conta (só códigos fixos, nunca texto de fora). */
export const RESULTADOS_GOOGLE = {
  ok: { tipo: "sucesso", texto: "Agenda do Google conectada! Agora dá para pedir pelo WhatsApp: \"marca dentista sexta às 15h\"." },
  recusado: { tipo: "erro", texto: "Você não autorizou na tela do Google. Nada foi conectado." },
  permissao: { tipo: "erro", texto: "Na tela do Google, a caixinha da agenda ficou desmarcada. Clique em Conectar de novo e marque a permissão." },
  expirou: { tipo: "erro", texto: "A conexão demorou demais ou veio de outro navegador. Clique em Conectar com Google de novo." },
  erro: { tipo: "erro", texto: "Não consegui conectar a agenda do Google. Tente de novo em instantes." },
} as const;

export type ResultadoGoogle = keyof typeof RESULTADOS_GOOGLE;
