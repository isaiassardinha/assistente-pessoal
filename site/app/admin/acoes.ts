"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAprovado, exigirAdmin } from "@/lib/auth/sessao";
import { campo, type EstadoFormulario } from "@/lib/formularios";
import type { StatusCadastro } from "@/lib/supabase/tipos";
import { validarCodigo6 } from "@/lib/validacao";

const STATUS_VALIDOS: StatusCadastro[] = ["aprovado", "recusado", "pendente"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Aprovar ou recusar um cadastro. O banco confere de novo se é admin com 2FA. */
export async function definirStatus(formulario: FormData) {
  const { supabase } = await exigirAdmin();
  const usuario = campo(formulario, "usuario");
  const status = campo(formulario, "status") as StatusCadastro;
  if (!UUID.test(usuario) || !STATUS_VALIDOS.includes(status)) return;

  const { error } = await supabase.rpc("admin_definir_status", { p_usuario: usuario, p_status: status });
  if (error) console.error("admin definir status:", error.code, error.message);
  // (etapa do robô: aqui entra a mensagem de boas-vindas no WhatsApp)
  revalidatePath("/admin");
}

export type EstadoCadastro2fa = EstadoFormulario & { fatorId?: string; qr?: string; segredo?: string };

/** Gera o QR Code para cadastrar o app autenticador do administrador. */
export async function iniciarCadastro2fa(): Promise<EstadoCadastro2fa> {
  const { supabase, perfil } = await exigirAprovado();
  if (!perfil.is_admin) redirect("/painel");

  // Apaga tentativas anteriores que não foram concluídas.
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  for (const f of fatores?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Assistente Pessoal ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Assistente Pessoal",
  });
  if (error || !data) {
    console.error("2fa enroll:", error?.code, error?.message);
    return { erro: "Não consegui gerar o QR Code agora. Tente de novo em instantes." };
  }
  return { fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function confirmarCadastro2fa(anterior: EstadoCadastro2fa, formulario: FormData): Promise<EstadoCadastro2fa> {
  const { supabase, perfil } = await exigirAprovado();
  if (!perfil.is_admin) redirect("/painel");

  const fatorId = campo(formulario, "fatorId");
  const codigo = campo(formulario, "codigo").replace(/\s/g, "");
  if (!validarCodigo6(codigo)) return { ...anterior, erro: "Digite os 6 números que aparecem no app." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo });
  if (error) return { ...anterior, erro: "Código incorreto. Use o código que está aparecendo agora no app." };

  redirect("/admin");
}
