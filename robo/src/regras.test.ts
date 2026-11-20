import { describe, expect, it } from "vitest";
import {
  dataFoiDita,
  diaFoiDito,
  textoFoiDito,
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
    for (const t of [
      "amanhã às 9h",
      "dia 3 às 14:30",
      "segunda 8h30",
      "às 7 da manhã",
      "meio-dia",
      "daqui a 10 minutos",
      "em 2 horas",
      "hoje de noite",
    ]) {
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

describe("anotação foi dita pela pessoa", () => {
  it("aceita quando usa as palavras e números da pessoa", () => {
    expect(textoFoiDito("A placa do carro é ABC1D23", ["guarda aí: a placa do meu carro é ABC1D23"])).toBe(true);
    expect(textoFoiDito("Senha do wi-fi da casa da mãe: flor2024", ["anota que a senha do wifi da casa da minha mãe é flor2024"])).toBe(
      true,
    );
  });
  it("recusa número ou código que a pessoa não disse", () => {
    expect(textoFoiDito("A placa do carro é ABC1D24", ["a placa do meu carro é ABC1D23"])).toBe(false);
    expect(textoFoiDito("Tamanho do sapato: 42", ["guarda meu tamanho de sapato"])).toBe(false);
  });
  it("recusa texto inventado", () => {
    expect(textoFoiDito("Consulta com o cardiologista dia 10", ["guarda isso pra mim"])).toBe(false);
    expect(textoFoiDito("", ["qualquer coisa"])).toBe(false);
  });
});

describe("data e dia ditos", () => {
  const hoje = "2026-11-18"; // quarta
  it("aceita número do dia, hoje, amanhã e dia da semana", () => {
    expect(dataFoiDita("2026-11-25", ["vence dia 25"], hoje)).toBe(true);
    expect(dataFoiDita("2026-12-05", ["vence 05/12"], hoje)).toBe(true);
    expect(dataFoiDita("2026-11-18", ["vence hoje"], hoje)).toBe(true);
    expect(dataFoiDita("2026-11-19", ["vence amanhã"], hoje)).toBe(true);
    expect(dataFoiDita("2026-11-20", ["depois de amanhã"], hoje)).toBe(true);
    expect(dataFoiDita("2026-11-20", ["vence sexta"], hoje)).toBe(true);
  });
  it("recusa data que não foi dita", () => {
    expect(dataFoiDita("2026-11-25", ["tenho um boleto pra pagar"], hoje)).toBe(false);
    expect(dataFoiDita("2026-11-19", ["vence hoje"], hoje)).toBe(false);
    expect(dataFoiDita("2026-11-27", ["vence sexta"], hoje)).toBe(false);
  });
  it("dia do mês", () => {
    expect(diaFoiDito(10, ["todo dia 10"])).toBe(true);
    expect(diaFoiDito(5, ["vence dia 05"])).toBe(true);
    expect(diaFoiDito(1, ["todo dia 10"])).toBe(false);
  });
});

describe("grupos", () => {
  it("tira a menção do robô do texto", async () => {
    const { tirarMencoes } = await import("./regras");
    expect(tirarMencoes("@5511916273194 qual o prazo do contrato?", ["5511916273194"])).toBe("qual o prazo do contrato?");
    expect(tirarMencoes("Oi @123456789012345, tudo bem?", ["123456789012345"])).toBe("Oi , tudo bem?");
    expect(tirarMencoes("fala com @5511999998888 depois", ["5511916273194"])).toBe("fala com @5511999998888 depois");
  });

  it("acha o código de ligação", async () => {
    const { codigosDeLigacao } = await import("./regras");
    expect(codigosDeLigacao("K7MPQ2")).toEqual(["K7MPQ2"]);
    expect(codigosDeLigacao("ligar abcdef por favor")).toEqual(["ABCDEF"]);
    expect(codigosDeLigacao("código: x9y8z7.")).toEqual(["X9Y8Z7"]);
    expect(codigosDeLigacao("12345")).toEqual([]);
    expect(codigosDeLigacao("O1O1O1")).toEqual([]); // 0, O, 1 e I não existem nos códigos
  });
});
