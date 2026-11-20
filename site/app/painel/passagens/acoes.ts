"use server";

import { revalidatePath } from "next/cache";
import { exigirAprovado } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { ehUuid } from "@/lib/despesas";
import { lerValor } from "@/lib/dinheiro";
import { campo, ERRO_GENERICO, type EstadoFormulario } from "@/lib/formularios";
import { validarVigia } from "@/lib/passagens";

const CAMPOS = ["origem", "destino", "descricao", "tipo", "ida", "volta", "ida_ate", "dias_viagem", "adultos", "preco_alvo", "so_direto"];

function atualizar() {
  revalidatePath("/painel/passagens");
}

function erroDoBanco(mensagem: string): string {
  if (/limite de 10/.test(mensagem)) return "Você já tem 10 vigias ativas. Pause ou apague alguma antes.";
  if (/já passou/.test(mensagem)) return "A data dessa viagem já passou.";
  return ERRO_GENERICO;
}

export async function criarVigia(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, usuarioId } = await exigirAprovado();
  const valores = Object.fromEntries(CAMPOS.map((c) => [c, campo(f, c)]));
  const { dados, erro } = validarVigia(valores, hojeISO());
  if (!dados) return { erro, valores };
  const { error } = await supabase.from("vigias_passagem").insert({ ...dados, usuario_id: usuarioId });
  if (error) return { erro: erroDoBanco(error.message), valores };
  atualizar();
  return { sucesso: "Vigia criada! A primeira consulta acontece nos próximos minutos (entre 7h e 22h) e o aviso chega no WhatsApp." };
}

export async function alternarVigia(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase.from("vigias_passagem").update({ ativa: campo(f, "ativa") === "sim" }).eq("id", id);
  atualizar();
}

export async function mudarAlvo(_a: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  const alvo = lerValor(campo(f, "preco_alvo"));
  if (!ehUuid(id)) return { erro: ERRO_GENERICO };
  if (!alvo || alvo >= 1_000_000) return { erro: "Digite o novo preço-alvo (ex.: 2.800)." };
  const { error } = await supabase.from("vigias_passagem").update({ preco_alvo: alvo }).eq("id", id);
  if (error) return { erro: erroDoBanco(error.message) };
  atualizar();
  return { sucesso: "Alvo atualizado." };
}

export async function apagarVigia(f: FormData) {
  const { supabase } = await exigirAprovado();
  const id = campo(f, "id");
  if (!ehUuid(id)) return;
  await supabase.from("vigias_passagem").delete().eq("id", id);
  atualizar();
}
