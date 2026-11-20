// Ferramentas de passagem com banco e SerpApi de mentira.

import { beforeEach, describe, expect, it, vi } from "vitest";

const criadas: Record<string, unknown>[] = [];
const apagadas: string[][] = [];
const pendente: { atual: { tipo: string; dados: { ids: string[]; descricao: string[] } } | null } = { atual: null };
const servico = { configurado: true, restantes: 100, buscas: 0 };

vi.mock("./pessoal", () => ({ SemPermissaoNaAgenda: class extends Error {} }));
vi.mock("./cerebro", () => ({ buscar: async () => ({ trechos: [], fontes: [] }) }));

const VIGIA = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  origem: "GRU",
  destino: "MIA",
  descricao: "São Paulo → Miami",
  ida: "2027-03-10",
  ida_ate: null,
  volta: "2027-03-20",
  dias_viagem: null,
  so_ida: false,
  adultos: 1,
  so_direto: false,
  preco_alvo: 3000,
  ativa: true,
  encerrada_motivo: null,
  ultimo_preco: null,
  ultima_busca: null,
  menor_preco: null,
  abaixo_do_alvo: false,
  ultimo_aviso_preco: null,
  erro: null,
  ...extra,
});

vi.mock("./banco", () => ({
  categorias: async () => [],
  LimiteDeVigias: class extends Error {},
  criarVigia: async (_u: string, v: Record<string, unknown>) => {
    criadas.push(v);
    return VIGIA("11111111-1111-4111-8111-111111111111", v);
  },
  vigiasPorIds: async (_u: string, ids: string[]) => ids.map((id) => VIGIA(id)),
  apagarVigias: async (_u: string, ids: string[]) => {
    apagadas.push(ids);
    return ids.length;
  },
  salvarAcaoPendente: async (_u: string, tipo: string, dados: { ids: string[]; descricao: string[] }) => {
    pendente.atual = { tipo, dados };
  },
  lerAcaoPendente: async () => pendente.atual,
  apagarAcaoPendente: async () => {
    pendente.atual = null;
  },
}));

vi.mock("./passagens", async (original) => {
  const real = await original<typeof import("./passagens")>();
  return {
    ...real,
    passagensConfigurado: () => servico.configurado,
    cota: async () => ({ restantes: servico.restantes, porMes: 250 }),
    buscarVoos: async () => {
      servico.buscas++;
      return {
        voos: [{ preco: 2890, companhias: ["LATAM"], paradas: 0, escalas: [], duracaoMin: 510, partida: "2027-03-10 23:50", chegada: "2027-03-11 07:20" }],
        nivel: "baixo",
        faixaTipica: null,
        link: "https://x.test/voo",
      };
    },
  };
});

vi.mock("./vigias", () => ({
  checarVigia: async () => {
    servico.buscas++;
    return { preco: 2890, texto: "R$ 2.890,00, LATAM, direto", link: "https://x.test/voo", abaixo: true, avisou: true };
  },
}));

const { criarFerramentas } = await import("./ferramentas");

const usuario = { id: "u1", nome: "Ana Silva", nome_assistente: "Assistente", celular: "5511999999999", is_admin: false };

function ferramenta(nome: string, textos: string[]) {
  const f = criarFerramentas({ usuario, textosDaPessoa: textos, ultimaMensagem: textos.at(-1) ?? "", hoje: "2026-11-20" }).find((x) => x.nome === nome);
  if (!f) throw new Error(nome);
  return f;
}

type Resposta = { resultado: string; [k: string]: unknown };

beforeEach(() => {
  criadas.length = 0;
  apagadas.length = 0;
  pendente.atual = null;
  Object.assign(servico, { configurado: true, restantes: 100, buscas: 0 });
});

