import { describe, expect, it } from "vitest";
import { ffmpegDisponivel, pcmParaOgg, precisaDoTexto, responderEmAudio, textoParaFala } from "./voz";

describe("quando responder em áudio", () => {
  it("padrão: áudio só quando a pessoa mandou áudio", () => {
    expect(responderEmAudio(undefined, "audio")).toBe(true);
    expect(responderEmAudio(undefined, "texto")).toBe(false);
    expect(responderEmAudio("quando_audio", "audio")).toBe(true);
  });
  it("sempre e nunca", () => {
    expect(responderEmAudio("sempre", "texto")).toBe(true);
    expect(responderEmAudio("nunca", "audio")).toBe(false);
  });
});

describe("texto para falar", () => {
  it("tira link, marcação, emoji e marcadores de lista", () => {
    const t = textoParaFala(
      "✈️ *Passagem abaixo do alvo*\n- LATAM, direto: R$ 1.650,00\n- GOL, 1 parada: R$ 1.700,00\n\nVer e comprar: https://www.google.com/travel/flights?q=abc",
    );
    expect(t).not.toMatch(/https|\*|✈|^-/);
    expect(t).toContain("Passagem abaixo do alvo.");
    expect(t).toContain("LATAM, direto: R$ 1.650,00.");
    expect(t).toMatch(/O link está na mensagem escrita\.$/);
  });
  it("texto simples fica igual", () => {
    expect(textoParaFala("Anotado! Gasto de R$ 50,00 no mercado.")).toBe("Anotado! Gasto de R$ 50,00 no mercado.");
  });
  it("só emoji vira vazio", () => {
    expect(textoParaFala("👍")).toBe("");
  });
});

describe("também mandar por escrito", () => {
  it("quando tem link, lista ou muitos números", () => {
    expect(precisaDoTexto("Veja: https://x.test")).toBe(true);
    expect(precisaDoTexto("- um\n- dois\n- três")).toBe(true);
    expect(precisaDoTexto("R$ 10, R$ 20, R$ 30 e R$ 40")).toBe(true);
    expect(precisaDoTexto("x".repeat(700))).toBe(true);
  });
  it("resposta curta sem link: só o áudio", () => {
    expect(precisaDoTexto("Anotado! Gasto de R$ 50,00 no mercado.")).toBe(false);
  });
});

describe.skipIf(!ffmpegDisponivel())("conversão para mensagem de voz", () => {
  it("PCM vira ogg/opus", async () => {
    const taxa = 24000;
    const pcm = Buffer.alloc(taxa * 2); // 1 segundo
    for (let i = 0; i < taxa; i++) pcm.writeInt16LE(Math.round(Math.sin((i / taxa) * 2 * Math.PI * 440) * 8000), i * 2);
    const ogg = await pcmParaOgg(pcm, taxa);
    expect(ogg.subarray(0, 4).toString()).toBe("OggS");
    expect(ogg.includes(Buffer.from("OpusHead"))).toBe(true);
  });
});
