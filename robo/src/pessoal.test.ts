import { describe, expect, it, vi } from "vitest";

vi.mock("./whatsapp", () => ({ conectado: () => true, enviarTexto: async () => {} }));
vi.mock("./banco", () => ({}));

const { montarResumoManha } = await import("./pessoal");

const email = (de: string, resumo: string, importancia: "urgente" | "importante" = "importante") => ({
  id: de,
  recebido_em: "2026-11-18T10:00:00Z",
  remetente_nome: de,
  remetente_email: `${de.toLowerCase()}@x.com`,
  assunto: "assunto",
  resumo,
  importancia,
  motivo: null,
  avisado_em: null,
});

const compromisso = (titulo: string, inicio: string, fim: string) => ({
  chave: titulo,
  titulo,
  inicio: new Date(inicio),
  fim: new Date(fim),
  diaInteiro: false,
  dia: inicio.slice(0, 10),
  local: "",
});

describe("resumo da manhã", () => {
  it("agenda e e-mails", () => {
    const t = montarResumoManha("Henrique", [compromisso("Dentista", "2026-11-18T12:00:00Z", "2026-11-18T13:00:00Z")], [email("Banco", "Fatura de R$ 500 vence dia 20")]);
    expect(t).toContain("Bom dia, Henrique!");
    expect(t).toContain("• 09:00–10:00 Dentista");
    expect(t).toContain("• *Banco*: Fatura de R$ 500 vence dia 20");
  });
  it("agenda livre e sem e-mails importantes", () => {
    const t = montarResumoManha("Ana", [], []);
    expect(t).toContain("Agenda livre hoje");
    expect(t).toContain("Nenhum e-mail importante");
  });
  it("sem agenda conectada e sem e-mails: não manda nada", () => {
    expect(montarResumoManha("Ana", null, [])).toBe("");
  });
  it("muitos e-mails: mostra 8 e avisa o resto", () => {
    const muitos = Array.from({ length: 11 }, (_, i) => email(`R${i}`, `assunto ${i}`));
    expect(montarResumoManha("Ana", null, muitos)).toContain("e mais 3 no site");
  });
});
