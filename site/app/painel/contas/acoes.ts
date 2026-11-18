"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { dataValida, hojeISO, somarDias } from "@/lib/datas";
import { ehUuid } from "@/lib/despesas";
import { lerValor } from "@/lib/dinheiro";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";

function atualizar() {
  revalidatePath("/painel", "layout");
}

/** Valor opcional: vazio = "a definir". */
function valorOpcional(texto: string): { valor: number | null; erro?: string } {
  if (!texto.trim()) return { valor: null };
  const valor = lerValor(texto);
  return valor
    ? { valor }
    : {
        valor: null,
        erro: "Digite um valor válido (ex.: 287,40) ou deixe em branco.",
      };
}

function lerDia(texto: string): number | null {
  const dia = Number(texto);
  return Number.isInteger(dia) && dia >= 1 && dia <= 31 ? dia : null;
}

function vencimentoValido(data: string): boolean {
  const hoje = hojeISO();
  return dataValida(data) && data >= somarDias(hoje, -400) && data <= somarDias(hoje, 730);
}

// ------------------------------------------------------------- contas avulsas

export async function criarConta(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const valores = Object.fromEntries(["descricao", "valor", "categoria", "vencimento"].map((c) => [c, campo(f, c)]));
  const descricao = valores.descricao.slice(0, 200);
  if (!descricao) return { erro: "Diga que conta é (ex.: IPVA).", valores };
  const { valor, erro } = valorOpcional(valores.valor);
  if (erro) return { erro, valores };
  if (!ehUuid(valores.categoria)) return { erro: "Escolha uma categoria.", valores };
  if (!vencimentoValido(valores.vencimento)) return { erro: "Escolha a data de vencimento.", valores };
  const { error } = await supabase.from("contas").insert({
    usuario_id: usuarioId,
    descricao,
    valor,
    categoria_id: valores.categoria,
    vencimento: valores.vencimento,
  });
  if (error) {
    console.error("criar conta:", error.code, error.message);
    return { erro: ERRO_GENERICO, valores };
  }
  atualizar();
  return { sucesso: "Conta cadastrada." };
}

export async function editarConta(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  const descricao = campo(f, "descricao").slice(0, 200);
  const { valor, erro } = valorOpcional(campo(f, "valor"));
  const vencimento = campo(f, "vencimento");
  const categoria = campo(f, "categoria");
  if (!ehUuid(id) || !ehUuid(categoria)) return { erro: ERRO_GENERICO };
  if (!descricao) return { erro: "A descrição não pode ficar vazia." };
  if (erro) return { erro };
  if (!vencimentoValido(vencimento)) return { erro: "Data de vencimento inválida." };
  const { data, error } = await supabase
    .from("contas")
    .update({ descricao, valor, vencimento, categoria_id: categoria })
    .eq("id", id)
    .neq("status", "paga")
    .select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Salvo." };
}

export async function pagarConta(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  const valor = lerValor(campo(f, "valor"));
  if (!valor) return { erro: "Digite quanto foi pago." };
  const data = campo(f, "data") || hojeISO();
  if (!dataValida(data) || data > hojeISO()) return { erro: "A data do pagamento não pode ser no futuro." };
  const { error } = await supabase.rpc("pagar_conta", {
    p_usuario: usuarioId,
    p_conta: id,
    p_valor: valor,
    p_data: data,
    p_origem: "site",
  });
  if (error) {
    console.error("pagar conta:", error.code, error.message);
    return {
      erro: error.message.includes("data inválida") ? "Data do pagamento inválida." : ERRO_GENERICO,
    };
  }
  atualizar();
  return { sucesso: "Conta paga e gasto lançado em Despesas." };
}

export async function desfazerPagamento(f: FormData) {
  const { supabase, usuarioId } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase.rpc("reabrir_conta", { p_usuario: usuarioId, p_conta: id });
  atualizar();
}

/** Conta de conta fixa: "ignorar este mês". Avulsa: apagar. */
export async function tirarConta(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  const { data } = await supabase.from("contas").select("despesa_fixa_id, status").eq("id", id).maybeSingle();
  if (!data || data.status === "paga") return;
  if (data.despesa_fixa_id) await supabase.from("contas").update({ status: "ignorada" }).eq("id", id);
  else await supabase.from("contas").delete().eq("id", id);
  atualizar();
}

export async function voltarParaAPagar(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase.from("contas").update({ status: "a_pagar" }).eq("id", id).eq("status", "ignorada");
  atualizar();
}

// --------------------------------------------------------------- contas fixas

export async function criarFixa(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const valores = Object.fromEntries(["descricao", "valor", "categoria", "dia"].map((c) => [c, campo(f, c)]));
  const descricao = valores.descricao.slice(0, 200);
  if (!descricao) return { erro: "Digite a descrição (ex.: Aluguel).", valores };
  const { valor, erro } = valorOpcional(valores.valor);
  if (erro) return { erro, valores };
  if (!ehUuid(valores.categoria)) return { erro: "Escolha uma categoria.", valores };
  const dia = lerDia(valores.dia);
  if (!dia) return { erro: "O dia precisa ser de 1 a 31.", valores };
  const { error } = await supabase.from("despesas_fixas").insert({
    usuario_id: usuarioId,
    descricao,
    valor,
    categoria_id: valores.categoria,
    dia_vencimento: dia,
  });
  if (error) {
    console.error("criar conta fixa:", error.code, error.message);
    return { erro: ERRO_GENERICO, valores };
  }
  atualizar();
  return {
    sucesso: "Conta fixa cadastrada. As contas de cada mês aparecem sozinhas na lista.",
  };
}

export async function editarFixa(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  const descricao = campo(f, "descricao").slice(0, 200);
  const { valor, erro } = valorOpcional(campo(f, "valor"));
  const categoria = campo(f, "categoria");
  const dia = lerDia(campo(f, "dia"));
  if (!ehUuid(id) || !ehUuid(categoria)) return { erro: ERRO_GENERICO };
  if (!descricao) return { erro: "A descrição não pode ficar vazia." };
  if (erro) return { erro };
  if (!dia) return { erro: "O dia precisa ser de 1 a 31." };
  const { data, error } = await supabase
    .from("despesas_fixas")
    .update({ descricao, valor, categoria_id: categoria, dia_vencimento: dia })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Salvo. As contas ainda não pagas foram atualizadas." };
}

export async function alternarFixa(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase
    .from("despesas_fixas")
    .update({ ativa: campo(f, "ativa") === "sim" })
    .eq("id", id);
  atualizar();
}

export async function apagarFixa(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase.from("despesas_fixas").delete().eq("id", id);
  atualizar();
}

// ------------------------------------------------------------------- avisos

export async function salvarAvisos(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const antes = Number(campo(f, "antes"));
  const cada = Number(campo(f, "cada"));
  const hora = Number(campo(f, "hora"));
  if (![antes, cada, hora].every(Number.isInteger) || antes < 0 || antes > 10 || cada < 1 || cada > 7 || hora < 6 || hora > 20) {
    return { erro: ERRO_GENERICO };
  }
  const { error } = await supabase
    .from("perfis")
    .update({
      contas_aviso_dias_antes: antes,
      contas_aviso_atraso_cada: cada,
      contas_aviso_hora: hora,
    })
    .eq("id", usuarioId);
  if (error) return { erro: ERRO_GENERICO };
  atualizar();
  return { sucesso: "Avisos salvos." };
}
