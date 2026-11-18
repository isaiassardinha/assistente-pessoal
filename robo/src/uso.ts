// Consumo da IA: cada chamada ao Gemini registra tokens e custo estimado.
// Quem é o "dono" do consumo vem do contexto (comUso), sem precisar passar
// o usuário por todas as funções.

import { AsyncLocalStorage } from "node:async_hooks";
import * as banco from "./banco";
import { log } from "./log";

export type TipoUso = "conversa" | "audio" | "leitura" | "resumo" | "vetores" | "pergunta" | "autoteste" | "email";

/**
 * Preço de tabela do Gemini (US$ por 1 milhão de tokens), conferido em
 * novembro de 2026 em ai.google.dev/gemini-api/docs/pricing.
 * Se o Google mudar o preço, é só atualizar aqui.
 */
export const PRECOS: Record<string, { entrada: number; saida: number; audio?: number }> = {
  "gemini-3.1-flash-lite": { entrada: 0.25, saida: 1.5, audio: 0.5 },
  "gemini-embedding-2": { entrada: 0.2, saida: 0 },
};
const PADRAO = PRECOS["gemini-3.1-flash-lite"];

export type Uso = { entrada: number; saida: number; audio?: number; chamadas?: number };

export function custoUsd(modelo: string, uso: Uso): number {
  const p = PRECOS[modelo] ?? PADRAO;
  const audio = uso.audio ?? 0;
  const texto = Math.max(0, uso.entrada - audio);
  return (texto * p.entrada + audio * (p.audio ?? p.entrada) + uso.saida * p.saida) / 1_000_000;
}

type Metadados = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  promptTokensDetails?: { modality?: string; tokenCount?: number }[];
};

/** Tokens de uma resposta do Gemini (o raciocínio conta como saída). */
export function usoDaResposta(r: { usageMetadata?: Metadados } | undefined): Uso {
  const m = r?.usageMetadata ?? {};
  return {
    entrada: (m.promptTokenCount ?? 0) + (m.toolUsePromptTokenCount ?? 0),
    saida: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0),
    audio: (m.promptTokensDetails ?? []).filter((d) => d.modality === "AUDIO").reduce((s, d) => s + (d.tokenCount ?? 0), 0),
  };
}

export function somarUso(a: Uso, b: Uso): Uso {
  return {
    entrada: a.entrada + b.entrada,
    saida: a.saida + b.saida,
    audio: (a.audio ?? 0) + (b.audio ?? 0),
    chamadas: (a.chamadas ?? 1) + (b.chamadas ?? 1),
  };
}

const contexto = new AsyncLocalStorage<{ usuarioId: string | null; tipo?: TipoUso }>();

/** Roda `fn` com o consumo de IA atribuído a esta pessoa (null = sistema). */
export function comUso<T>(usuarioId: string | null, fn: () => Promise<T>, tipo?: TipoUso): Promise<T> {
  return contexto.run({ usuarioId, tipo }, fn);
}

/** Registra o consumo (sem travar a resposta; falha só vai para o registro). */
export function registrarUso(tipo: TipoUso, modelo: string, uso: Uso) {
  if (uso.entrada <= 0 && uso.saida <= 0) return;
  const c = contexto.getStore();
  const custo = custoUsd(modelo, uso);
  void banco
    .registrarUsoIa({
      usuario_id: c?.usuarioId ?? null,
      tipo: c?.tipo ?? tipo,
      modelo,
      chamadas: uso.chamadas ?? 1,
      tokens_entrada: uso.entrada,
      tokens_saida: uso.saida,
      custo_usd: Math.round(custo * 1_000_000) / 1_000_000,
    })
    .catch((e) => log.aviso("consumo da IA não registrado:", e));
}

/** Embeddings não informam tokens: estimativa de ~4 caracteres por token. */
export function estimarTokens(textos: string[]): number {
  return Math.ceil(textos.reduce((s, t) => s + t.length, 0) / 4);
}
