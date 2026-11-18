import { describe, expect, it } from "vitest";
import {
  categoriaFoiDita,
  encontrarCategoria,
  gerarCodigo,
  hashCodigo,
  horaFoiDita,
  LimitadorPorMinuto,
  limitarEmojis,
  numeroPermitido,
  respostaAfirmativa,
  valorFoiDito,
  valoresNoTexto,
  variantesCelular,
} from "./regras";

describe("valores ditos pela pessoa (regra 'nunca adivinhar')", () => {
  it("acha valores em vários formatos", () => {
    expect(valoresNoTexto("gastei 50 no mercado")).toContain(50);
    expect(valoresNoTexto("paguei R$ 1.234,56 de aluguel")).toContain(1234.56);
    expect(valoresNoTexto("o aluguel de 3.000 vence dia 5")).toContain(3000);
    expect(valoresNoTexto("uns 3 mil")).toContain(3000);
    expect(valoresNoTexto("2,5k no carro")).toContain(2500);
    expect(valoresNoTexto("gastei mil reais")).toContain(1000);
    expect(valoresNoTexto("12,90.")).toContain(12.9);
  });
  it("só aceita se o valor apareceu", () => {
    const textos = ["gastei 50 no mercado", "categoria mercado"];
    expect(valorFoiDito(50, textos)).toBe(true);
    expect(valorFoiDito(55, textos)).toBe(false);
    expect(valorFoiDito(30, ["gastei no mercado"])).toBe(false);
  });
});

describe("categorias", () => {
  const cats = [{ nome: "Saúde" }, { nome: "Mercado" }, { nome: "Contas" }];
  it("acha sem diferenciar acentos e maiúsculas", () => {
    expect(encontrarCategoria("saude", cats)?.nome).toBe("Saúde");
    expect(encontrarCategoria("MERCADO ", cats)?.nome).toBe("Mercado");
    expect(encontrarCategoria("Farmácia", cats)).toBeUndefined();
  });
  it("só aceita categoria que a pessoa disse", () => {
    expect(categoriaFoiDita("Saúde", ["remédio, categoria saude"])).toBe(true);
    expect(categoriaFoiDita("Mercado", ["gastei 50 nos mercados"])).toBe(true);
    expect(categoriaFoiDita("Mercado", ["gastei 50 no supermercado"])).toBe(false);
    expect(categoriaFoiDita("Contas", ["gastei 50"])).toBe(false);
  });
});

describe("horário do lembrete", () => {
  it("reconhece horários", () => {
    for (const t of ["amanhã às 9h", "dia 3 às 14:30", "segunda 8h30", "às 7 da manhã", "meio-dia", "daqui a 10 minutos", "em 2 horas", "hoje de noite"]) {
      expect(horaFoiDita([t]), t).toBe(true);
    }
  });
  it("sem horário, pede", () => {
    expect(horaFoiDita(["me lembra amanhã de pagar a luz"])).toBe(false);
    expect(horaFoiDita(["dia 3 pagar o aluguel"])).toBe(false);
  });
});

describe("confirmação", () => {
  it("entende sim", () => {
    for (const t of ["sim", "Sim!", "pode", "confirmo", "ok", "isso mesmo", "pode apagar"]) expect(respostaAfirmativa(t), t).toBe(true);
  });
  it("não aceita dúvida nem não", () => {
    for (const t of ["não", "nao, espera", "talvez", "sim? não sei", "ok não", "quais?"]) expect(respostaAfirmativa(t), t).toBe(false);
  });
});

describe("celular", () => {
  it("considera com e sem o 9", () => {
    expect(variantesCelular("5511993776119")).toEqual(["5511993776119", "551193776119"]);
    expect(variantesCelular("551193776119")).toEqual(["551193776119", "5511993776119"]);
    expect(variantesCelular("4915123456789")).toEqual(["4915123456789"]);
  });
  it("modo só números liberados", () => {
    expect(numeroPermitido("5511993776119", [])).toBe(true);
    expect(numeroPermitido("551193776119", ["5511993776119"])).toBe(true);
    expect(numeroPermitido("5521988887777", ["5511993776119"])).toBe(false);
  });
});

describe("código de verificação", () => {
  it("6 dígitos e hash por pessoa", () => {
    expect(gerarCodigo()).toMatch(/^\d{6}$/);
    expect(hashCodigo("123456", "a")).not.toBe(hashCodigo("123456", "b"));
    expect(hashCodigo("123456", "a")).toBe(hashCodigo("123456", "a"));
  });
});

describe("limite por minuto", () => {
  it("bloqueia depois do máximo e libera depois de 1 minuto", () => {
    const l = new LimitadorPorMinuto(2);
    expect(l.permitir("x", 0)).toBe(true);
    expect(l.permitir("x", 1)).toBe(true);
    expect(l.permitir("x", 2)).toBe(false);
    expect(l.permitir("y", 2)).toBe(true);
    expect(l.permitir("x", 61_000)).toBe(true);
  });
});

describe("emojis", () => {
  it("deixa no máximo 1", () => {
    expect(limitarEmojis("Feito ✅ e pronto 🎉😀")).toBe("Feito ✅ e pronto ");
  });
});
