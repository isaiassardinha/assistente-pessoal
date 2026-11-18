// Testa as regras de "nunca adivinhar" de ponta a ponta nas ferramentas,
// com um banco de mentira (nada vai para o Supabase).

import { beforeEach, describe, expect, it, vi } from "vitest";

const gravadas: unknown[] = [];
const pendente: {
  atual: { tipo: string; dados: { ids: string[]; descricao: string[] } } | null;
} = { atual: null };
const apagadas: string[][] = [];
const anotacoes: string[] = [];
const documentosApagados: string[][] = [];
const regras: { tipo: string; padrao: string }[] = [];
vi.mock("./pessoal", () => ({ compromissosDe: async () => null }));
const contas = {
  criadas: [] as {
    descricao: string;
    valor: number | null;
    categoria_id: string;
    vencimento: string;
  }[],
  pagas: [] as { id: string; valor: number | null; data: string | null }[],
  canceladas: [] as string[][],
  existentes: [] as {
    id: string;
    descricao: string;
    valor: number | null;
    categoria_id: string;
    vencimento: string;
    status: string;
    paga_em: string | null;
    despesa_fixa_id: string | null;
  }[],
};
const busca: { trechos: { fonte: string; conteudo: string }[] } = {
  trechos: [],
};

vi.mock("./cerebro", () => ({
  buscar: async () => ({ trechos: busca.trechos, fontes: [] }),
}));

vi.mock("./banco", () => ({
  categorias: async () => [
    { id: "c1", nome: "Mercado" },
    { id: "c2", nome: "Saúde" },
    { id: "c3", nome: "Contas" },
    { id: "c4", nome: "Moradia" },
  ],
  inserirDespesas: async (
    _uid: string,
    itens: {
      valor: number;
      categoria_id: string;
      descricao: string;
      data: string;
    }[],
  ) => {
    gravadas.push(...itens);
    return itens.map((i, n) => ({ ...i, id: `d${n}` }));
  },
  despesasPorIds: async (_uid: string, ids: string[]) =>
    ids.map((id) => ({
      id,
      valor: 10,
      categoria_id: "c1",
      descricao: "x",
      data: "2026-11-17",
    })),
  apagarDespesas: async (_uid: string, ids: string[]) => {
    apagadas.push(ids);
    return ids.length;
  },
  salvarAcaoPendente: async (_uid: string, tipo: string, dados: { ids: string[]; descricao: string[] }) => {
    pendente.atual = { tipo, dados };
  },
  lerAcaoPendente: async () => pendente.atual,
  apagarAcaoPendente: async () => {
    pendente.atual = null;
  },
  criarAnotacao: async (_uid: string, texto: string) => {
    anotacoes.push(texto);
    return { id: "n1", texto, criado_em: "2026-11-17T10:00:00Z" };
  },
  listarDocumentos: async () => [],
  documentosPorIds: async (_uid: string, ids: string[]) =>
    ids.map((id) => ({
      id,
      nome_arquivo: `doc-${id.slice(0, 4)}.pdf`,
      caminho: `u1/site/${id}.pdf`,
      tipo_mime: "application/pdf",
    })),
  apagarDocumentos: async (_uid: string, ids: string[]) => {
    documentosApagados.push(ids);
    return ids.length;
  },
  criarConta: async (_uid: string, c: (typeof contas.criadas)[number]) => {
    contas.criadas.push(c);
    return {
      ...c,
      id: "k1",
      status: "a_pagar",
      paga_em: null,
      despesa_fixa_id: null,
    };
  },
  contasPorIds: async (_uid: string, ids: string[]) => contas.existentes.filter((c) => ids.includes(c.id)),
  pagarConta: async (_uid: string, id: string, valor: number | null, data: string | null) => {
    contas.pagas.push({ id, valor, data });
    return "d1";
  },
  cancelarContas: async (_uid: string, ids: string[]) => {
    contas.canceladas.push(ids);
    return ids.length;
  },
  FaltaValor: class extends Error {},
  criarRegraEmail: async (_uid: string, tipo: string, padrao: string) => {
    regras.push({ tipo, padrao });
  },
  criarLembrete: async (_uid: string, texto: string, quando: string) => ({
    id: "l1",
    texto,
    quando,
    status: "pendente",
  }),
}));

