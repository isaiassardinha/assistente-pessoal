import type { Metadata } from "next";
import { PaginaCentral } from "@/components/ui";
import { FormularioEsqueci } from "./Formulario";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function PaginaEsqueci() {
  return (
    <PaginaCentral titulo="Esqueci a senha" subtitulo="Digite seu e-mail e enviaremos um link para criar uma senha nova.">
      <FormularioEsqueci />
    </PaginaCentral>
  );
}
