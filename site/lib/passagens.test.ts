import { describe, expect, it } from "vitest";
import { datasLegiveis, lerAeroportos, rotaLegivel, validarVigia } from "./passagens";

const hoje = "2026-11-20";
const base = { origem: "gru", destino: "MIA", preco_alvo: "3.000", ida: "2027-03-10", volta: "2027-03-20", tipo: "volta" };

describe("formulário de vigia", () => {
  it("ida e volta", () => {
    const r = validarVigia(base, hoje);
    expect(r.erro).toBeUndefined();
    expect(r.dados).toMatchObject({ origem: "GRU", destino: "MIA", volta: "2027-03-20", so_ida: false, preco_alvo: 3000, adultos: 1 });
  });
  it("só ida ignora a volta", () => {
    expect(validarVigia({ ...base, tipo: "ida" }, hoje).dados).toMatchObject({ volta: null, so_ida: true });
  });
  it("flexível com e sem duração", () => {
    expect(validarVigia({ ...base, tipo: "flexivel", ida_ate: "2027-03-31", dias_viagem: "10" }, hoje).dados).toMatchObject({
      ida_ate: "2027-03-31",
      dias_viagem: 10,
      volta: null,
      so_ida: false,
    });
    expect(validarVigia({ ...base, tipo: "flexivel", ida_ate: "2027-03-31" }, hoje).dados).toMatchObject({ so_ida: true, dias_viagem: null });
  });
  it("erros", () => {
    expect(validarVigia({ ...base, origem: "São Paulo" }, hoje).erro).toMatch(/código do aeroporto/);
    expect(validarVigia({ ...base, destino: "GRU" }, hoje).erro).toMatch(/iguais/);
    expect(validarVigia({ ...base, preco_alvo: "" }, hoje).erro).toMatch(/preço-alvo/);
    expect(validarVigia({ ...base, ida: "2026-01-01" }, hoje).erro).toMatch(/ida inválida/);
    expect(validarVigia({ ...base, volta: "2027-03-01" }, hoje).erro).toMatch(/volta inválida/);
    expect(validarVigia({ ...base, tipo: "flexivel", ida_ate: "2027-09-01" }, hoje).erro).toMatch(/janela/);
    expect(validarVigia({ ...base, adultos: "12" }, hoje).erro).toMatch(/Adultos/);
  });
  it("textos", () => {
    expect(lerAeroportos(" gru / cgh ,vcp")).toBe("GRU,CGH,VCP");
    expect(rotaLegivel({ origem: "GRU,CGH", destino: "MIA" })).toBe("GRU/CGH → MIA");
    expect(datasLegiveis({ ida: "2027-03-10", volta: "2027-03-20" })).toBe("10/03 a 20/03");
  });
});
