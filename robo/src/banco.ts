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

export type Usuario = { id: string; nome: string; nome_assistente: string; celular: string; is_admin: boolean };

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
  return data as { id: string; nome: string; celular: string | null; celular_verificado: boolean; status: string } | null;
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
  const { error } = await db()
    .from("codigos_verificacao")
    .upsert({ usuario_id: usuarioId, celular, codigo_hash: codigoHash, tentativas: 0, expira_em: expiraEm.toISOString(), criado_em: new Date().toISOString() });
  falhou("salvar código", error);
}

export async function lerCodigo(usuarioId: string) {
  const { data, error } = await db()
    .from("codigos_verificacao")
    .select("celular, codigo_hash, tentativas, expira_em, criado_em")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  falhou("ler código", error);
  return data as { celular: string; codigo_hash: string; tentativas: number; expira_em: string; criado_em: string } | null;
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
  return (data ?? []) as { id: string; nome: string; email: string; celular: string | null }[];
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

export type MensagemHistorico = { papel: "usuario" | "assistente"; conteudo: string; criado_em: string };

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
  const { error } = await db().from("mensagens_conversa").insert({ usuario_id: usuarioId, papel, conteudo: conteudo.slice(0, 4000) });
  falhou("salvar mensagem", error);
}

// ===================================================== ação esperando "sim"

export async function salvarAcaoPendente(usuarioId: string, tipo: string, dados: unknown) {
  const { error } = await db()
    .from("acoes_pendentes")
    .upsert({ usuario_id: usuarioId, tipo, dados, criado_em: new Date().toISOString(), expira_em: new Date(Date.now() + 30 * 60_000).toISOString() });
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
  return data as { tipo: string; dados: { ids: string[]; descricao: string[] } } | null;
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

export type NovaDespesa = { valor: number; categoria_id: string; descricao: string; data: string };
export type Despesa = NovaDespesa & { id: string };

export async function inserirDespesas(usuarioId: string, itens: NovaDespesa[]): Promise<Despesa[]> {
  const { data, error } = await db()
    .from("despesas")
    .insert(itens.map((i) => ({ ...i, usuario_id: usuarioId, origem: "whatsapp" })))
    .select("id, valor, categoria_id, descricao, data");
  falhou("inserir despesas", error);
  return ((data ?? []) as Despesa[]).map((d) => ({ ...d, valor: Number(d.valor) }));
}

export type FiltroDespesas = { de?: string | null; ate?: string | null; categoriaId?: string | null; texto?: string | null; limite?: number };

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
  return ((data ?? []) as Despesa[]).map((d) => ({ ...d, valor: Number(d.valor) }));
}

export async function despesasPorIds(usuarioId: string, ids: string[]): Promise<Despesa[]> {
  const { data, error } = await db()
    .from("despesas")
    .select("id, valor, categoria_id, descricao, data")
    .eq("usuario_id", usuarioId)
    .in("id", ids);
  falhou("despesas por id", error);
  return ((data ?? []) as Despesa[]).map((d) => ({ ...d, valor: Number(d.valor) }));
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
    .order(concluidas ? "concluida_em" : "criado_em", { ascending: !concluidas })
    .limit(50);
  falhou("listar tarefas", error);
  return (data ?? []) as Tarefa[];
}

export async function tarefasPorIds(usuarioId: string, ids: string[]): Promise<Tarefa[]> {
  const { data, error } = await db().from("tarefas").select("id, titulo, concluida").eq("usuario_id", usuarioId).in("id", ids);
  falhou("tarefas por id", error);
  return (data ?? []) as Tarefa[];
}

export async function atualizarTarefa(usuarioId: string, id: string, campos: { titulo?: string; concluida?: boolean }): Promise<Tarefa | null> {
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

export type Lembrete = { id: string; texto: string; quando: string; status: string };

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
    .update({ ...campos, status: "pendente", tentativas: 0, reservado_em: null, enviado_em: null, ultimo_erro: null })
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
  const { data, error } = await db().rpc("reservar_lembretes", { p_limite: limite });
  falhou("reservar lembretes", error);
  return (data ?? []) as { id: string; usuario_id: string; texto: string; quando: string; celular: string; tentativas: number }[];
}

export async function confirmarEnvioLembrete(id: string) {
  const { error } = await db().rpc("confirmar_envio_lembrete", { p_id: id });
  falhou("confirmar envio", error);
}

export async function registrarFalhaLembrete(id: string, erro: string) {
  const { error } = await db().rpc("registrar_falha_lembrete", { p_id: id, p_erro: erro });
  falhou("registrar falha", error);
}
