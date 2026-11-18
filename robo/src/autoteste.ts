// Autoteste: confere, com as chaves do servidor, se a IA (conversa e busca
// pelo sentido) e o leitor de PDF estão funcionando. Roda ao ligar e a cada
// 6 horas; o resultado (só "ok"/"falhou", sem detalhes) aparece em /api/saude.

import { PDFDocument, StandardFonts } from "pdf-lib";
import { configuracoesFaltando } from "./config";
import { extrairTexto } from "./cerebro";
import { gerarVetores, responderComFontes } from "./ia";
import { log } from "./log";
import { comUso } from "./uso";

type Resultado = "ok" | "falhou" | "não testado";
const estado: { conversa: Resultado; vetores: Resultado; pdf: Resultado; em: string | null } = {
  conversa: "não testado",
  vetores: "não testado",
  pdf: "não testado",
  em: null,
};

export function resultadoAutoteste() {
  return { ...estado };
}

async function testar(nome: "conversa" | "vetores" | "pdf", passo: () => Promise<boolean>) {
  try {
    estado[nome] = (await passo()) ? "ok" : "falhou";
    if (estado[nome] === "falhou") log.aviso(`autoteste ${nome}: resultado inesperado`);
  } catch (e) {
    estado[nome] = "falhou";
    log.erro(`autoteste ${nome}:`, e);
  }
}

export function rodarAutoteste() {
  return comUso(null, testarTudo, "autoteste");
}

async function testarTudo() {
  if (configuracoesFaltando().length > 0) return;
  await testar("pdf", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText("Autoteste do leitor de PDF: placa XYZ9A99", { x: 40, y: 700, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const texto = await extrairTexto(Buffer.from(await pdf.save()), "application/pdf");
    return texto.includes("XYZ9A99");
  });
  await testar("vetores", async () => {
    const [v] = await gerarVetores(["teste do assistente"], "pergunta");
    return Array.isArray(v) && v.length > 0;
  });
  await testar("conversa", async () => {
    const r = await responderComFontes("Qual é a placa?", [{ fonte: "anotação de teste", conteudo: "A placa do carro é XYZ9A99." }], "Teste");
    return /XYZ9A99/i.test(r);
  });
  estado.em = new Date().toISOString();
  log.info(`autoteste: conversa ${estado.conversa}, vetores ${estado.vetores}, pdf ${estado.pdf}`);
}

export function iniciarAutoteste() {
  setTimeout(() => void rodarAutoteste(), 10_000);
  setInterval(() => void rodarAutoteste(), 6 * 3_600_000);
}