const { criarFerramentas } = await import("./ferramentas");

const usuario = {
  id: "u1",
  nome: "Ana Silva",
  nome_assistente: "Assistente",
  celular: "5511999999999",
  is_admin: false,
};
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

function ferramenta(nome: string, textos: string[]) {
  const f = criarFerramentas({
    usuario,
    textosDaPessoa: textos,
    ultimaMensagem: textos.at(-1) ?? "",
    hoje: "2026-11-17",
  }).find((x) => x.nome === nome);
  if (!f) throw new Error(nome);
  return f;
}

beforeEach(() => {
  gravadas.length = 0;
  apagadas.length = 0;
  pendente.atual = null;
  anotacoes.length = 0;
  documentosApagados.length = 0;
  busca.trechos = [];
  contas.criadas.length = 0;
  regras.length = 0;
  contas.pagas.length = 0;
  contas.canceladas.length = 0;
  contas.existentes = [
    {
      id: ID1,
      descricao: "Luz",
      valor: null,
      categoria_id: "c3",
      vencimento: "2026-11-10",
      status: "a_pagar",
      paga_em: null,
      despesa_fixa_id: null,
    },
    {
      id: ID2,
      descricao: "Aluguel",
      valor: 3000,
      categoria_id: "c4",
      vencimento: "2026-11-05",
      status: "a_pagar",
      paga_em: null,
      despesa_fixa_id: "f1",
    },
  ];
});

describe("registrar despesas", () => {
  it("grava quando valor e categoria foram ditos", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei 50 no mercado"]).executar({
      itens: [{ valor: 50, categoria: "Mercado", descricao: "mercado" }],
    })) as { resultado: string };
    expect(r.resultado).toBe("GRAVADO");
    expect(gravadas).toHaveLength(1);
  });

  it("NÃO grava se a IA inventou o valor", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei no mercado"]).executar({
      itens: [{ valor: 50, categoria: "Mercado" }],
    })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
    expect(gravadas).toHaveLength(0);
  });

  it("NÃO grava se a IA supôs a categoria", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei 50 no supermercado"]).executar({
      itens: [{ valor: 50, categoria: "Mercado" }],
    })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });

  it("NÃO grava categoria que não existe", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei 50 em farmácia"]).executar({
      itens: [{ valor: 50, categoria: "Farmácia" }],
    })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });

  it("aceita a categoria respondida numa mensagem seguinte", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei 80 na farmácia", "saude"]).executar({
      itens: [{ valor: 80, categoria: "Saúde" }],
    })) as {
      resultado: string;
    };
    expect(r.resultado).toBe("GRAVADO");
  });

  it("lista: um item ruim impede gravar a lista toda (para perguntar)", async () => {
    const r = (await ferramenta("registrar_despesas", ["mercado 50, mercado 30"]).executar({
      itens: [
        { valor: 50, categoria: "Mercado" },
        { valor: 99, categoria: "Mercado" },
      ],
    })) as { resultado: string; problemas: string[] };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
    expect(r.problemas[0]).toMatch(/item 2/);
    expect(gravadas).toHaveLength(0);
  });

  it("recusa data no futuro", async () => {
    const r = (await ferramenta("registrar_despesas", ["gastei 50 no mercado"]).executar({
      itens: [{ valor: 50, categoria: "Mercado", data: "2026-12-25" }],
    })) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });
});

