"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { pedirNovaSenha } from "./acoes";

export function FormularioEsqueci() {
  const [estado, acao] = useActionState(pedirNovaSenha, ESTADO_INICIAL);

  if (estado.sucesso) {
    return (
      <div className="space-y-4">
        <Aviso tipo="sucesso">{estado.sucesso}</Aviso>
        <Link href="/entrar" className="block text-center text-sm font-medium text-emerald-700 hover:underline">
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required defaultValue={estado.valores?.email} />
      <BotaoEnviar enviando="Enviando…">Enviar link</BotaoEnviar>
      <Link href="/entrar" className="block text-center text-sm font-medium text-emerald-700 hover:underline">
        Voltar para entrar
      </Link>
    </form>
  );
}
