import { describe, expect, it } from "vitest";
import {
  diaDaSemana,
  formatarData,
  formatarDataHora,
  hojeISO,
  instanteParaLocal,
  intervaloDoPeriodo,
  lerPeriodo,
  localParaInstante,
  somarDias,
  dataValida,
} from "./datas";
import { formatarReais, lerValor, valorParaCampo } from "./dinheiro";

describe("lerValor", () => {
  it("entende os jeitos comuns de escrever valores", () => {
    expect(lerValor("50")).toBe(50);
    expect(lerValor("50,5")).toBe(50.5);
    expect(lerValor("50,50")).toBe(50.5);
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("R$ 3.000")).toBe(3000);
    expect(lerValor("3.000,00")).toBe(3000);
    expect(lerValor("1234.56")).toBe(1234.56);
    expect(lerValor("12.5")).toBe(12.5);
    expect(lerValor(" 1 234,00 ")).toBe(1234);
  });
  it("recusa o que não é valor", () => {
    expect(lerValor("")).toBeNull();
    expect(lerValor("0")).toBeNull();
    expect(lerValor("-10")).toBeNull();
    expect(lerValor("abc")).toBeNull();
    expect(lerValor("1,2,3")).toBeNull();
    expect(lerValor("12,345")).toBeNull();
    expect(lerValor("1.2.3")).toBeNull();
    expect(lerValor("10.000.000.000,00")).toBeNull();
  });
});

describe("formatarReais", () => {
  it("formato brasileiro", () => {
    expect(formatarReais(1234.56)).toBe("R$ 1.234,56");
    expect(formatarReais(50)).toBe("R$ 50,00");
    expect(valorParaCampo(1234.5)).toBe("1234,50");
  });
});

describe("datas em Brasília", () => {
  it("hoje usa o fuso de Brasília (às 01h UTC ainda é ontem no Brasil)", () => {
    expect(hojeISO(new Date("2026-11-17T01:30:00Z"))).toBe("2026-11-16");
    expect(hojeISO(new Date("2026-11-17T03:30:00Z"))).toBe("2026-11-17");
  });
  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2027-01-01", -1)).toBe("2026-12-31");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("dia da semana", () => {
    expect(diaDaSemana("2026-11-16")).toBe(1); // segunda
    expect(diaDaSemana("2026-11-22")).toBe(0); // domingo
  });
  it("valida datas", () => {
    expect(dataValida("2026-02-29")).toBe(false);
    expect(dataValida("2028-02-29")).toBe(true);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("16/11/2026")).toBe(false);
  });
  it("formata", () => {
    expect(formatarData("2026-11-05")).toBe("05/11/2026");
  });
});

describe("períodos", () => {
  it("esta semana = segunda até hoje", () => {
    expect(intervaloDoPeriodo("semana", "2026-11-19")).toEqual({ de: "2026-11-16", ate: "2026-11-19" }); // quinta
    expect(intervaloDoPeriodo("semana", "2026-11-16")).toEqual({ de: "2026-11-16", ate: "2026-11-16" }); // segunda
    expect(intervaloDoPeriodo("semana", "2026-11-22")).toEqual({ de: "2026-11-16", ate: "2026-11-22" }); // domingo
  });
  it("este mês = dia 1 até hoje", () => {
    expect(intervaloDoPeriodo("mes", "2026-11-16")).toEqual({ de: "2026-11-01", ate: "2026-11-16" });
  });
  it("mês passado, inclusive virando o ano", () => {
    expect(intervaloDoPeriodo("mes-passado", "2026-11-16")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervaloDoPeriodo("mes-passado", "2027-01-10")).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
    expect(intervaloDoPeriodo("mes-passado", "2026-03-10")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });
  it("últimos 30 dias, ano, tudo", () => {
    expect(intervaloDoPeriodo("30dias", "2026-11-30")).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(intervaloDoPeriodo("ano", "2026-11-16")).toEqual({ de: "2026-01-01", ate: "2026-11-16" });
    expect(intervaloDoPeriodo("tudo", "2026-11-16")).toEqual({ de: null, ate: null });
  });
  it("datas escolhidas: ignora inválidas e inverte se vierem trocadas", () => {
    expect(intervaloDoPeriodo("personalizado", "2026-11-16", "2026-11-10", "2026-11-01")).toEqual({ de: "2026-11-01", ate: "2026-11-10" });
    expect(intervaloDoPeriodo("personalizado", "2026-11-16", "lixo", "2026-11-01")).toEqual({ de: null, ate: "2026-11-01" });
  });
  it("período desconhecido vira 'este mês'", () => {
    expect(lerPeriodo("qualquer")).toBe("mes");
    expect(lerPeriodo("ano")).toBe("ano");
  });
});

describe("horário dos lembretes (Brasília)", () => {
  it("converte o horário digitado para o instante certo", () => {
    expect(localParaInstante("2026-11-17T09:00")).toBe("2026-11-17T12:00:00.000Z");
    expect(localParaInstante("2026-12-31T23:30")).toBe("2027-01-01T02:30:00.000Z");
  });
  it("e volta", () => {
    expect(instanteParaLocal("2026-11-17T12:00:00Z")).toBe("2026-11-17T09:00");
    expect(formatarDataHora("2026-11-17T12:00:00Z")).toBe("17/11/2026 às 09:00");
  });
  it("recusa horário inválido", () => {
    expect(localParaInstante("2026-11-17 09:00")).toBeNull();
    expect(localParaInstante("2026-02-30T09:00")).toBeNull();
    expect(localParaInstante("2026-11-17T25:00")).toBeNull();
  });
});
