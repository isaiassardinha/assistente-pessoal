import type { Metadata } from "next";
import { Aviso, PaginaCentral } from "@/components/ui";
import { caminhoSeguro } from "@/lib/validacao";
import { FormularioConfirmar } from "./Formulario";

export const metadata: Metadata = { title: "Confirmar" };

function texto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
}

/** Destino dos links enviados por e-mail. Mostra um botão em vez de usar o
 *  link sozinho (veja acoes.ts). */
export default async function PaginaConfirmar({ searchParams }: PageProps<"/auth/confirmar">) {
  const p = await searchParams;
  const tokenHash = texto(p.token_hash);
  const tipo = texto(p.type);
  const codigo = texto(p.code);
  const proximo = caminhoSeguro(texto(p.next), "/painel");
  const senhaNova = tipo === "recovery" || proximo === "/nova-senha";

  if (!tokenHash && !codigo) {
    return (
      <PaginaCentral titulo="Link incompleto">
        <Aviso tipo="erro">Esse link está incompleto. Abra de novo pelo botão do e-mail.</Aviso>
      </PaginaCentral>
    );
  }

  return (
    <PaginaCentral
      titulo={senhaNova ? "Criar senha nova" : "Confirmar e-mail"}
      subtitulo={senhaNova ? "Clique no botão para continuar." : "Falta só um clique para confirmar seu e-mail."}
    >
      <FormularioConfirmar
        tokenHash={tokenHash}
        tipo={tipo}
        codigo={codigo}
        proximo={proximo}
        rotulo={senhaNova ? "Continuar" : "Confirmar meu e-mail"}
      />
    </PaginaCentral>
  );
}
