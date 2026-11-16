import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { gerarCsv, gerarPdf, type DadosRelatorio } from "./relatorio";
import { lerFiltros, filtrosParaQuery, somar, totalPorCategoria } from "./despesas";

const dados: DadosRelatorio = {
  titulo: "Despesas",
  periodo: "Este mês (01/11/2026 a 16/11/2026)",
  geradoEm: "16/11/2026 às 15:30",
  linhas: [
    { data: "2026-11-16", descricao: "Pão de açúcar; \"promoção\"", categoria: "Mercado", valor: 1234.5 },
    { data: "2026-11-02", descricao: "=1+1 truque", categoria: "Saúde", valor: 50 },
    { data: "2026-11-01", descricao: "Café ☕ com emoji", categoria: "Restaurante", valor: 9.9 },
  ],
};

describe("planilha (CSV)", () => {
  const csv = gerarCsv(dados);
  it("começa com a marca que o Excel usa para ler acentos", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
  it("usa ponto e vírgula e vírgula decimal", () => {
    expect(csv).toContain("Data;Descrição;Categoria;Valor (R$)");
    expect(csv).toContain("16/11/2026;");
    expect(csv).toContain(";1234,50");
  });
  it("protege textos com ; e aspas", () => {
    expect(csv).toContain('"Pão de açúcar; ""promoção"""');
  });
  it("impede fórmulas do Excel", () => {
    expect(csv).toContain("'=1+1 truque");
  });
  it("tem a linha de total", () => {
    expect(csv).toContain(";TOTAL;1294,40");
  });
});

describe("PDF", () => {
  it("gera um PDF válido, inclusive com acentos e emoji", async () => {
    const bytes = await gerarPdf(dados);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
  it("aguenta muitas linhas (várias páginas)", async () => {
    const muitas = { ...dados, linhas: Array.from({ length: 200 }, (_, i) => ({ ...dados.linhas[0], descricao: `item ${i}` })) };
    const bytes = await gerarPdf(muitas);
    const lido = await PDFDocument.load(bytes);
    expect(lido.getPageCount()).toBeGreaterThanOrEqual(4);
  });
  it("gera mesmo sem despesas", async () => {
    const bytes = await gerarPdf({ ...dados, linhas: [] });
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe("filtros das despesas", () => {
  it("lê os filtros e ignora valores estranhos", () => {
    const f = lerFiltros({ periodo: "semana", categoria: "nao-e-uuid", busca: "  mercado " }, "2026-11-19");
    expect(f).toEqual({ periodo: "semana", de: "2026-11-16", ate: "2026-11-19", categoria: "", busca: "mercado" });
  });
  it("monta o endereço com o mesmo filtro (para exportar)", () => {
    const f = lerFiltros({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-31" }, "2026-11-19");
    expect(filtrosParaQuery(f)).toBe("periodo=personalizado&de=2026-10-01&ate=2026-10-31");
  });
  it("soma sem erro de centavos", () => {
    expect(somar([{ valor: 0.1 }, { valor: 0.2 }])).toBe(0.3);
    const t = totalPorCategoria([
      { id: "1", valor: 10.1, descricao: "", data: "", categoria_id: "a", origem: "" },
      { id: "2", valor: 20.2, descricao: "", data: "", categoria_id: "a", origem: "" },
    ]);
    expect(t.get("a")).toBe(30.3);
  });
});

import { situacaoDoOrcamento } from "./orcamento";
import { formatarReais } from "./dinheiro";

describe("orçamento por categoria", () => {
  it("verde abaixo de 80%, âmbar a partir de 80%, vermelho a partir de 100%", () => {
    expect(situacaoDoOrcamento(300, 500, formatarReais)).toMatchObject({ cor: "verde", texto: "faltam R$ 200,00" });
    expect(situacaoDoOrcamento(400, 500, formatarReais)).toMatchObject({ cor: "ambar", percentual: 80 });
    expect(situacaoDoOrcamento(500, 500, formatarReais)).toMatchObject({ cor: "vermelho", texto: "limite atingido" });
    expect(situacaoDoOrcamento(612.3, 500, formatarReais)).toMatchObject({ cor: "vermelho", texto: "passou R$ 112,30" });
  });
});

import { classeLargura } from "./orcamento";
describe("largura da barra", () => {
  it("arredonda de 5 em 5% e não passa de 100%", () => {
    expect(classeLargura(0)).toBe("w-0");
    expect(classeLargura(1)).toBe("w-[5%]");
    expect(classeLargura(42)).toBe("w-[40%]");
    expect(classeLargura(80)).toBe("w-[80%]");
    expect(classeLargura(250)).toBe("w-full");
  });
});
