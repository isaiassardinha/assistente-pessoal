// Espaços: mensagens que viram memória e o envio de arquivo para o Drive.

import { describe, expect, it, vi } from "vitest";

const indexadas: { id: number; conteudo: string | null }[] = [];

vi.mock("./banco", () => ({
  mensagensParaIndexar: async () => [
    { id: 1, espaco_id: "e1", autor_id: "u1", autor_nome: "Ana", texto: "bom dia pessoal", criado_em: "2026-11-19T12:00:00Z" },
    { id: 2, espaco_id: "e1", autor_id: "u1", autor_nome: "Ana", texto: "O orçamento do pedreiro ficou em 12 mil, pagamento em 3 vezes", criado_em: "2026-11-19T12:05:00Z" },
    { id: 3, espaco_id: "e1", autor_id: "u2", autor_nome: "Bruno", texto: "kkkkk 👍", criado_em: "2026-11-19T12:06:00Z" },
  ],
  indexarMensagemEspaco: async (_e: string, id: number, conteudo: string | null) => {
    indexadas.push({ id, conteudo });
  },
  registrarUsoIa: async () => {},
}));
vi.mock("./ia", () => ({
  IaIndisponivel: class extends Error {},
  gerarVetores: async (textos: string[]) => textos.map(() => [0.1]),
  resumir: async () => "",
}));

const { indexarMensagens, mensagemSemConteudo } = await import("./espacos");
const { corpoDoEnvio, idDoDriveValido } = await import("./googleDrive");

describe("mensagens que viram memória", () => {
  it("conversa sem conteúdo não vira memória", () => {
    for (const t of ["ok", "bom dia", "Bom dia pessoal!", "kkkkkk", "👍👍", "valeu", "obrigada"]) expect(mensagemSemConteudo(t)).toBe(true);
    for (const t of ["a senha do wi-fi é casa2024", "o pedreiro começa segunda às 8h"]) expect(mensagemSemConteudo(t)).toBe(false);
  });

  it("indexa com autor e data; as curtas só são marcadas", async () => {
    expect(await indexarMensagens()).toBe(3);
    expect(indexadas.find((x) => x.id === 1)?.conteudo).toBeNull();
    expect(indexadas.find((x) => x.id === 3)?.conteudo).toBeNull();
    expect(indexadas.find((x) => x.id === 2)?.conteudo).toBe("Ana em 19/11 09:05: O orçamento do pedreiro ficou em 12 mil, pagamento em 3 vezes");
  });
});

describe("Google Drive", () => {
  it("monta o envio com a ficha (nome e pasta) e o conteúdo", () => {
    const { corpo, tipo } = corpoDoEnvio("contrato.pdf", "application/pdf", "pasta123", Buffer.from("%PDF-1.7"), "SEP");
    expect(tipo).toBe("multipart/related; boundary=SEP");
    const texto = corpo.toString();
    expect(texto).toContain('{"name":"contrato.pdf","parents":["pasta123"]}');
    expect(texto).toContain("content-type: application/pdf\r\n\r\n%PDF-1.7\r\n--SEP--");
  });

  it("confere o id do arquivo", () => {
    expect(idDoDriveValido("1AbC_dEf-GhIjKlMnOp")).toBe(true);
    expect(idDoDriveValido("../../etc")).toBe(false);
  });
});
