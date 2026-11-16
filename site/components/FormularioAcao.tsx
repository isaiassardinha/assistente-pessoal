"use client";

import { useActionState, type ReactNode } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

type Acao = (anterior: EstadoFormulario, formulario: FormData) => Promise<EstadoFormulario>;

/** Formulário simples que mostra a mensagem de erro/sucesso da ação. */
export function FormularioAcao({
  acao,
  children,
  rotulo,
  enviando = "Salvando…",
  variante = "principal",
  className = "space-y-3",
}: {
  acao: Acao;
  children?: ReactNode;
  rotulo: string;
  enviando?: string;
  variante?: "principal" | "secundario" | "perigo";
  className?: string;
}) {
  const [estado, executar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={executar} className={className}>
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado.sucesso ? <Aviso tipo="sucesso">{estado.sucesso}</Aviso> : null}
      {children}
      <BotaoEnviar variante={variante} enviando={enviando}>
        {rotulo}
      </BotaoEnviar>
    </form>
  );
}
