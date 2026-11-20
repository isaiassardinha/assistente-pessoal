// Grupos (espaços compartilhados): quem é guardado, quando o robô responde,
// ligação pelo código e permissões para apagar. Banco, WhatsApp e IA de mentira.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MensagemRecebida } from "./whatsapp";

const ANA = { id: "00000000-0000-4000-a000-00000000a001", nome: "Ana Souza", nome_assistente: "Hayah", celular: "5511911111111", is_admin: false };
const BRUNO = { id: "00000000-0000-4000-a000-00000000b001", nome: "Bruno Lima", nome_assistente: "Hayah", celular: "5511922222222", is_admin: false };
const ESPACO = {
  id: "00000000-0000-4000-e000-000000000001",
  nome: "Obra da casa",
  grupo_jid: "120363000000000001@g.us",
  grupo_nome: "Obra",
  drive_pasta_id: null,
  drive_situacao: null,
  drive_conta: null,
  drive_segredo_cifrado: null,
};
const DOC_ANA = {
  id: "00000000-0000-4000-d000-000000000001",
  espaco_id: ESPACO.id,
  enviado_por: ANA.id,
  enviado_por_nome: "Ana Souza",
  nome_arquivo: "orcamento.pdf",
  status: "pronto",
  criado_em: "2026-11-19T12:00:00Z",
};

const estado = {
  usuarios: new Map<string, typeof ANA>(),
  espacoLigado: true as boolean,
  papeis: new Map<string, "admin" | "membro">(),
  mensagens: [] as { autor_id: string | null; texto: string; do_robo?: boolean }[],
  enviadas: [] as string[],
  reacoes: [] as string[],
  pendente: null as null | { tipo: string; dados: { ids: string[]; descricao: string[]; espacoId?: string } },
  apagados: [] as string[][],
  ligacoes: [] as string[],
  iaChamadas: [] as { instrucoes: string; mensagem: string }[],
  vistas: new Set<string>(),
  documentos: [] as { nome_arquivo: string; enviado_por: string }[],
};

vi.mock("./banco", () => ({
  acharUsuarioPorCelular: async (d: string) => estado.usuarios.get(d) ?? null,
  espacoDoGrupo: async () => (estado.espacoLigado ? ESPACO : null),
  papelNoEspaco: async (_e: string, u: string) => estado.papeis.get(u) ?? null,
  registrarMensagemRecebida: async (id: string) => {
    if (estado.vistas.has(id)) return false;
    estado.vistas.add(id);
    return true;
  },
  mensagensRecentesEspaco: async () =>
    estado.mensagens.map((m, i) => ({ id: i, autor_id: m.autor_id, autor_nome: m.autor_id === ANA.id ? "Ana Souza" : "Bruno Lima", do_robo: !!m.do_robo, tipo: "texto", texto: m.texto, criado_em: "2026-11-19T12:00:00Z" })),
  guardarMensagemEspaco: async (_e: string, m: { autor_id: string | null; texto: string; do_robo?: boolean }) => {
    estado.mensagens.push(m);
    return { id: estado.mensagens.length, ...m };
  },
  ligarGrupo: async (codigo: string, _g: string, _n: string, uid: string) => {
    estado.ligacoes.push(codigo);
    if (codigo !== "K7MPQ2") return { ok: false, motivo: "codigo" };
    if (uid !== ANA.id) return { ok: false, motivo: "nao_admin" };
    return { ok: true, espaco: ESPACO };
  },
  registrarDocumentoEspaco: async (_e: string, d: { nome_arquivo: string; enviado_por: string }) => {
    estado.documentos.push(d);
    return d;
  },
  documentosEspacoPorIds: async (_e: string, ids: string[]) => (ids.includes(DOC_ANA.id) ? [DOC_ANA] : []),
  documentosEspaco: async () => [DOC_ANA],
  salvarAcaoPendente: async (_u: string, tipo: string, dados: { ids: string[]; descricao: string[]; espacoId?: string }) => {
    estado.pendente = { tipo, dados };
  },
  lerAcaoPendente: async () => estado.pendente,
  apagarAcaoPendente: async () => {
    estado.pendente = null;
  },
  registrarUsoIa: async () => {},
}));

vi.mock("./espacos", () => ({
  quandoCurto: () => "19/11 09:00",
  buscarNoEspaco: async () => [],
  baixarDocumento: async () => Buffer.from("x"),
  guardarArquivo: async () => ({ armazenamento: "supabase", caminho: `${ESPACO.id}/x`, drive_id: null }),
  apagarDocumentos: async (_e: unknown, ids: string[]) => {
    estado.apagados.push(ids);
    return ids.length;
  },
}));

