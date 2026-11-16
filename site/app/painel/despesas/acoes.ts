"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { dataValida, hojeISO } from "@/lib/datas";
import { ehUuid } from "@/lib/despesas";
import { lerValor } from "@/lib/dinheiro";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";

function atualizar() {
  revalidatePath("/painel", "layout");
}

type DadosDespesa = { valor: number; categoria_id: string; descricao: string; data: string };

function lerDespesa(formulario: FormData): { dados?: DadosDespesa; erro?: string } {
  const valor = lerValor(campo(formulario, "valor"));
  if (!valor) return { erro: "Digite um valor válido. Ex.: 50 ou 1.234,56." };
  const categoria_id = campo(formulario, "categoria");
  if (!ehUuid(categoria_id)) return { erro: "Escolha uma categoria." };
  const descricao = campo(formulario, "descricao").slice(0, 200);
  const data = campo(formulario, "data") || hojeISO();
  if (!dataValida(data)) return { erro: "Data inválida." };
  return { dados: { valor, categoria_id, descricao, data } };
}

// ---------------------------------------------------------------- despesas

export async function criarDespesa(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const { dados, erro } = lerDespesa(formulario);
  if (!dados) return { erro, valores: Object.fromEntries(["valor", "categoria", "descricao", "data"].map((c) => [c, campo(formulario, c)])) };

  const { error } = await supabase.from("despesas").insert({ ...dados, usuario_id: usuarioId, origem: "site" });
  if (error) {
    console.error("criar despesa:", error.code, error.message);
    return { erro: ERRO_GENERICO };
  }
  atualizar();
  return { sucesso: "Despesa lançada." };
}

export async function editarDespesa(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  const { dados, erro } = lerDespesa(formulario);
  if (!dados) return { erro };

  const { data, error } = await supabase.from("despesas").update(dados).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.error("editar despesa:", error.code, error.message);
    return { erro: "Não consegui salvar. Recarregue a página e tente de novo." };
  }
  atualizar();
  return { sucesso: "Salvo." };
}

export async function apagarDespesa(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("despesas").delete().eq("id", id);
  atualizar();
}

// -------------------------------------------------------------- categorias

export async function criarCategoria(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const nome = campo(formulario, "nome").slice(0, 40);
  if (!nome) return { erro: "Digite o nome da categoria." };
  const { error } = await supabase.from("categorias").insert({ usuario_id: usuarioId, nome });
  if (error) {
    if (error.code === "23505") return { erro: `Você já tem a categoria "${nome}".` };
    console.error("criar categoria:", error.code, error.message);
    return { erro: ERRO_GENERICO };
  }
  atualizar();
  return { sucesso: `Categoria "${nome}" criada.` };
}

export async function renomearCategoria(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  const nome = campo(formulario, "nome").slice(0, 40);
  if (!ehUuid(id) || !nome) return { erro: "Digite o novo nome." };
  const { error } = await supabase.from("categorias").update({ nome }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { erro: `Você já tem a categoria "${nome}".` };
    return { erro: ERRO_GENERICO };
  }
  atualizar();
  return { sucesso: "Nome alterado." };
}

export async function apagarCategoria(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { erro: "Essa categoria tem despesas (ou despesas fixas). Mude a categoria delas antes de apagar." };
    }
    return { erro: ERRO_GENERICO };
  }
  atualizar();
  return { sucesso: "Categoria apagada." };
}

// ---------------------------------------------------------- despesas fixas

export async function criarFixa(_a: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const valores = Object.fromEntries(["descricao", "valor", "categoria", "dia"].map((c) => [c, campo(formulario, c)]));
  const descricao = valores.descricao.slice(0, 200);
  if (!descricao) return { erro: "Digite a descrição (ex.: Aluguel).", valores };
  const valor = lerValor(valores.valor);
  if (!valor) return { erro: "Digite um valor válido.", valores };
  if (!ehUuid(valores.categoria)) return { erro: "Escolha uma categoria.", valores };
  const dia = Number(valores.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { erro: "O dia precisa ser de 1 a 31.", valores };

  const { error } = await supabase
    .from("despesas_fixas")
    .insert({ usuario_id: usuarioId, descricao, valor, categoria_id: valores.categoria, dia_vencimento: dia });
  if (error) {
    console.error("criar fixa:", error.code, error.message);
    return { erro: ERRO_GENERICO, valores };
  }
  atualizar();
  return { sucesso: "Despesa fixa cadastrada." };
}

export async function alternarFixa(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("despesas_fixas").update({ ativa: campo(formulario, "ativa") === "sim" }).eq("id", id);
  atualizar();
}

export async function apagarFixa(formulario: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(formulario, "id");
  if (!ehUuid(id)) return;
  await supabase.from("despesas_fixas").delete().eq("id", id);
  atualizar();
}
