// =====================================================================
// TODO acesso do robô ao banco fica AQUI.
//
// O robô usa a chave mestra do Supabase (ignora as travas RLS), então cada
// função que mexe em dados pessoais recebe o "usuarioId" do dono da mensagem
// e SEMPRE filtra por ele. Um teste automático (banco.test.ts) confere isso.
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";
import { variantesCelular } from "./regras";

let cliente: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!cliente) {
    if (!config.supabaseUrl || !config.supabaseChaveSecreta) throw new Error("Supabase não configurado");
    cliente = createClient(config.supabaseUrl, config.supabaseChaveSecreta, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

function falhou(contexto: string, error: { message: string; code?: string } | null): void {
  if (error) throw new Error(`${contexto}: ${error.code ?? ""} ${error.message}`);
}

// ================================================================ pessoas

export type Usuario = {
  id: string;
  nome: string;
  nome_assistente: string;
  celular: string;
  is_admin: boolean;
};

const CAMPOS_USUARIO = "id, nome, nome_assistente, celular, is_admin";

/** Quem mandou a mensagem: só cadastro aprovado e com celular verificado. */
export async function acharUsuarioPorCelular(digitos: string): Promise<Usuario | null> {
  const { data, error } = await db()
    .from("perfis")
    .select(CAMPOS_USUARIO)
    .in("celular", variantesCelular(digitos))
    .eq("status", "aprovado")
    .eq("celular_verificado", true)
    .limit(1);
  falhou("achar usuário", error);
  return (data?.[0] as Usuario) ?? null;
}

export async function perfilParaVerificacao(usuarioId: string) {
  const { data, error } = await db()
    .from("perfis")
    .select("id, nome, celular, celular_verificado, status")
    .eq("id", usuarioId)
    .maybeSingle();
  falhou("perfil", error);
  return data as {
    id: string;
    nome: string;
    celular: string | null;
    celular_verificado: boolean;
    status: string;
  } | null;
}

export async function administradores(): Promise<Usuario[]> {
  const { data, error } = await db()
    .from("perfis")
    .select(CAMPOS_USUARIO)
    .eq("is_admin", true)
    .eq("status", "aprovado")
    .eq("celular_verificado", true);
  falhou("administradores", error);
  return (data ?? []) as Usuario[];
}

// ====================================================== verificação do celular

export async function salvarCodigo(usuarioId: string, celular: string, codigoHash: string, expiraEm: Date) {
  const { error } = await db().from("codigos_verificacao").upsert({
    usuario_id: usuarioId,
    celular,
    codigo_hash: codigoHash,
    tentativas: 0,
    expira_em: expiraEm.toISOString(),
    criado_em: new Date().toISOString(),
  });
  falhou("salvar código", error);
}

export async function lerCodigo(usuarioId: string) {
  const { data, error } = await db()
    .from("codigos_verificacao")
    .select("celular, codigo_hash, tentativas, expira_em, criado_em")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  falhou("ler código", error);
  return data as {
    celular: string;
    codigo_hash: string;
    tentativas: number;
    expira_em: string;
    criado_em: string;
  } | null;
}

export async function contarTentativaCodigo(usuarioId: string, tentativas: number) {
  const { error } = await db().from("codigos_verificacao").update({ tentativas }).eq("usuario_id", usuarioId);
  falhou("tentativa código", error);
}

export async function apagarCodigo(usuarioId: string) {
  const { error } = await db().from("codigos_verificacao").delete().eq("usuario_id", usuarioId);
  falhou("apagar código", error);
}

/** Marca verificado, desde que o celular ainda seja o mesmo para o qual o código foi enviado. */
export async function marcarCelularVerificado(usuarioId: string, celular: string): Promise<boolean> {
  const { data, error } = await db()
    .from("perfis")
    .update({ celular_verificado: true })
    .eq("id", usuarioId)
    .eq("celular", celular)
    .select("id");
  if (error?.code === "23505") return false; // celular já verificado em outra conta
  falhou("marcar verificado", error);
  return (data?.length ?? 0) > 0;
}

// ============================================================ avisos (rotina)

export async function cadastrosParaAvisar() {
  const { data, error } = await db().rpc("cadastros_para_avisar");
  falhou("cadastros para avisar", error);
  return (data ?? []) as {
    id: string;
    nome: string;
    email: string;
    celular: string | null;
  }[];
}

export async function marcarAvisoAdmin(usuarioId: string) {
  const { error } = await db().from("perfis").update({ aviso_admin_em: new Date().toISOString() }).eq("id", usuarioId);
  falhou("marcar aviso admin", error);
}

export async function paraBoasVindas(): Promise<Usuario[]> {
  const { data, error } = await db()
    .from("perfis")
    .select(CAMPOS_USUARIO)
    .eq("status", "aprovado")
    .eq("celular_verificado", true)
    .is("boas_vindas_em", null)
    .limit(20);
  falhou("boas-vindas", error);
  return (data ?? []) as Usuario[];
}

export async function marcarBoasVindas(usuarioId: string) {
  const { error } = await db().from("perfis").update({ boas_vindas_em: new Date().toISOString() }).eq("id", usuarioId);
  falhou("marcar boas-vindas", error);
}

// ============================================= mensagens repetidas e conversa

/** Registra a mensagem; devolve false se ela já tinha chegado antes. */
export async function registrarMensagemRecebida(idMensagem: string): Promise<boolean> {
  const { error } = await db().from("mensagens_recebidas").insert({ id_mensagem: idMensagem });
  if (error?.code === "23505") return false;
  falhou("registrar mensagem", error);
  return true;
}

export async function limparRegistrosAntigos() {
  const doisDias = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const trintaDias = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await db().from("mensagens_recebidas").delete().lt("recebida_em", doisDias);
  await db().from("mensagens_conversa").delete().lt("criado_em", trintaDias);
  await db().from("acoes_pendentes").delete().lt("expira_em", new Date().toISOString());
  await db().from("codigos_verificacao").delete().lt("expira_em", doisDias);
}

export type MensagemHistorico = {
  papel: "usuario" | "assistente";
  conteudo: string;
  criado_em: string;
};

export async function historico(usuarioId: string, quantidade = 12): Promise<MensagemHistorico[]> {
  const { data, error } = await db()
    .from("mensagens_conversa")
    .select("papel, conteudo, criado_em")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(quantidade);
  falhou("histórico", error);
  return ((data ?? []) as MensagemHistorico[]).reverse();
}

export async function salvarMensagem(usuarioId: string, papel: "usuario" | "assistente", conteudo: string) {
  const { error } = await db()
    .from("mensagens_conversa")
    .insert({
      usuario_id: usuarioId,
      papel,
      conteudo: conteudo.slice(0, 4000),
    });
  falhou("salvar mensagem", error);
}

// ===================================================== ação esperando "sim"

export async function salvarAcaoPendente(usuarioId: string, tipo: string, dados: unknown) {
  const { error } = await db()
    .from("acoes_pendentes")
    .upsert({
      usuario_id: usuarioId,
      tipo,
      dados,
      criado_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
  falhou("salvar ação pendente", error);
}

export async function lerAcaoPendente(usuarioId: string) {
  const { data, error } = await db()
    .from("acoes_pendentes")
    .select("tipo, dados, expira_em")
    .eq("usuario_id", usuarioId)
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  falhou("ler ação pendente", error);
  return data as {
    tipo: string;
    dados: { ids: string[]; descricao: string[] };
  } | null;
}

export async function apagarAcaoPendente(usuarioId: string) {
  const { error } = await db().from("acoes_pendentes").delete().eq("usuario_id", usuarioId);
  falhou("apagar ação pendente", error);
}

// ============================================================== categorias

export async function categorias(usuarioId: string) {
  const { data, error } = await db().from("categorias").select("id, nome").eq("usuario_id", usuarioId).order("nome");
  falhou("categorias", error);
  return (data ?? []) as { id: string; nome: string }[];
}

// ================================================================ despesas

export type NovaDespesa = {
  valor: number;
  categoria_id: string;
  descricao: string;
  data: string;
};
export type Despesa = NovaDespesa & { id: string };

export async function inserirDespesas(usuarioId: string, itens: NovaDespesa[]): Promise<Despesa[]> {
  const { data, error } = await db()
    .from("despesas")
    .insert(itens.map((i) => ({ ...i, usuario_id: usuarioId, origem: "whatsapp" })))
    .select("id, valor, categoria_id, descricao, data");
  falhou("inserir despesas", error);
  return ((data ?? []) as Despesa[]).map((d) => ({
    ...d,
    valor: Number(d.valor),
  }));
}

export type FiltroDespesas = {
  de?: string | null;
  ate?: string | null;
  categoriaId?: string | null;
  texto?: string | null;
  limite?: number;
};

export async function buscarDespesas(usuarioId: string, f: FiltroDespesas): Promise<Despesa[]> {
  let q = db()
    .from("despesas")
    .select("id, valor, categoria_id, descricao, data")
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(f.limite ?? 10000);
  if (f.de) q = q.gte("data", f.de);
  if (f.ate) q = q.lte("data", f.ate);
  if (f.categoriaId) q = q.eq("categoria_id", f.categoriaId);
  if (f.texto) q = q.ilike("descricao", `%${f.texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await q;
  falhou("buscar despesas", error);
  return ((data ?? []) as Despesa[]).map((d) => ({
    ...d,
    valor: Number(d.valor),
  }));
}

export async function despesasPorIds(usuarioId: string, ids: string[]): Promise<Despesa[]> {
  const { data, error } = await db()
    .from("despesas")
    .select("id, valor, categoria_id, descricao, data")
    .eq("usuario_id", usuarioId)
    .in("id", ids);
  falhou("despesas por id", error);
  return ((data ?? []) as Despesa[]).map((d) => ({
    ...d,
    valor: Number(d.valor),
  }));
}

export async function editarDespesa(usuarioId: string, id: string, campos: Partial<NovaDespesa>): Promise<Despesa | null> {
  const { data, error } = await db()
    .from("despesas")
    .update(campos)
    .eq("usuario_id", usuarioId)
    .eq("id", id)
    .select("id, valor, categoria_id, descricao, data");
  falhou("editar despesa", error);
  const d = data?.[0] as Despesa | undefined;
  return d ? { ...d, valor: Number(d.valor) } : null;
}

export async function apagarDespesas(usuarioId: string, ids: string[]): Promise<number> {
  const { data, error } = await db().from("despesas").delete().eq("usuario_id", usuarioId).in("id", ids).select("id");
  falhou("apagar despesas", error);
  return data?.length ?? 0;
}

// ================================================================= tarefas

export type Tarefa = { id: string; titulo: string; concluida: boolean };

export async function criarTarefa(usuarioId: string, titulo: string): Promise<Tarefa> {
  const { data, error } = await db().from("tarefas").insert({ usuario_id: usuarioId, titulo }).select("id, titulo, concluida").single();
  falhou("criar tarefa", error);
  return data as Tarefa;
}

export async function listarTarefas(usuarioId: string, concluidas: boolean): Promise<Tarefa[]> {
  const { data, error } = await db()
    .from("tarefas")
    .select("id, titulo, concluida")
    .eq("usuario_id", usuarioId)
    .eq("concluida", concluidas)
    .order(concluidas ? "concluida_em" : "criado_em", {
      ascending: !concluidas,
    })
    .limit(50);
  falhou("listar tarefas", error);
  return (data ?? []) as Tarefa[];
}

export async function tarefasPorIds(usuarioId: string, ids: string[]): Promise<Tarefa[]> {
  const { data, error } = await db().from("tarefas").select("id, titulo, concluida").eq("usuario_id", usuarioId).in("id", ids);
  falhou("tarefas por id", error);
  return (data ?? []) as Tarefa[];
}

export async function atualizarTarefa(
  usuarioId: string,
  id: string,
  campos: { titulo?: string; concluida?: boolean },
): Promise<Tarefa | null> {
  const mudancas: Record<string, unknown> = { ...campos };
  if (campos.concluida !== undefined) mudancas.concluida_em = campos.concluida ? new Date().toISOString() : null;
  const { data, error } = await db()
    .from("tarefas")
    .update(mudancas)
    .eq("usuario_id", usuarioId)
    .eq("id", id)
    .select("id, titulo, concluida");
  falhou("atualizar tarefa", error);
  return (data?.[0] as Tarefa) ?? null;
}

export async function apagarTarefas(usuarioId: string, ids: string[]): Promise<number> {
  const { data, error } = await db().from("tarefas").delete().eq("usuario_id", usuarioId).in("id", ids).select("id");
  falhou("apagar tarefas", error);
  return data?.length ?? 0;
}

// =============================================================== lembretes

export type Lembrete = {
  id: string;
  texto: string;
  quando: string;
  status: string;
};

export async function criarLembrete(usuarioId: string, texto: string, quando: string): Promise<Lembrete> {
  const { data, error } = await db()
    .from("lembretes")
    .insert({ usuario_id: usuarioId, texto, quando })
    .select("id, texto, quando, status")
    .single();
  falhou("criar lembrete", error);
  return data as Lembrete;
}

export async function listarLembretes(usuarioId: string): Promise<Lembrete[]> {
  const { data, error } = await db()
    .from("lembretes")
    .select("id, texto, quando, status")
    .eq("usuario_id", usuarioId)
    .in("status", ["pendente", "enviando", "falhou"])
    .order("quando")
    .limit(50);
  falhou("listar lembretes", error);
  return (data ?? []) as Lembrete[];
}

export async function lembretesPorIds(usuarioId: string, ids: string[]): Promise<Lembrete[]> {
  const { data, error } = await db().from("lembretes").select("id, texto, quando, status").eq("usuario_id", usuarioId).in("id", ids);
  falhou("lembretes por id", error);
  return (data ?? []) as Lembrete[];
}

export async function editarLembrete(usuarioId: string, id: string, campos: { texto?: string; quando?: string }): Promise<Lembrete | null> {
  const { data, error } = await db()
    .from("lembretes")
    .update({
      ...campos,
      status: "pendente",
      tentativas: 0,
      reservado_em: null,
      enviado_em: null,
      ultimo_erro: null,
    })
    .eq("usuario_id", usuarioId)
    .eq("id", id)
    .select("id, texto, quando, status");
  falhou("editar lembrete", error);
  return (data?.[0] as Lembrete) ?? null;
}

export async function cancelarLembretes(usuarioId: string, ids: string[]): Promise<number> {
  const { data, error } = await db()
    .from("lembretes")
    .update({ status: "cancelado" })
    .eq("usuario_id", usuarioId)
    .in("id", ids)
    .in("status", ["pendente", "falhou"])
    .select("id");
  falhou("cancelar lembretes", error);
  return data?.length ?? 0;
}

// ---------------------------------------------- rotina de envio (só o servidor)

export async function reservarLembretes(limite = 20) {
  const { data, error } = await db().rpc("reservar_lembretes", {
    p_limite: limite,
  });
  falhou("reservar lembretes", error);
  return (data ?? []) as {
    id: string;
    usuario_id: string;
    texto: string;
    quando: string;
    celular: string;
    tentativas: number;
  }[];
}

export async function confirmarEnvioLembrete(id: string) {
  const { error } = await db().rpc("confirmar_envio_lembrete", { p_id: id });
  falhou("confirmar envio", error);
}

export async function registrarFalhaLembrete(id: string, erro: string) {
  const { error } = await db().rpc("registrar_falha_lembrete", {
    p_id: id,
    p_erro: erro,
  });
  falhou("registrar falha", error);
}

// ============================================================ CÉREBRO
// Anotações (tabela "memorias"), documentos e trechos pesquisáveis.

const COFRE = "documentos";

function conferirPasta(usuarioId: string, caminho: string) {
  if (!caminho.startsWith(`${usuarioId}/`) || caminho.includes("..")) throw new Error("arquivo fora da pasta da pessoa");
}

export type Anotacao = { id: string; texto: string; criado_em: string };

export async function criarAnotacao(usuarioId: string, texto: string): Promise<Anotacao> {
  const { data, error } = await db()
    .from("memorias")
    .insert({ usuario_id: usuarioId, texto, origem: "whatsapp" })
    .select("id, texto, criado_em")
    .single();
  falhou("criar anotação", error);
  return data as Anotacao;
}

export async function listarAnotacoes(usuarioId: string, limite = 30): Promise<Anotacao[]> {
  const { data, error } = await db()
    .from("memorias")
    .select("id, texto, criado_em")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  falhou("listar anotações", error);
  return (data ?? []) as Anotacao[];
}

export async function anotacoesPorIds(usuarioId: string, ids: string[]): Promise<Anotacao[]> {
  const { data, error } = await db().from("memorias").select("id, texto, criado_em").eq("usuario_id", usuarioId).in("id", ids);
  falhou("anotações por id", error);
  return (data ?? []) as Anotacao[];
}

export async function editarAnotacao(usuarioId: string, id: string, texto: string): Promise<Anotacao | null> {
  const { data, error } = await db()
    .from("memorias")
    .update({ texto })
    .eq("usuario_id", usuarioId)
    .eq("id", id)
    .select("id, texto, criado_em");
  falhou("editar anotação", error);
  return (data?.[0] as Anotacao) ?? null;
}

export async function apagarAnotacoes(usuarioId: string, ids: string[]): Promise<number> {
  const { data, error } = await db().from("memorias").delete().eq("usuario_id", usuarioId).in("id", ids).select("id");
  falhou("apagar anotações", error);
  return data?.length ?? 0;
}

/** Anotações que ainda não viraram trechos pesquisáveis (todas as pessoas; só a rotina usa). */
export async function anotacoesParaIndexar(limite = 30) {
  const { data, error } = await db()
    .from("memorias")
    .select("id, usuario_id, texto")
    .eq("indexada", false)
    .order("criado_em")
    .limit(limite);
  falhou("anotações a indexar", error);
  return (data ?? []) as { id: string; usuario_id: string; texto: string }[];
}

export async function indexarAnotacao(usuarioId: string, id: string, texto: string, vetor: number[]) {
  // apaga trechos antigos (se houver) e grava o novo; só marca como pronta se o texto não mudou no meio
  const { error: e1 } = await db().from("trechos").delete().eq("usuario_id", usuarioId).eq("memoria_id", id);
  falhou("limpar trechos da anotação", e1);
  const { error: e2 } = await db()
    .from("trechos")
    .insert({
      usuario_id: usuarioId,
      memoria_id: id,
      posicao: 0,
      conteudo: texto.slice(0, 4000),
      vetor: JSON.stringify(vetor),
    });
  falhou("gravar trecho da anotação", e2);
  const { error: e3 } = await db().from("memorias").update({ indexada: true }).eq("usuario_id", usuarioId).eq("id", id).eq("texto", texto);
  falhou("marcar anotação", e3);
}

// ------------------------------------------------------------ documentos

export type Documento = {
  id: string;
  nome_arquivo: string;
  descricao: string;
  caminho: string;
  tipo_mime: string | null;
  tamanho_bytes: number;
  status: string;
  resumo: string | null;
  origem: string;
  tentativas: number;
  criado_em: string;
};

const CAMPOS_DOCUMENTO = "id, nome_arquivo, descricao, caminho, tipo_mime, tamanho_bytes, status, resumo, origem, tentativas, criado_em";

export async function guardarArquivo(usuarioId: string, caminho: string, dados: Buffer, mime: string) {
  conferirPasta(usuarioId, caminho);
  const { error } = await db().storage.from(COFRE).upload(caminho, dados, { contentType: mime, upsert: false });
  falhou("guardar arquivo", error as never);
}

export async function baixarArquivo(usuarioId: string, caminho: string): Promise<Buffer> {
  conferirPasta(usuarioId, caminho);
  const { data, error } = await db().storage.from(COFRE).download(caminho);
  falhou("baixar arquivo", error as never);
  return Buffer.from(await (data as Blob).arrayBuffer());
}

export async function registrarDocumento(
  usuarioId: string,
  doc: {
    id: string;
    nome_arquivo: string;
    descricao: string;
    caminho: string;
    tipo_mime: string;
    tamanho_bytes: number;
  },
): Promise<Documento> {
  conferirPasta(usuarioId, doc.caminho);
  const { data, error } = await db()
    .from("documentos")
    .insert({ ...doc, usuario_id: usuarioId, origem: "whatsapp" })
    .select(CAMPOS_DOCUMENTO)
    .single();
  falhou("registrar documento", error);
  return data as Documento;
}

export async function listarDocumentos(usuarioId: string, limite = 50): Promise<Documento[]> {
  const { data, error } = await db()
    .from("documentos")
    .select(CAMPOS_DOCUMENTO)
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  falhou("listar documentos", error);
  return (data ?? []) as Documento[];
}

export async function documentosPorIds(usuarioId: string, ids: string[]): Promise<Documento[]> {
  const { data, error } = await db().from("documentos").select(CAMPOS_DOCUMENTO).eq("usuario_id", usuarioId).in("id", ids);
  falhou("documentos por id", error);
  return (data ?? []) as Documento[];
}

/** Apaga a ficha (os trechos vão junto) e depois o arquivo do cofre. */
export async function apagarDocumentos(usuarioId: string, ids: string[]): Promise<number> {
  const { data, error } = await db().from("documentos").delete().eq("usuario_id", usuarioId).in("id", ids).select("caminho");
  falhou("apagar documentos", error);
  const caminhos = ((data ?? []) as { caminho: string }[]).map((d) => d.caminho).filter((c) => c.startsWith(`${usuarioId}/`));
  if (caminhos.length > 0) await db().storage.from(COFRE).remove(caminhos);
  return data?.length ?? 0;
}

// ------------------------------------------ fila de leitura (só a rotina)

const TRAVADO_HA = 15 * 60_000;
export const MAXIMO_TENTATIVAS_LEITURA = 3;

/** Documentos esperando leitura, ou que travaram no meio (de todas as pessoas). */
export async function documentosParaProcessar(limite = 3) {
  const travado = new Date(Date.now() - TRAVADO_HA).toISOString();
  const { data, error } = await db()
    .from("documentos")
    .select("id, usuario_id, status, status_em, tentativas")
    .or(`status.eq.pendente,and(status.eq.processando,status_em.lt.${travado})`)
    .order("status_em")
    .limit(limite);
  falhou("documentos a processar", error);
  return (data ?? []) as {
    id: string;
    usuario_id: string;
    status: string;
    status_em: string;
    tentativas: number;
  }[];
}

/** Pega o documento para ler (só se ninguém pegou antes). */
export async function reservarDocumento(usuarioId: string, d: { id: string; status: string; status_em: string; tentativas: number }) {
  const { data, error } = await db()
    .from("documentos")
    .update({
      status: "processando",
      status_em: new Date().toISOString(),
      tentativas: d.tentativas + 1,
      erro: null,
    })
    .eq("usuario_id", usuarioId)
    .eq("id", d.id)
    .eq("status", d.status)
    .eq("status_em", d.status_em)
    .select(CAMPOS_DOCUMENTO);
  falhou("reservar documento", error);
  return (data?.[0] as Documento) ?? null;
}

export async function gravarTrechosDoDocumento(usuarioId: string, documentoId: string, trechos: { conteudo: string; vetor: number[] }[]) {
  const { error: e1 } = await db().from("trechos").delete().eq("usuario_id", usuarioId).eq("documento_id", documentoId);
  falhou("limpar trechos do documento", e1);
  for (let i = 0; i < trechos.length; i += 100) {
    const lote = trechos.slice(i, i + 100).map((t, n) => ({
      usuario_id: usuarioId,
      documento_id: documentoId,
      posicao: i + n,
      conteudo: t.conteudo.slice(0, 4000),
      vetor: JSON.stringify(t.vetor),
    }));
    const { error } = await db().from("trechos").insert(lote);
    falhou("gravar trechos", error);
  }
}

export async function concluirDocumento(usuarioId: string, id: string, resumo: string) {
  const agora = new Date().toISOString();
  const { error } = await db()
    .from("documentos")
    .update({
      status: "pronto",
      status_em: agora,
      processado_em: agora,
      resumo: resumo.slice(0, 600) || null,
      erro: null,
    })
    .eq("usuario_id", usuarioId)
    .eq("id", id);
  falhou("concluir documento", error);
}

/** Erro na leitura: volta para a fila, ou desiste depois de algumas tentativas (ou se não tem jeito). */
export async function falharDocumento(usuarioId: string, id: string, erro: string, definitivo: boolean) {
  const { error } = await db()
    .from("documentos")
    .update({
      status: definitivo ? "erro" : "pendente",
      status_em: new Date().toISOString(),
      erro: erro.slice(0, 300),
    })
    .eq("usuario_id", usuarioId)
    .eq("id", id);
  falhou("falha no documento", error);
}

// ------------------------------------------------------- busca pelo sentido

export type TrechoAchado = {
  documento_id: string | null;
  memoria_id: string | null;
  conteudo: string;
  distancia: number;
};

export async function buscarTrechos(usuarioId: string, vetor: number[], limite = 8): Promise<TrechoAchado[]> {
  const { data, error } = await db().rpc("buscar_trechos", {
    p_usuario: usuarioId,
    p_vetor: JSON.stringify(vetor),
    p_limite: limite,
  });
  falhou("buscar trechos", error);
  return (data ?? []) as TrechoAchado[];
}

export async function datasDasAnotacoes(usuarioId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db().from("memorias").select("id, criado_em").eq("usuario_id", usuarioId).in("id", ids);
  falhou("datas das anotações", error);
  return new Map(((data ?? []) as { id: string; criado_em: string }[]).map((a) => [a.id, a.criado_em]));
}

// ============================================================ CONTAS A PAGAR

export type Conta = {
  id: string;
  descricao: string;
  valor: number | null;
  categoria_id: string;
  vencimento: string;
  status: "a_pagar" | "paga" | "ignorada";
  paga_em: string | null;
  despesa_fixa_id: string | null;
};

const CAMPOS_CONTA = "id, descricao, valor, categoria_id, vencimento, status, paga_em, despesa_fixa_id";
const contaNumerica = (c: Conta) => ({
  ...c,
  valor: c.valor == null ? null : Number(c.valor),
});

export async function listarContas(usuarioId: string, filtro: { de?: string; ate?: string; status?: Conta["status"] }) {
  let q = db().from("contas").select(CAMPOS_CONTA).eq("usuario_id", usuarioId);
  if (filtro.de) q = q.gte("vencimento", filtro.de);
  if (filtro.ate) q = q.lte("vencimento", filtro.ate);
  if (filtro.status) q = q.eq("status", filtro.status);
  const { data, error } = await q.order("vencimento").order("descricao").limit(300);
  falhou("listar contas", error);
  return ((data ?? []) as Conta[]).map(contaNumerica);
}

export async function contasPorIds(usuarioId: string, ids: string[]): Promise<Conta[]> {
  const { data, error } = await db().from("contas").select(CAMPOS_CONTA).eq("usuario_id", usuarioId).in("id", ids);
  falhou("contas por id", error);
  return ((data ?? []) as Conta[]).map(contaNumerica);
}

export async function criarConta(
  usuarioId: string,
  c: {
    descricao: string;
    valor: number | null;
    categoria_id: string;
    vencimento: string;
  },
): Promise<Conta> {
  const { data, error } = await db()
    .from("contas")
    .insert({ ...c, usuario_id: usuarioId, origem: "whatsapp" })
    .select(CAMPOS_CONTA)
    .single();
  falhou("criar conta", error);
  return contaNumerica(data as Conta);
}

export async function editarConta(
  usuarioId: string,
  id: string,
  campos: Partial<{
    descricao: string;
    valor: number | null;
    vencimento: string;
    categoria_id: string;
    status: "a_pagar" | "ignorada";
  }>,
): Promise<Conta | null> {
  const { data, error } = await db()
    .from("contas")
    .update(campos)
    .eq("usuario_id", usuarioId)
    .eq("id", id)
    .neq("status", "paga")
    .select(CAMPOS_CONTA);
  falhou("editar conta", error);
  return data?.[0] ? contaNumerica(data[0] as Conta) : null;
}

/** Conta de conta fixa vira "ignorada" (para não voltar); avulsa é apagada. */
export async function cancelarContas(usuarioId: string, ids: string[]): Promise<number> {
  const contas = (await contasPorIds(usuarioId, ids)).filter((c) => c.status !== "paga");
  const daFixa = contas.filter((c) => c.despesa_fixa_id).map((c) => c.id);
  const avulsas = contas.filter((c) => !c.despesa_fixa_id).map((c) => c.id);
  if (daFixa.length) {
    const { error } = await db().from("contas").update({ status: "ignorada" }).eq("usuario_id", usuarioId).in("id", daFixa);
    falhou("ignorar contas", error);
  }
  if (avulsas.length) {
    const { error } = await db().from("contas").delete().eq("usuario_id", usuarioId).in("id", avulsas);
    falhou("apagar contas", error);
  }
  return daFixa.length + avulsas.length;
}

export class FaltaValor extends Error {}

export async function pagarConta(usuarioId: string, id: string, valor: number | null, data: string | null): Promise<string> {
  const { data: despesa, error } = await db().rpc("pagar_conta", {
    p_usuario: usuarioId,
    p_conta: id,
    p_valor: valor,
    p_data: data,
    p_origem: "whatsapp",
  });
  if (error && /falta o valor/.test(error.message)) throw new FaltaValor();
  falhou("pagar conta", error);
  return despesa as string;
}

export async function reabrirConta(usuarioId: string, id: string) {
  const { error } = await db().rpc("reabrir_conta", {
    p_usuario: usuarioId,
    p_conta: id,
  });
  falhou("reabrir conta", error);
}

// ------------------------------------------------------------- contas fixas

export type ContaFixa = {
  id: string;
  descricao: string;
  valor: number | null;
  categoria_id: string;
  dia_vencimento: number;
  ativa: boolean;
};
const CAMPOS_FIXA = "id, descricao, valor, categoria_id, dia_vencimento, ativa";

export async function listarContasFixas(usuarioId: string): Promise<ContaFixa[]> {
  const { data, error } = await db().from("despesas_fixas").select(CAMPOS_FIXA).eq("usuario_id", usuarioId).order("dia_vencimento");
  falhou("listar contas fixas", error);
  return ((data ?? []) as ContaFixa[]).map((f) => ({
    ...f,
    valor: f.valor == null ? null : Number(f.valor),
  }));
}

export async function criarContaFixa(
  usuarioId: string,
  f: {
    descricao: string;
    valor: number | null;
    categoria_id: string;
    dia_vencimento: number;
  },
): Promise<ContaFixa> {
  const { data, error } = await db()
    .from("despesas_fixas")
    .insert({ ...f, usuario_id: usuarioId })
    .select(CAMPOS_FIXA)
    .single();
  falhou("criar conta fixa", error);
  return data as ContaFixa;
}

export async function editarContaFixa(
  usuarioId: string,
  id: string,
  campos: Partial<{
    descricao: string;
    valor: number | null;
    dia_vencimento: number;
    ativa: boolean;
  }>,
): Promise<ContaFixa | null> {
  const { data, error } = await db().from("despesas_fixas").update(campos).eq("usuario_id", usuarioId).eq("id", id).select(CAMPOS_FIXA);
  falhou("editar conta fixa", error);
  return (data?.[0] as ContaFixa) ?? null;
}

// ------------------------------------------------ avisos (só a rotina)

export type ContaParaAvisar = {
  usuario_id: string;
  celular: string;
  nome: string;
  conta_id: string;
  descricao: string;
  valor: number | null;
  vencimento: string;
  tipo: "antes" | "hoje" | "atrasada";
};

export async function gerarContasDoMes(hoje: string): Promise<number> {
  const { data, error } = await db().rpc("gerar_contas_do_mes", {
    p_hoje: hoje,
  });
  falhou("gerar contas do mês", error);
  return Number(data ?? 0);
}

export async function contasParaAvisar(hoje: string, hora: number): Promise<ContaParaAvisar[]> {
  const { data, error } = await db().rpc("contas_para_avisar", {
    p_hoje: hoje,
    p_hora: hora,
  });
  falhou("contas para avisar", error);
  return ((data ?? []) as ContaParaAvisar[]).map((c) => ({
    ...c,
    valor: c.valor == null ? null : Number(c.valor),
  }));
}

export async function marcarContasAvisadas(ids: string[], hoje: string) {
  const { error } = await db().rpc("marcar_contas_avisadas", {
    p_contas: ids,
    p_hoje: hoje,
  });
  falhou("marcar contas avisadas", error);
}
