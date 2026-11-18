// =====================================================================
// Inteligência artificial (Google Gemini). Isolada neste arquivo para dar
// para trocar de provedor depois sem mexer no resto.
//
// A IA NÃO acessa o banco: ela só pode pedir para o código executar uma das
// "ferramentas" (ferramentas.ts), e o código confere tudo antes.
// =====================================================================

import { GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { config } from "./config";
import { log } from "./log";

export class IaIndisponivel extends Error {}

export type Ferramenta = {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>; // JSON Schema
  executar: (argumentos: Record<string, unknown>) => Promise<unknown>;
};

export type Turno = { papel: "usuario" | "assistente"; texto: string };

let cliente: GoogleGenAI | null = null;
function ia(): GoogleGenAI {
  if (!config.geminiChave) throw new IaIndisponivel("GEMINI_API_KEY não configurada");
  cliente ??= new GoogleGenAI({ apiKey: config.geminiChave });
  return cliente;
}

function traduzirErro(e: unknown): Error {
  const texto = String((e as Error)?.message ?? e);
  const status = (e as { status?: number })?.status;
  if (status === 429 || status === 500 || status === 503 || status === 504 || /quota|exhausted|unavailable|overloaded|timeout|fetch failed|ECONN/i.test(texto)) {
    return new IaIndisponivel(texto);
  }
  return e instanceof Error ? e : new Error(texto);
}

const MAXIMO_DE_RODADAS = 6;

/**
 * Conversa com a IA. Ela pode chamar ferramentas; o código executa e devolve
 * o resultado, até a IA dar a resposta final. Só o texto final volta.
 */
export async function conversar(opcoes: {
  instrucoes: string;
  historico: Turno[];
  mensagem: string;
  ferramentas: Ferramenta[];
}): Promise<string> {
  const conteudos: Content[] = [
    ...opcoes.historico.map((t) => ({ role: t.papel === "usuario" ? "user" : "model", parts: [{ text: t.texto }] })),
    { role: "user", parts: [{ text: opcoes.mensagem }] },
  ];
  const porNome = new Map(opcoes.ferramentas.map((f) => [f.nome, f]));
  const declaracoes = opcoes.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, parametersJsonSchema: f.parametros }));

  for (let rodada = 0; rodada < MAXIMO_DE_RODADAS; rodada++) {
    let resposta;
    try {
      resposta = await ia().models.generateContent({
        model: config.geminiModelo,
        contents: conteudos,
        config: {
          systemInstruction: opcoes.instrucoes,
          tools: [{ functionDeclarations: declaracoes }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.2,
        },
      });
    } catch (e) {
      throw traduzirErro(e);
    }

    const chamadas = resposta.functionCalls ?? [];
    if (chamadas.length === 0) {
      return (resposta.text ?? "").trim();
    }

    // Devolve à IA exatamente o que ela mandou (inclui as "assinaturas" de raciocínio).
    const conteudoModelo = resposta.candidates?.[0]?.content;
    if (conteudoModelo) conteudos.push(conteudoModelo);

    const respostas: Part[] = [];
    for (const chamada of chamadas) {
      const ferramenta = chamada.name ? porNome.get(chamada.name) : undefined;
      let resultado: unknown;
      if (!ferramenta) {
        resultado = { erro: "ferramenta desconhecida" };
      } else {
        try {
          resultado = await ferramenta.executar((chamada.args ?? {}) as Record<string, unknown>);
        } catch (e) {
          log.erro(`ferramenta ${ferramenta.nome} falhou:`, (e as Error).message);
          resultado = { erro: "NÃO EXECUTADO: falha técnica. Diga que não conseguiu agora e peça para tentar de novo em instantes." };
        }
      }
      respostas.push({ functionResponse: { id: chamada.id, name: chamada.name, response: { resultado } } });
    }
    conteudos.push({ role: "user", parts: respostas });
  }
  return "Desculpe, me enrolei aqui. Pode repetir de um jeito mais simples?";
}

/** Transforma um áudio em texto. */
export async function transcreverAudio(audio: Buffer, mime: string): Promise<string> {
  try {
    const resposta = await ia().models.generateContent({
      model: config.geminiModelo,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mime.split(";")[0] || "audio/ogg", data: audio.toString("base64") } },
            {
              text:
                "Transcreva exatamente o que a pessoa fala neste áudio, em português do Brasil. " +
                "Escreva números, valores e horários em algarismos (ex.: 50, R$ 1.234,56, 9h). " +
                "Responda SOMENTE com a transcrição, sem comentários. Se não houver fala, responda vazio.",
            },
          ],
        },
      ],
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }, temperature: 0 },
    });
    return (resposta.text ?? "").trim();
  } catch (e) {
    throw traduzirErro(e);
  }
}
