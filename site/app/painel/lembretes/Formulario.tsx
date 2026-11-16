"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { criarLembrete } from "./acoes";

export function FormularioNovoLembrete({ agora }: { agora: string }) {
  const [estado, acao] = useActionState(criarLembrete, ESTADO_INICIAL);
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="space-y-3">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado.sucesso ? <Aviso tipo="sucesso">{estado.sucesso}</Aviso> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Campo rotulo="Me lembrar de…" name="texto" maxLength={500} placeholder="Ex.: pagar a conta de luz" required defaultValue={v.texto} />
        <Campo rotulo="Quando (horário de Brasília)" name="quando" type="datetime-local" min={agora} required defaultValue={v.quando} />
      </div>
      <BotaoEnviar enviando="Criando…">Criar lembrete</BotaoEnviar>
    </form>
  );
}
