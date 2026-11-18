// Leitura de documentos e fila do cérebro, com banco e IA de mentira.

import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = {
  trechos: [] as { conteudo: string; vetor: number[] }[],
  concluido: null as null | string,
  falha: null as null | { erro: string; definitivo: boolean },
  arquivo: Buffer.from(""),
  mime: "text/plain",
  iaLeu: 0,
};

vi.mock("./banco", () => ({
  MAXIMO_TENTATIVAS_LEITURA: 3,
  reservarDocumento: async (_uid: string, d: { id: string; tentativas: number }) => ({
    id: d.id,
    nome_arquivo: "contrato.pdf",
    descricao: "",
    caminho: "u1/site/x-contrato.pdf",
    tipo_mime: estado.mime,
    tamanho_bytes: estado.arquivo.length,
    status: "processando",
    resumo: null,
    origem: "site",
    tentativas: d.tentativas + 1,
    criado_em: "2026-11-18T00:00:00Z",
  }),
  baixarArquivo: async () => estado.arquivo,
  gravarTrechosDoDocumento: async (_uid: string, _id: string, t: { conteudo: string; vetor: number[] }[]) => {
    estado.trechos = t;
  },
  concluirDocumento: async (_uid: string, _id: string, resumo: string) => {
    estado.concluido = resumo;
  },
  falharDocumento: async (_uid: string, _id: string, erro: string, definitivo: boolean) => {
    estado.falha = { erro, definitivo };
  },
}));

vi.mock("./ia", () => ({
  MAXIMO_LEITURA_IA: 14 * 1024 * 1024,
  ArquivoGrandeDemais: class extends Error {},
  IaIndisponivel: class extends Error {},
  gerarVetores: async (textos: string[]) => textos.map(() => [0.1, 0.2]),
  lerArquivoComIA: async () => {
    estado.iaLeu++;
    return "Texto lido pela IA: RG 12.345.678-9";
  },
  resumir: async () => "Contrato de aluguel do apartamento.",
}));

const { extrairTexto, processarDocumento, ArquivoIlegivel } = await import("./cerebro");

async function pdfCom(texto: string | null): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage();
  if (texto) pagina.drawText(texto, { x: 50, y: 700, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await pdf.save());
}

beforeEach(() => {
  estado.trechos = [];
  estado.concluido = null;
  estado.falha = null;
  estado.iaLeu = 0;
});

describe("extrair texto", () => {
  it("lê arquivo de texto", async () => {
    expect(await extrairTexto(Buffer.from("olá mundo"), "text/plain")).toBe("olá mundo");
  });

  it("lê PDF com texto sem usar a IA", async () => {
    const frase = "Contrato de locacao: multa de tres alugueis em caso de saida antecipada. ".repeat(3);
    const texto = await extrairTexto(await pdfCom(frase.slice(0, 200)), "application/pdf");
    expect(texto).toContain("multa de tres alugueis");
    expect(estado.iaLeu).toBe(0);
  });

  it("PDF escaneado (sem texto) é lido pela IA", async () => {
    const texto = await extrairTexto(await pdfCom(null), "application/pdf");
    expect(texto).toContain("RG 12.345.678-9");
    expect(estado.iaLeu).toBe(1);
  });

  it("foto é lida pela IA", async () => {
    await extrairTexto(Buffer.from([1, 2, 3]), "image/jpeg");
    expect(estado.iaLeu).toBe(1);
  });

  it("Word corrompido vira erro explicado", async () => {
    await expect(extrairTexto(Buffer.from("não é um docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).rejects.toBeInstanceOf(
      ArquivoIlegivel,
    );
  });

  it("tipo desconhecido vira erro explicado", async () => {
    await expect(extrairTexto(Buffer.from("x"), "video/mp4")).rejects.toBeInstanceOf(ArquivoIlegivel);
  });
});

describe("processar documento da fila", () => {
  const item = { id: "d1", usuario_id: "u1", status: "pendente", status_em: "2026-11-18T00:00:00Z", tentativas: 0 };

  it("grava trechos com vetores e marca como lido", async () => {
    estado.mime = "text/plain";
    estado.arquivo = Buffer.from("Cláusula 5: multa de três aluguéis. ".repeat(100));
    const r = await processarDocumento(item);
    expect(r?.ok).toBe(true);
    expect(estado.trechos.length).toBeGreaterThan(1);
    expect(estado.trechos.every((t) => t.vetor.length === 2)).toBe(true);
    expect(estado.concluido).toBe("Contrato de aluguel do apartamento.");
  });

  it("arquivo vazio: desiste de vez e explica", async () => {
    estado.mime = "text/plain";
    estado.arquivo = Buffer.from("   ");
    const r = await processarDocumento(item);
    expect(r?.ok).toBe(false);
    expect(estado.falha?.definitivo).toBe(true);
    expect(estado.concluido).toBeNull();
  });

  it("travou várias vezes: desiste", async () => {
    const r = await processarDocumento({ ...item, status: "processando", tentativas: 3 });
    expect(r?.ok).toBe(false);
    expect(estado.falha?.definitivo).toBe(true);
  });
});
