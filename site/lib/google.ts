// Login do Google para a agenda (ler e criar compromissos).
// O "client id" é público; o segredo fica só no robô, que faz a troca do código.

import { timingSafeEqual } from "node:crypto";
import { urlDoSite } from "@/lib/config";

export const COOKIE_ESTADO = "google_estado";
/** Para onde a autorização volta: agenda pessoal ou o Drive de um espaço ("drive:<id>"). */
export const COOKIE_DESTINO = "google_destino";
export const ESCOPO_AGENDA = "https://www.googleapis.com/auth/calendar.events";
/** Só os arquivos que o próprio assistente cria (não enxerga o resto do Drive). */
export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";

export function googleConfigurado(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function enderecoDeRetorno(): string {
  return urlDoSite("/auth/google/retorno");
}

/** Endereço da tela de autorização do Google. */
export function enderecoDeAutorizacao(estado: string, para: "agenda" | "drive" = "agenda"): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: enderecoDeRetorno(),
    response_type: "code",
    scope: para === "drive" ? ESCOPO_DRIVE : ESCOPO_AGENDA,
    access_type: "offline", // para continuar funcionando sem a pessoa por perto
    prompt: "consent", // garante o token de renovação mesmo em reconexão
    state: estado,
  });
  // na agenda, mantém permissões já dadas; no Drive do espaço, o token leva SÓ o Drive
  if (para === "agenda") q.set("include_granted_scopes", "true");
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** "drive:<id do espaço>" guardado no cookie de destino → id do espaço (ou null = agenda). */
export function espacoDoDestino(destino: string | undefined): string | null {
  const m = /^drive:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(destino ?? "");
  return m ? m[1].toLowerCase() : null;
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

/** Resultado da conexão do Drive de um espaço (só códigos fixos). */
export const RESULTADOS_DRIVE = {
  ok: { tipo: "sucesso", texto: "Google Drive conectado! Os próximos documentos e fotos do grupo vão para a pasta \"Assistente - (nome do espaço)\" no seu Drive." },
  recusado: { tipo: "erro", texto: "Você não autorizou na tela do Google. Nada foi conectado." },
  permissao: { tipo: "erro", texto: "Na tela do Google, a caixinha do Drive ficou desmarcada. Clique em Conectar de novo e marque a permissão." },
  expirou: { tipo: "erro", texto: "A conexão demorou demais ou veio de outro navegador. Clique em Conectar Google Drive de novo." },
  erro: { tipo: "erro", texto: "Não consegui conectar o Google Drive. Confira se a API do Google Drive está ativada no projeto do Google Cloud e tente de novo." },
} as const;

export type ResultadoDrive = keyof typeof RESULTADOS_DRIVE;
