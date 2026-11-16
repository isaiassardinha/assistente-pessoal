"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso } from "@/components/ui";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { usarLink } from "./acoes";

type Props = { tokenHash: string; tipo: string; codigo: string; proximo: string; rotulo: string };

export function FormularioConfirmar({ tokenHash, tipo, codigo, proximo, rotulo }: Props) {
  const [estado, acao] = useActionState(usarLink, ESTADO_INICIAL);

  if (estado.erro) {
    return (
      <div className="space-y-4">
        <Aviso tipo="erro">{estado.erro}</Aviso>
        <Link href="/entrar" className="block text-center text-sm font-medium text-emerald-700 hover:underline">
          Ir para entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={tipo} />
      <input type="hidden" name="code" value={codigo} />
      <input type="hidden" name="next" value={proximo} />
      <BotaoEnviar enviando="Confirmando…">{rotulo}</BotaoEnviar>
    </form>
  );
}
