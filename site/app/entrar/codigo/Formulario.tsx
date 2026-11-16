"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { confirmarCodigo } from "../acoes";

export function FormularioCodigo({ proximo }: { proximo: string }) {
  const [estado, acao] = useActionState(confirmarCodigo, ESTADO_INICIAL);
  return (
    <form action={acao} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <input type="hidden" name="proximo" value={proximo} />
      <Campo
        rotulo="Código"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        autoFocus
      />
      <BotaoEnviar enviando="Conferindo…">Confirmar</BotaoEnviar>
    </form>
  );
}