describe("lembretes", () => {
  it("sem horário dito, não agenda", async () => {
    const r = (await ferramenta("criar_lembrete", ["me lembra amanhã de pagar a luz"]).executar({
      texto: "pagar a luz",
      data_hora: "2030-01-01T09:00",
    })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });
  it("com horário dito, agenda", async () => {
    const r = (await ferramenta("criar_lembrete", ["me lembra dia 1 às 9h de pagar a luz"]).executar({
      texto: "pagar a luz",
      data_hora: "2027-06-01T09:00",
    })) as {
      resultado: string;
      quando: string;
    };
    expect(r.resultado).toBe("GRAVADO");
    expect(r.quando).toBe("01/06/2027 às 09:00");
  });
  it("horário no passado, não agenda", async () => {
    const r = (await ferramenta("criar_lembrete", ["dia 1 às 9h"]).executar({
      texto: "x",
      data_hora: "2020-01-01T09:00",
    })) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });
});

describe("apagar vários exige confirmação", () => {
  it("uma despesa: apaga na hora", async () => {
    const r = (await ferramenta("apagar_despesas", ["apaga a do mercado"]).executar({ ids: [ID1] })) as { resultado: string };
    expect(r.resultado).toBe("APAGADA");
    expect(apagadas).toEqual([[ID1]]);
  });
  it("várias: só guarda o pedido, sem apagar", async () => {
    const r = (await ferramenta("apagar_despesas", ["apaga as duas"]).executar({
      ids: [ID1, ID2],
    })) as { resultado: string };
    expect(r.resultado).toMatch(/AGUARDANDO/);
    expect(apagadas).toHaveLength(0);
  });
  it("confirmar sem um sim claro não apaga", async () => {
    await ferramenta("apagar_despesas", ["apaga as duas"]).executar({
      ids: [ID1, ID2],
    });
    const r = (await ferramenta("confirmar_acao", ["apaga as duas", "hmm, quais?"]).executar({})) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO EXECUTADO/);
    expect(apagadas).toHaveLength(0);
  });
  it("com sim claro, apaga", async () => {
    await ferramenta("apagar_despesas", ["apaga as duas"]).executar({
      ids: [ID1, ID2],
    });
    const r = (await ferramenta("confirmar_acao", ["apaga as duas", "sim"]).executar({})) as { resultado: string };
    expect(r.resultado).toBe("EXECUTADO");
    expect(apagadas).toEqual([[ID1, ID2]]);
  });
  it("ids inventados (fora do formato) são ignorados", async () => {
    const r = (await ferramenta("apagar_despesas", ["apaga"]).executar({
      ids: ["abc", "1; drop table"],
    })) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO EXECUTADO/);
  });
});

