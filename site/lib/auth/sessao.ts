import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteSupabase } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/supabase/tipos";

type Supabase = Awaited<ReturnType<typeof criarClienteSupabase>>;

export type Sessao = {
  supabase: Supabase;
  usuarioId: string;
  /** "aal1" = só senha; "aal2" = senha + código do app autenticador */
  aal: string;
  perfil: Perfil | null;
};

export type SessaoComPerfil = Sessao & { perfil: Perfil };

/** Quem está logado agora (ou null). Calculado uma vez por visita. */
export const obterSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await criarClienteSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const usuarioId = data.claims.sub;
  const { data: perfil } = await supabase.from("perfis").select("*").eq("id", usuarioId).maybeSingle();

  return {
    supabase,
    usuarioId,
    aal: typeof data.claims.aal === "string" ? data.claims.aal : "aal1",
    perfil: perfil ?? null,
  };
});

/** Precisa estar logado (cadastro pode estar pendente). */
export async function exigirLogin(): Promise<SessaoComPerfil> {
  const sessao = await obterSessao();
  if (!sessao?.perfil) redirect("/entrar");
  return sessao as SessaoComPerfil;
}

/** Precisa estar logado, aprovado e (se tiver 2FA) ter digitado o código. */
export async function exigirAprovado(): Promise<SessaoComPerfil> {
  const sessao = await exigirLogin();
  if (sessao.perfil.status !== "aprovado") redirect("/aguardando");

  if (sessao.aal !== "aal2") {
    const { data } = await sessao.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
      redirect("/entrar/codigo");
    }
  }
  return sessao;
}

/** Área do administrador: precisa ser admin E ter entrado com 2FA. */
export async function exigirAdmin(): Promise<SessaoComPerfil> {
  const sessao = await exigirAprovado();
  if (!sessao.perfil.is_admin) redirect("/painel");

  const { data } = await sessao.supabase.auth.mfa.listFactors();
  const temAutenticador = (data?.totp ?? []).some((f) => f.status === "verified");
  if (!temAutenticador) redirect("/admin/2fa");
  if (sessao.aal !== "aal2") redirect("/entrar/codigo?proximo=/admin");
  return sessao;
}

/** Versão sem redirecionar (para rotas que devolvem dados): é admin com 2FA? */
export async function ehAdminCom2fa(): Promise<boolean> {
  const sessao = await obterSessao();
  if (!sessao?.perfil || sessao.perfil.status !== "aprovado" || !sessao.perfil.is_admin) return false;
  return sessao.aal === "aal2";
}
