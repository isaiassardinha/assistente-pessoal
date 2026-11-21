// =====================================================================
// Respostas em áudio: texto da resposta → fala (Gemini) → mensagem de voz
// do WhatsApp (ogg/opus, convertida com o ffmpeg do servidor).
// Links, listas e números longos também vão por escrito: ouvir um link
// não serve para nada.
// =====================================================================

import { spawn, spawnSync } from "node:child_process";
import type { ModoAudio } from "./banco";
import { falar } from "./ia";

/** Respostas mais longas que isso vão só por escrito (áudio longo ninguém ouve). */
export const MAXIMO_FALA = 1200;

const URL = /https?:\/\/\S+/gi;

/** Responder em áudio? Depende da preferência e de como a pessoa escreveu. */
export function responderEmAudio(modo: ModoAudio | undefined, tipoDaMensagem: string): boolean {
  const m = modo ?? "quando_audio";
  return m === "sempre" || (m === "quando_audio" && tipoDaMensagem === "audio");
}

/** Versão para ser falada: sem links, sem marcação, sem emoji, sem listas com marcadores. */
export function textoParaFala(texto: string): string {
  let t = texto;
  const tinhaLink = URL.test(t);
  URL.lastIndex = 0;
  t = t.replace(URL, "");
  t = t.replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, "");
  t = t.replace(/[*_~`]+/g, "");
  t = t
    .split("\n")
    .map((linha) => linha.replace(/^\s*(?:[-•·]|\d+[.)])\s+/, "").trim())
    .filter((linha) => linha && !/^[:\-–—|]+$/.test(linha))
    .map((linha) => (/[.!?:;,]$/.test(linha) ? linha : `${linha}.`))
    .join(" ");
  t = t.replace(/\(\s*\)/g, "").replace(/\s+([.,;:!?])/g, "$1").replace(/:\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (tinhaLink) t += " O link está na mensagem escrita.";
  return t;
}

/** Além do áudio, mandar também o texto? (links, listas, muitos números ou resposta longa) */
export function precisaDoTexto(texto: string): boolean {
  if (/https?:\/\//i.test(texto)) return true;
  const linhasDeLista = texto.split("\n").filter((l) => /^\s*(?:[-•·]|\d+[.)])\s+/.test(l)).length;
  if (linhasDeLista >= 3) return true;
  const valores = texto.match(/R\$\s?[\d.,]+|\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}h\d{0,2}\b/g) ?? [];
  if (valores.length >= 4) return true;
  return texto.length > 600;
}

let temFfmpeg: { sim: boolean; em: number } | null = null;

/** O ffmpeg está instalado? ("não" é conferido de novo a cada 10 min: a publicação instala sozinha) */
export function ffmpegDisponivel(): boolean {
  if (!temFfmpeg || (!temFfmpeg.sim && Date.now() - temFfmpeg.em > 10 * 60_000)) {
    let sim = false;
    try {
      sim = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0;
    } catch {
      sim = false;
    }
    temFfmpeg = { sim, em: Date.now() };
  }
  return temFfmpeg.sim;
}

/** PCM 16 bits mono → ogg/opus (formato da mensagem de voz do WhatsApp). */
export function pcmParaOgg(pcm: Buffer, taxa: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(taxa), "-ac", "1", "-i", "pipe:0",
        "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", "pipe:1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const saida: Buffer[] = [];
    let erro = "";
    const prazo = setTimeout(() => ff.kill("SIGKILL"), 30_000);
    ff.stdout.on("data", (d: Buffer) => saida.push(d));
    ff.stderr.on("data", (d: Buffer) => (erro += d.toString()));
    ff.on("error", (e) => {
      clearTimeout(prazo);
      reject(e);
    });
    ff.on("close", (codigo) => {
      clearTimeout(prazo);
      if (codigo === 0 && saida.length) resolve(Buffer.concat(saida));
      else reject(new Error(`ffmpeg falhou (${codigo}): ${erro.slice(0, 200)}`));
    });
    ff.stdin.on("error", () => {}); // se o ffmpeg morrer antes, o erro aparece no close
    ff.stdin.end(pcm);
  });
}

/** Gera a mensagem de voz. Devolve null se não der (aí a resposta vai por escrito). */
export async function gerarMensagemDeVoz(texto: string): Promise<{ ogg: Buffer; segundos: number } | null> {
  const fala = textoParaFala(texto);
  if (!fala || fala.length > MAXIMO_FALA || !ffmpegDisponivel()) return null;
  const { pcm, taxa } = await falar(fala);
  const ogg = await pcmParaOgg(pcm, taxa);
  return { ogg, segundos: Math.max(1, Math.round(pcm.length / 2 / taxa)) };
}