describe("cérebro: anotações", () => {
  it("guarda com as palavras da pessoa", async () => {
    const r = (await ferramenta("guardar_anotacao", ["guarda isso: a placa do meu carro é ABC1D23"]).executar({
      texto: "A placa do carro é ABC1D23",
    })) as {
      resultado: string;
    };
    expect(r.resultado).toBe("GRAVADO");
    expect(anotacoes).toEqual(["A placa do carro é ABC1D23"]);
  });
  it("NÃO guarda se a IA trocou um número", async () => {
    const r = (await ferramenta("guardar_anotacao", ["a placa do meu carro é ABC1D23"]).executar({
      texto: "A placa do carro é ABC1D28",
    })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
    expect(anotacoes).toHaveLength(0);
  });
  it("NÃO guarda informação inventada", async () => {
    const r = (await ferramenta("guardar_anotacao", ["guarda isso pra mim"]).executar({ texto: "Consulta no dentista dia 12" })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
  });
});

describe("cérebro: busca", () => {
  it("sem nada encontrado, manda dizer que não achou (nunca inventar)", async () => {
    const r = (await ferramenta("buscar_no_cerebro", ["qual a placa do meu carro?"]).executar({ consulta: "placa do carro" })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NADA ENCONTRADO/);
  });
  it("com trechos, devolve as fontes", async () => {
    busca.trechos = [{ fonte: "anotação de 17/11", conteudo: "A placa do carro é ABC1D23" }];
    const r = (await ferramenta("buscar_no_cerebro", ["qual a placa?"]).executar({ consulta: "placa" })) as {
      resultado: string;
      trechos: { fonte: string }[];
    };
    expect(r.resultado).toMatch(/^ENCONTRADO/);
    expect(r.trechos[0].fonte).toContain("anotação");
  });
});

describe("cérebro: apagar documentos sempre pede confirmação", () => {
  it("mesmo um só fica aguardando", async () => {
    const r = (await ferramenta("apagar_documentos", ["apaga o contrato"]).executar({ ids: [ID1] })) as { resultado: string };
    expect(r.resultado).toMatch(/AGUARDANDO/);
    expect(documentosApagados).toHaveLength(0);
  });
  it("só apaga depois do sim", async () => {
    await ferramenta("apagar_documentos", ["apaga o contrato"]).executar({
      ids: [ID1],
    });
    const r = (await ferramenta("confirmar_acao", ["apaga o contrato", "sim"]).executar({})) as { resultado: string };
    expect(r.resultado).toBe("EXECUTADO");
    expect(documentosApagados).toEqual([[ID1]]);
  });
});

describe("contas a pagar", () => {
  it("cria conta com o dia dito e categoria padrão Contas", async () => {
    const r = (await ferramenta("criar_conta", ["tenho um boleto do IPVA de 450 que vence dia 25"]).executar({
      descricao: "IPVA",
      vencimento: "2026-11-25",
      valor: 450,
    })) as { resultado: string; categoria: string };
    expect(r.resultado).toBe("GRAVADO");
    expect(r.categoria).toBe("Contas");
    expect(contas.criadas[0]).toMatchObject({
      valor: 450,
      categoria_id: "c3",
      vencimento: "2026-11-25",
    });
  });
  it("NÃO cria conta com vencimento que a pessoa não disse", async () => {
    const r = (await ferramenta("criar_conta", ["tenho que pagar o IPVA"]).executar({ descricao: "IPVA", vencimento: "2026-11-25" })) as {
      resultado: string;
    };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
    expect(contas.criadas).toHaveLength(0);
  });
  it("conta sem valor: não paga sem a pessoa dizer quanto foi", async () => {
    const r = (await ferramenta("pagar_conta", ["paguei a luz"]).executar({
      id: ID1,
    })) as { resultado: string };
    expect(r.resultado).toMatch(/pergunte quanto foi/);
    expect(contas.pagas).toHaveLength(0);
  });
  it("paga com o valor dito", async () => {
    const r = (await ferramenta("pagar_conta", ["paguei a luz, deu 287,40"]).executar({ id: ID1, valor: 287.4 })) as { resultado: string };
    expect(r.resultado).toMatch(/^PAGA/);
    expect(contas.pagas).toEqual([{ id: ID1, valor: 287.4, data: null }]);
  });
  it("NÃO paga com valor inventado", async () => {
    const r = (await ferramenta("pagar_conta", ["paguei a luz"]).executar({
      id: ID1,
      valor: 200,
    })) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO EXECUTADO/);
  });
  it("conta com valor fixo paga sem perguntar", async () => {
    const r = (await ferramenta("pagar_conta", ["paguei o aluguel"]).executar({
      id: ID2,
    })) as { resultado: string };
    expect(r.resultado).toMatch(/^PAGA/);
  });
  it("cancelar várias pede confirmação", async () => {
    const r = (await ferramenta("cancelar_contas", ["tira essas duas"]).executar({ ids: [ID1, ID2] })) as { resultado: string };
    expect(r.resultado).toMatch(/AGUARDANDO/);
    expect(contas.canceladas).toHaveLength(0);
  });
});

describe("e-mail e agenda", () => {
  it("regra com o remetente que a pessoa disse", async () => {
    const r = (await ferramenta("criar_regra_email", ["e-mails do @meubanco.com.br são sempre importantes"]).executar({ tipo: "importante", padrao: "@meubanco.com.br" })) as { resultado: string };
    expect(r.resultado).toBe("GRAVADO");
    expect(regras).toEqual([{ tipo: "importante", padrao: "@meubanco.com.br" }]);
  });
  it("NÃO cria regra com remetente inventado", async () => {
    const r = (await ferramenta("criar_regra_email", ["ignora as propagandas"]).executar({ tipo: "ignorar", padrao: "@loja.com" })) as { resultado: string };
    expect(r.resultado).toMatch(/^NÃO GRAVADO/);
    expect(regras).toHaveLength(0);
  });
  it("agenda não conectada: orienta a conectar", async () => {
    const r = (await ferramenta("ver_agenda", ["o que tenho amanhã?"]).executar({ de: "2026-11-18" })) as { resultado: string };
    expect(r.resultado).toMatch(/AGENDA NÃO CONECTADA/);
  });
});