vi.mock("./rotinas", () => ({ acordarCerebro: () => {} }));

vi.mock("./whatsapp", () => ({
  enviarNoGrupo: async (_g: string, texto: string) => {
    estado.enviadas.push(texto);
  },
  enviarDocumentoNoGrupo: async () => {},
  marcarComoLida: async () => {},
  digitando: async () => {},
  reagir: async (_c: unknown, emoji: string) => {
    estado.reacoes.push(emoji);
  },
  nomeDoGrupo: async () => "Obra",
}));

vi.mock("./ia", () => ({
  IaIndisponivel: class extends Error {},
  transcreverAudio: async () => "áudio transcrito",
  conversar: async (o: { instrucoes: string; mensagem: string }) => {
    estado.iaChamadas.push(o);
    return "O pedreiro começa segunda, segundo a mensagem da Ana.";
  },
}));

const { tratarGrupo, criarFerramentasGrupo } = await import("./grupo");

let contador = 0;
function msg(digitos: string, texto: string, extra: Partial<MensagemRecebida> = {}): MensagemRecebida {
  contador++;
  return {
    id: `msg-${contador}`,
    digitos,
    jidResposta: ESPACO.grupo_jid,
    grupo: ESPACO.grupo_jid,
    nomeAutor: "",
    chamouRobo: false,
    chave: { remoteJid: ESPACO.grupo_jid, id: `msg-${contador}`, participant: `${digitos}@s.whatsapp.net` },
    tipo: "texto",
    texto,
    tamanho: 0,
    baixarMidia: async () => ({ dados: Buffer.from("conteudo"), mime: "application/pdf", nome: "contrato.pdf" }),
    ...extra,
  };
}

beforeEach(() => {
  estado.usuarios = new Map([
    [ANA.celular, ANA],
    [BRUNO.celular, BRUNO],
  ]);
  estado.espacoLigado = true;
  estado.papeis = new Map([
    [ANA.id, "admin"],
    [BRUNO.id, "membro"],
  ]);
  estado.mensagens = [];
  estado.enviadas = [];
  estado.reacoes = [];
  estado.pendente = null;
  estado.apagados = [];
  estado.ligacoes = [];
  estado.iaChamadas = [];
  estado.documentos = [];
});

describe("o que é guardado", () => {
  it("mensagem de membro sem menção: guarda e fica quieto", async () => {
    await tratarGrupo(msg(BRUNO.celular, "o cimento chegou hoje"));
    expect(estado.mensagens).toEqual([expect.objectContaining({ autor_id: BRUNO.id, texto: "o cimento chegou hoje" })]);
    expect(estado.enviadas).toEqual([]);
    expect(estado.iaChamadas).toEqual([]);
  });

  it("quem não é membro do espaço: nada é guardado", async () => {
    estado.papeis.delete(BRUNO.id);
    await tratarGrupo(msg(BRUNO.celular, "informação de quem não é membro"));
    expect(estado.mensagens).toEqual([]);
  });

  it("número sem cadastro: nada é guardado e, se chamar o robô, recebe o aviso uma vez só", async () => {
    await tratarGrupo(msg("5511933333333", "oi robô", { chamouRobo: true }));
    await tratarGrupo(msg("5511933333333", "oi de novo", { chamouRobo: true }));
    expect(estado.mensagens).toEqual([]);
    expect(estado.enviadas).toHaveLength(1);
    expect(estado.enviadas[0]).toContain("Só membros");
  });

  it("mensagem repetida não é guardada duas vezes", async () => {
    const m = msg(BRUNO.celular, "a entrega é na sexta");
    await tratarGrupo(m);
    await tratarGrupo(m);
    expect(estado.mensagens).toHaveLength(1);
  });

  it("documento de membro: guarda em silêncio e reage 📥", async () => {
    await tratarGrupo(msg(BRUNO.celular, "", { tipo: "documento", tamanho: 100 }));
    expect(estado.reacoes).toEqual(["📥"]);
    expect(estado.documentos).toEqual([expect.objectContaining({ nome_arquivo: "contrato.pdf", enviado_por: BRUNO.id })]);
    expect(estado.enviadas).toEqual([]);
  });

  it("áudio de membro vira texto guardado", async () => {
    await tratarGrupo(msg(BRUNO.celular, "", { tipo: "audio" }));
    expect(estado.mensagens).toEqual([expect.objectContaining({ texto: "áudio transcrito", tipo: "audio" })]);
  });
});

