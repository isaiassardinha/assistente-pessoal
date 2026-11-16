import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaginaCentral } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { Cadastro2fa } from "./Cadastro2fa";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function Pagina2fa() {
  const { supabase, perfil, aal } = await exigirAprovado();
  if (!perfil.is_admin) redirect("/painel");

  const { data } = await supabase.auth.mfa.listFactors();
  const jaTem = (data?.totp ?? []).some((f) => f.status === "verified");
  if (jaTem) redirect(aal === "aal2" ? "/admin" : "/entrar/codigo?proximo=/admin");

  return (
    <PaginaCentral
      titulo="Verificação em duas etapas"
      subtitulo="Obrigatória para o administrador. Além da senha, você vai digitar um código que muda a cada 30 segundos."
    >
      <Cadastro2fa />
    </PaginaCentral>
  );
}
