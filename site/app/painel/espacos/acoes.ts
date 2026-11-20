"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAprovado } from "@/lib/auth/sessao";
import { ehUuid } from "@/lib/despesas";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { acaoNoEspaco, perguntarAoEspaco } from "@/lib/robo";

// O banco confere quem pode cada coisa (membro/admin); aqui só validamos
// o formato do que veio do formulário e mostramos mensagens amigáveis.

function atualizar(espacoId?: string) {
  revalidatePath("/painel/espacos");
  if (espacoId) revalidatePath(`/painel/espacos/${espacoId}`);
}

function idDoEspaco(f: FormData): string | null {
  const id = campo(f, "espaco");
  return ehUuid(id) ? id : null;
}

export async function criarEspaco(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const nome = campo(f, "nome").slice(0, 60);
  if (!nome) return { erro: "Dê um nome ao espaço (ex.: o nome do grupo)." };
  const { data, error } = await supabase.rpc("criar_espaco", { p_nome: nome });
  if (error || !data) {
    if (error?.message.includes("limite")) return { erro: "Você já é administrador de 20 espaços, o limite." };
    return { erro: ERRO_GENERICO, valores: { nome } };
  }
  atualizar();
  redirect(`/painel/espacos/${data}`);
}

export async function renomearEspaco(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const nome = campo(f, "nome").slice(0, 60);
  if (!espaco || !nome) return { erro: "Escreva o nome." };
  const { data, error } = await supabase.from("espacos").update({ nome }).eq("id", espaco).select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar(espaco);
  return { sucesso: "Nome salvo." };
}

export async function gerarCodigo(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, perfil } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  if (!espaco) return { erro: ERRO_GENERICO };
  const { data, error } = await supabase.rpc("gerar_codigo_espaco", { p_espaco: espaco });
  if (error || !data) return { erro: "Só administradores do espaço podem gerar o código." };
  return {
    sucesso: `Código: ${data} (vale 30 minutos). No grupo, mande: @${perfil.nome_assistente} ${data}`,
  };
}

export async function desligarGrupo(f: FormData) {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  if (!espaco) return;
  await supabase.rpc("desligar_grupo_espaco", { p_espaco: espaco });
  atualizar(espaco);
}

const RESULTADO_MEMBRO = {
  ok: { sucesso: "Pronto, a pessoa entrou no espaço. Ela precisa estar no grupo do WhatsApp com o celular verificado no site." },
  nao_encontrado: { erro: "Não achei uma conta aprovada com esse e-mail. A pessoa precisa se cadastrar no site e ser aprovada antes." },
  ja_membro: { erro: "Essa pessoa já é membro do espaço." },
  limite: { erro: "O espaço chegou ao limite de 100 membros." },
} as const;

export async function adicionarMembro(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const email = campo(f, "email").toLowerCase().slice(0, 320);
  if (!espaco || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Digite o e-mail que a pessoa usa no site.", valores: { email } };
  const { data, error } = await supabase.rpc("adicionar_membro_espaco", { p_espaco: espaco, p_email: email });
  if (error || !data) return { erro: "Só administradores do espaço podem adicionar pessoas." };
  if (data === "ok") atualizar(espaco);
  return data === "ok" ? RESULTADO_MEMBRO.ok : { ...RESULTADO_MEMBRO[data], valores: { email } };
}

export async function removerMembro(f: FormData) {
  const { supabase, usuarioId } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const pessoa = campo(f, "usuario");
  if (!espaco || !ehUuid(pessoa)) return;
  await supabase.rpc("remover_membro_espaco", { p_espaco: espaco, p_usuario: pessoa });
  atualizar(espaco);
  if (pessoa === usuarioId) redirect("/painel/espacos"); // saiu do espaço
}

export async function definirPapel(f: FormData) {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const pessoa = campo(f, "usuario");
  const papel = campo(f, "papel");
  if (!espaco || !ehUuid(pessoa) || (papel !== "admin" && papel !== "membro")) return;
  await supabase.rpc("definir_papel_espaco", { p_espaco: espaco, p_usuario: pessoa, p_papel: papel });
  atualizar(espaco);
}

export async function desconectarDrive(f: FormData) {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  if (!espaco) return;
  await supabase.rpc("desconectar_drive_espaco", { p_espaco: espaco });
  atualizar(espaco);
}

export async function apagarDocumento(f: FormData) {
  const { usuarioId } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const documento = campo(f, "documento");
  if (!espaco || !ehUuid(documento)) return;
  await acaoNoEspaco("/espacos/apagar-documento", { usuarioId, espacoId: espaco, documentoId: documento });
  atualizar(espaco);
}

export async function relerDocumento(f: FormData) {
  const { usuarioId } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const documento = campo(f, "documento");
  if (!espaco || !ehUuid(documento)) return;
  await acaoNoEspaco("/espacos/reler-documento", { usuarioId, espacoId: espaco, documentoId: documento });
  atualizar(espaco);
}

/** Cada pessoa pode apagar as próprias mensagens guardadas (o banco só deixa as dela). */
export async function apagarMinhaMensagem(f: FormData) {
  const { supabase } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const id = Number(campo(f, "mensagem"));
  if (!espaco || !Number.isSafeInteger(id) || id <= 0) return;
  await supabase.from("espaco_mensagens").delete().eq("id", id).eq("espaco_id", espaco);
  atualizar(espaco);
}

export async function apagarEspaco(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { usuarioId } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  if (!espaco) return { erro: ERRO_GENERICO };
  if (campo(f, "confirmacao").toUpperCase() !== "APAGAR") return { erro: 'Para confirmar, digite APAGAR.' };
  const r = await acaoNoEspaco("/espacos/apagar", { usuarioId, espacoId: espaco });
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO };
  atualizar();
  redirect("/painel/espacos");
}

export type EstadoPerguntaEspaco = { erro?: string; resposta?: string; pergunta?: string };

export async function perguntar(_a: EstadoPerguntaEspaco, f: FormData): Promise<EstadoPerguntaEspaco> {
  const { usuarioId } = await exigirAprovado();
  const espaco = idDoEspaco(f);
  const pergunta = campo(f, "pergunta").slice(0, 500);
  if (!espaco || pergunta.length < 2) return { erro: "Escreva a pergunta.", pergunta };
  const r = await perguntarAoEspaco(usuarioId, espaco, pergunta);
  if (!r.ok) return { erro: r.erro ?? ERRO_GENERICO, pergunta };
  return { resposta: r.resposta, pergunta };
}
