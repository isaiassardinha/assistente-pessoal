"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso, Campo } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { entrar } from "./acoes";

export function FormularioEntrar({ proximo }: { proximo: string }) {
  const [estado, acao] = useActionState(entrar, ESTADO_INICIAL);

  return (
    <form action={acao} className="space-y-4">
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      <input type="hidden" name="proximo" value={proximo} />
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required defaultValue={estado.valores?.email} />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
      <BotaoEnviar enviando="Entrando…">Entrar</BotaoEnviar>
      <div className="flex flex-col items-center gap-2 text-sm text-zinc-600 sm:flex-row sm:justify-between">
        <Link href="/esqueci-senha" className="font-medium text-emerald-700 hover:underline">
          Esqueci a senha
        </Link>
        <span>
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-emerald-700 hover:underline">
            Criar conta
          </Link>
        </span>
      </div>
    </form>
  );
}
