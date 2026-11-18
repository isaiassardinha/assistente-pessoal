"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";
import { confirmarCodigoDigitado, enviarCodigo } from "./acoes";

export function Verificacao() {
  const [envio, enviar] = useActionState<EstadoFormulario>(enviarCodigo, ESTADO_INICIAL);
  const [confirmacao, confirmar] = useActionState(confirmarCodigoDigitado, ESTADO_INICIAL);

  if (confirmacao.sucesso) return <Aviso tipo="sucesso">{confirmacao.sucesso}</Aviso>;

  return (
    <div className="space-y-4">
      <form action={enviar} className="space-y-2">
        {envio.erro ? <Aviso tipo="erro">{envio.erro}</Aviso> : null}
        {envio.sucesso ? <Aviso tipo="sucesso">{envio.sucesso}</Aviso> : null}
        <BotaoEnviar variante="secundario" enviando="Enviando…">
          {envio.sucesso ? "Enviar outro código" : "Enviar código pelo WhatsApp"}
        </BotaoEnviar>
      </form>

      {envio.sucesso ? (
        <form action={confirmar} className="space-y-3">
          {confirmacao.erro ? <Aviso tipo="erro">{confirmacao.erro}</Aviso> : null}
          <Campo rotulo="Código recebido" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
          <BotaoEnviar enviando="Conferindo…">Verificar</BotaoEnviar>
        </form>
      ) : null}
    </div>
  );
}