describe("criar vigia: nunca adivinhar", () => {
  const pedido = "me avisa quando GRU Miami de 10/03 a 20/03 ficar abaixo de 3000";
  const args = { origem: "GRU", destino: "MIA", ida: "2027-03-10", volta: "2027-03-20", preco_alvo: 3000 };

  it("grava com tudo dito e já traz o preço de agora", async () => {
    const r = (await ferramenta("criar_vigia_passagem", [pedido]).executar(args)) as Resposta;
    expect(r.resultado).toBe("GRAVADO");
    expect(r.preco_agora).toBe("R$ 2.890,00");
    expect(r.ja_abaixo_do_alvo).toBe(true);
    expect(criadas[0]).toMatchObject({ origem: "GRU", destino: "MIA", volta: "2027-03-20", preco_alvo: 3000, so_ida: false });
  });
  it("preço-alvo não dito", async () => {
    const r = (await ferramenta("criar_vigia_passagem", ["vigia GRU Miami de 10/03 a 20/03"]).executar(args)) as Resposta;
    expect(r.resultado).toMatch(/^NÃO GRAVADO.*preço-alvo/);
    expect(criadas).toHaveLength(0);
  });
  it("datas não ditas", async () => {
    const r = (await ferramenta("criar_vigia_passagem", ["vigia Miami abaixo de 3000"]).executar(args)) as Resposta;
    expect(r.resultado).toMatch(/^NÃO GRAVADO.*datas/);
  });
  it("sem volta e sem 'só ida': pergunta", async () => {
    const r = (await ferramenta("criar_vigia_passagem", ["Miami dia 10/03 abaixo de 3000"]).executar({ ...args, volta: "" })) as Resposta;
    expect(r.resultado).toMatch(/só ida ou ida e volta/);
  });
  it("datas flexíveis: basta o mês, mas a duração precisa ser dita", async () => {
    const flex = { origem: "GRU", destino: "LIS", ida: "2027-04-01", ida_ate: "2027-04-30", dias_viagem: 10, preco_alvo: 4000 };
    const semDuracao = (await ferramenta("criar_vigia_passagem", ["Lisboa em abril abaixo de 4000"]).executar(flex)) as Resposta;
    expect(semDuracao.resultado).toMatch(/^NÃO GRAVADO.*dias/);
    const ok = (await ferramenta("criar_vigia_passagem", ["Lisboa em abril, 10 dias, abaixo de 4000"]).executar(flex)) as Resposta;
    expect(ok.resultado).toBe("GRAVADO");
    expect(criadas.at(-1)).toMatchObject({ ida_ate: "2027-04-30", dias_viagem: 10, volta: null });
  });
  it("data que já passou ou longe demais", async () => {
    const passou = (await ferramenta("criar_vigia_passagem", ["dia 10/03 a 20/03, 3000"]).executar({ ...args, ida: "2026-03-10", volta: "2026-03-20" })) as Resposta;
    expect(passou.resultado).toMatch(/já passou/);
    const longe = (await ferramenta("criar_vigia_passagem", ["dia 10/03 a 20/03, 3000"]).executar({ ...args, ida: "2028-03-10", volta: "2028-03-20" })) as Resposta;
    expect(longe.resultado).toMatch(/longe demais/);
  });
  it("aeroporto inválido", async () => {
    const r = (await ferramenta("criar_vigia_passagem", [pedido]).executar({ ...args, destino: "Miami" })) as Resposta;
    expect(r.resultado).toMatch(/IATA/);
  });
  it("serviço não configurado: não grava", async () => {
    servico.configurado = false;
    const r = (await ferramenta("criar_vigia_passagem", [pedido]).executar(args)) as Resposta;
    expect(r.resultado).toMatch(/NÃO CONFIGURADO/);
    expect(criadas).toHaveLength(0);
  });
  it("cota apertada: grava sem consultar agora", async () => {
    servico.restantes = 0;
    const r = (await ferramenta("criar_vigia_passagem", [pedido]).executar(args)) as Resposta;
    expect(r.resultado).toBe("GRAVADO");
    expect(servico.buscas).toBe(0);
  });
});

describe("buscar passagens", () => {
  it("cidade com vários aeroportos e resposta resumida", async () => {
    const r = (await ferramenta("buscar_passagens", ["passagem SP Miami 10/03 a 20/03"]).executar({
      origem: "gru, cgh , vcp",
      destino: "MIA",
      ida: "2027-03-10",
      volta: "2027-03-20",
    })) as Resposta;
    expect(r.resultado).toBe("ENCONTRADO");
    expect(r.rota).toBe("GRU,CGH,VCP → MIA");
    expect(r.link_para_comprar).toBe("https://x.test/voo");
  });
  it("cota do mês acabou", async () => {
    servico.restantes = 0;
    const r = (await ferramenta("buscar_passagens", ["x"]).executar({ origem: "GRU", destino: "MIA", ida: "2027-03-10" })) as Resposta;
    expect(r.resultado).toMatch(/cota mensal/);
    expect(servico.buscas).toBe(0);
  });
  it("limite de buscas por pessoa por dia", async () => {
    const f = ferramenta("buscar_passagens", ["x"]);
    for (let i = 0; i < 15; i++) await f.executar({ origem: "GRU", destino: "MIA", ida: "2027-03-10" });
    const r = (await f.executar({ origem: "GRU", destino: "MIA", ida: "2027-03-10" })) as Resposta;
    expect(r.resultado).toMatch(/limite de 15/);
  });
});

describe("apagar vigias", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("uma: na hora", async () => {
    const r = (await ferramenta("apagar_vigias_passagem", ["apaga a vigia de miami"]).executar({ ids: [A] })) as Resposta;
    expect(r.resultado).toBe("APAGADA");
    expect(apagadas).toEqual([[A]]);
  });
  it("várias: só depois do sim", async () => {
    const r = (await ferramenta("apagar_vigias_passagem", ["apaga todas"]).executar({ ids: [A, B] })) as Resposta;
    expect(r.resultado).toMatch(/AGUARDANDO CONFIRMAÇÃO/);
    expect(apagadas).toHaveLength(0);
    const c = (await ferramenta("confirmar_acao", ["sim"]).executar({})) as Resposta;
    expect(c.resultado).toBe("EXECUTADO");
    expect(apagadas).toEqual([[A, B]]);
  });
});
