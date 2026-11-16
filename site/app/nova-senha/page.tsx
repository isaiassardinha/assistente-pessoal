import type { Metadata } from "next";
import { PaginaCentral } from "@/components/ui";
import { exigirLogin } from "@/lib/auth/sessao";
import { FormularioNovaSenha } from "./Formulario";

export const metadata: Metadata = { title: "Nova senha" };

export default async function PaginaNovaSenha() {
  // O link do e-mail já deixa a pessoa logada; sem ele, manda para "entrar".
  await exigirLogin();
  return (
    <PaginaCentral titulo="Criar uma senha nova">
      <FormularioNovaSenha />
    </PaginaCentral>
  );
}