describe("quando responde", () => {
  it("só responde quando é chamado, com a conversa recente como contexto", async () => {
    await tratarGrupo(msg(ANA.celular, "o pedreiro começa segunda"));
    await tratarGrupo(msg(BRUNO.celular, "quando o pedreiro começa?", { chamouRobo: true }));
    expect(estado.iaChamadas).toHaveLength(1);
    expect(estado.iaChamadas[0].instrucoes).toContain("o pedreiro começa segunda");
    expect(estado.iaChamadas[0].instrucoes).toContain('grupo "Obra da casa"');
    expect(estado.iaChamadas[0].mensagem).toBe("Bruno: quando o pedreiro começa?");
    expect(estado.enviadas).toEqual(["O pedreiro começa segunda, segundo a mensagem da Ana."]);
    // a resposta fica no histórico, marcada como do robô (não vira memória)
    expect(estado.mensagens.at(-1)).toEqual(expect.objectContaining({ do_robo: true, autor_id: null }));
  });
});

describe("ligar o grupo pelo código", () => {
  it("admin manda o código: liga e avisa o grupo", async () => {
    estado.espacoLigado = false;
    await tratarGrupo(msg(ANA.celular, "K7MPQ2", { chamouRobo: true }));
    expect(estado.ligacoes).toEqual(["K7MPQ2"]);
    expect(estado.enviadas[0]).toContain('agora é o espaço "Obra da casa"');
    expect(estado.mensagens).toEqual([]); // a mensagem do código não vira memória
  });

  it("quem não é admin do espaço não liga", async () => {
    estado.espacoLigado = false;
    await tratarGrupo(msg(BRUNO.celular, "K7MPQ2", { chamouRobo: true }));
    expect(estado.enviadas[0]).toContain("não é administrador");
  });

  it("grupo sem espaço: não guarda nada", async () => {
    estado.espacoLigado = false;
    await tratarGrupo(msg(ANA.celular, "a senha do portão é 1234"));
    expect(estado.mensagens).toEqual([]);
    expect(estado.enviadas).toEqual([]);
  });
});

describe("apagar documento do grupo", () => {
  const ctx = (usuario: typeof ANA, papel: "admin" | "membro", ultimaMensagem = "apaga o orçamento") =>
    criarFerramentasGrupo({ espaco: ESPACO, usuario, papel, ultimaMensagem, grupo: ESPACO.grupo_jid, digitos: usuario.celular });
  const executar = (fs: ReturnType<typeof ctx>, nome: string, args: Record<string, unknown> = {}) => fs.find((f) => f.nome === nome)!.executar(args);

  it("membro não apaga documento que outra pessoa mandou", async () => {
    const r = (await executar(ctx(BRUNO, "membro"), "apagar_documentos_espaco", { ids: [DOC_ANA.id] })) as { resultado: string };
    expect(r.resultado).toContain("NÃO EXECUTADO");
    expect(estado.pendente).toBeNull();
  });

  it("quem mandou pede, confirma com sim e apaga", async () => {
    const r = (await executar(ctx(ANA, "membro"), "apagar_documentos_espaco", { ids: [DOC_ANA.id] })) as { resultado: string };
    expect(r.resultado).toContain("AGUARDANDO");
    expect((await executar(ctx(ANA, "membro", "hmm"), "confirmar_acao")) as { resultado: string }).toEqual(
      expect.objectContaining({ resultado: expect.stringContaining("NÃO EXECUTADO") }),
    );
    expect(estado.apagados).toEqual([]);
    await executar(ctx(ANA, "membro", "sim"), "confirmar_acao");
    expect(estado.apagados).toEqual([[DOC_ANA.id]]);
  });

  it("admin apaga documento de outra pessoa", async () => {
    await executar(ctx(BRUNO, "admin"), "apagar_documentos_espaco", { ids: [DOC_ANA.id] });
    await executar(ctx(BRUNO, "admin", "sim"), "confirmar_acao");
    expect(estado.apagados).toEqual([[DOC_ANA.id]]);
  });

  it("confirmação de outro espaço não vale aqui", async () => {
    estado.pendente = { tipo: "espaco_apagar_documentos", dados: { espacoId: "outro", ids: [DOC_ANA.id], descricao: [] } };
    const r = (await executar(ctx(ANA, "admin", "sim"), "confirmar_acao")) as { resultado: string };
    expect(r.resultado).toContain("NÃO EXECUTADO");
    expect(estado.apagados).toEqual([]);
  });
});
