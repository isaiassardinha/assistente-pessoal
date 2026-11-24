import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  config: { geminiChave: "x", geminiModelo: "principal", geminiModeloReserva: "reserva" },
}));

import { _trocarEspera, comRepeticao, IaIndisponivel, situacaoInstabilidade, tipoDeFalha } from "./ia";

const erro = (status: number, message = `erro ${status}`) => Object.assign(new Error(message), { status });

beforeAll(() => _trocarEspera(async () => {}));

describe("tipo de falha", () => {
  it("separa cota, instabilidade e erro de verdade", () => {
    expect(tipoDeFalha(erro(429))).toBe("cota");
    expect(tipoDeFalha(new Error("RESOURCE_EXHAUSTED: quota"))).toBe("cota");
    expect(tipoDeFalha(erro(503))).toBe("instavel");
    expect(tipoDeFalha(new Error("The model is overloaded. Please try again later."))).toBe("instavel");
    expect(tipoDeFalha(new Error("fetch failed"))).toBe("instavel");
    expect(tipoDeFalha(erro(400, "invalid argument"))).toBeNull();
  });
});

describe("repetição e reserva", () => {
  it("instabilidade passageira: repete no mesmo modelo", async () => {
    const chamadas: string[] = [];
    const r = await comRepeticao("teste", async (m) => {
      chamadas.push(m);
      if (chamadas.length === 1) throw erro(503);
      return "ok";
    });
    expect(r).toEqual({ valor: "ok", modelo: "principal" });
    expect(chamadas).toEqual(["principal", "principal"]);
  });

  it("principal continua caindo: usa o reserva", async () => {
    const chamadas: string[] = [];
    const r = await comRepeticao("teste", async (m) => {
      chamadas.push(m);
      if (m === "principal") throw erro(503);
      return "ok";
    });
    expect(r.modelo).toBe("reserva");
    expect(chamadas).toEqual(["principal", "principal", "reserva"]);
  });

  it("cota: não repete o principal, vai direto ao reserva", async () => {
    const chamadas: string[] = [];
    await comRepeticao("teste", async (m) => {
      chamadas.push(m);
      if (m === "principal") throw erro(429);
      return "ok";
    });
    expect(chamadas).toEqual(["principal", "reserva"]);
  });

  it("erro de verdade: não repete", async () => {
    const chamadas: string[] = [];
    await expect(
      comRepeticao("teste", async (m) => {
        chamadas.push(m);
        throw erro(400, "invalid argument");
      }),
    ).rejects.not.toBeInstanceOf(IaIndisponivel);
    expect(chamadas).toEqual(["principal"]);
  });

  it("tudo falha: IaIndisponivel com o motivo do principal", async () => {
    const chamadas: string[] = [];
    const p = comRepeticao("teste", async (m) => {
      chamadas.push(m);
      throw m === "principal" ? erro(503, "overloaded") : erro(404, "model not found");
    });
    await expect(p).rejects.toBeInstanceOf(IaIndisponivel);
    await expect(p).rejects.toThrow("overloaded");
    expect(chamadas).toEqual(["principal", "principal", "reserva"]);
  });

  it("só um modelo (vetores): repete e desiste", async () => {
    let n = 0;
    await expect(
      comRepeticao("vetores", async () => {
        n++;
        throw erro(503);
      }, ["embedding"]),
    ).rejects.toBeInstanceOf(IaIndisponivel);
    expect(n).toBe(2);
  });

  it("página de saúde conta o que aconteceu", () => {
    const s = situacaoInstabilidade();
    expect(s.ultimas24h.resolvidasRepetindo).toBeGreaterThanOrEqual(1);
    expect(s.ultimas24h.resolvidasComReserva).toBeGreaterThanOrEqual(2);
    expect(s.ultimas24h.semSaida).toBeGreaterThanOrEqual(2);
    expect(s.reserva).toBe("reserva");
  });
});
