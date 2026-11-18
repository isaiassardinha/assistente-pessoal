"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { caminhoNoCofre, TAMANHO_MAXIMO, tipoDoArquivo } from "@/lib/arquivos";
import { exigirAprovado } from "@/lib/auth/sessao";
import { ehUuid } from "@/lib/despesas";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { acordarCerebro, perguntarAoCerebro, type Fonte } from "@/lib/robo";

const COFRE = "documentos";

function atualizar() {
  revalidatePath("/painel/cerebro");
}

// ---------------------------------------------------------------- documentos

export type ResultadoEnvio = { ok: true; repetido: boolean } | { ok: false; erro: string };

/**
 * Envia UM arquivo (a tela manda um de cada vez, para respeitar o limite de
 * 20 MB por envio). Arquivo com mesmo nome e tamanho já guardado é pulado.
 */
export async function enviarArquivo(formulario: FormData): Promise<ResultadoEnvio> {
  const { supabase, usuarioId } = await exigirAprovado();
  const arquivo = formulario.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "arquivo vazio" };
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: "maior que 20 MB" };
  const tipo = tipoDoArquivo(arquivo.name, arquivo.type);
  if (!tipo) return { ok: false, erro: "tipo que ainda não sei ler" };
  const descricao = campo(formulario, "descricao").slice(0, 1000);
  const nome = arquivo.name.trim().slice(0, 255) || "arquivo";

  const { data: igual } = await supabase
    .from("documentos")
    .select("id")
    .eq("nome_arquivo", nome)
    .eq("tamanho_bytes", arquivo.size)
    .limit(1);
  if (igual?.length) return { ok: true, repetido: true };

  const id = randomUUID();
  const caminho = caminhoNoCofre(usuarioId, nome, id, "site");
  // o arquivo vai para a pasta da pessoa no cofre (o banco confere a pasta)
  const { error: erroCofre } = await supabase.storage
    .from(COFRE)
    .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: tipo, upsert: false });
  if (erroCofre) {
    console.error("enviar arquivo:", erroCofre.message);
    return { ok: false, erro: "não consegui guardar" };
  }
  const { error } = await supabase.from("documentos").insert({
    id,
    usuario_id: usuarioId,
    nome_arquivo: nome,
    descricao,
    caminho,
    tipo_mime: tipo,
    tamanho_bytes: arquivo.size,
  });
  if (error) {
    await supabase.storage.from(COFRE).remove([caminho]);
    return { ok: false, erro: "não consegui registrar" };
  }
  return { ok: true, repetido: false };
}

/** Fim de um envio: avisa o robô para começar a ler e atualiza a tela. */
export async function concluirEnvio() {
  await exigirAprovado();
  await acordarCerebro();
  atualizar();
}

export async function editarDescricao(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  const descricao = campo(formulario, "descricao").slice(0, 1000);
  const { data, error } = await supabase.from("documentos").update({ descricao }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Salvo." };
}

export async function relerDocumento(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  const { data } = await supabase.rpc("reler_documento", { p_documento: id });
  if (data) await acordarCerebro();
  atualizar();
}

export async function apagarDocumento(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  // apaga a ficha (os trechos pesquisáveis vão junto) e depois o arquivo
  const { data } = await supabase.from("documentos").delete().eq("id", id).select("caminho");
  const caminhos = (data ?? []).map((d) => d.caminho);
  if (caminhos.length) await supabase.storage.from(COFRE).remove(caminhos);
  atualizar();
}

// ---------------------------------------------------------------- anotações

export async function criarAnotacao(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const texto = campo(formulario, "texto").slice(0, 1000);
  if (!texto) return { erro: "Escreva a anotação." };
  const { error } = await supabase.from("memorias").insert({ usuario_id: usuarioId, texto });
  if (error) return { erro: ERRO_GENERICO };
  await acordarCerebro();
  atualizar();
  return { sucesso: "Anotação guardada." };
}

export async function editarAnotacao(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  const texto = campo(formulario, "texto").slice(0, 1000);
  if (!ehUuid(id) || !texto) return { erro: "Escreva a anotação." };
  const { data, error } = await supabase.from("memorias").update({ texto }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  await acordarCerebro();
  atualizar();
  return { sucesso: "Salvo." };
}

export async function apagarAnotacao(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("memorias").delete().eq("id", id);
  atualizar();
}

// ---------------------------------------------------------------- pergunta

export type EstadoPergunta = { pergunta?: string; resposta?: string; fontes?: Fonte[]; erro?: string };

export async function perguntar(_a: EstadoPergunta, formulario: FormData): Promise<EstadoPergunta> {
  const { usuarioId } = await exigirAprovado();
  const pergunta = campo(formulario, "pergunta").slice(0, 500);
  if (pergunta.length < 2) return { erro: "Escreva a pergunta." };
  const r = await perguntarAoCerebro(usuarioId, pergunta);
  if (!r.ok) return { pergunta, erro: r.erro ?? ERRO_GENERICO };
  return { pergunta, resposta: r.resposta, fontes: r.fontes ?? [] };
}
