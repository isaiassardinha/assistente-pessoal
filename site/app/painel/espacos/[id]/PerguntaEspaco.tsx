"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso } from "@/components/ui";
import { perguntar, type EstadoPerguntaEspaco } from "../acoes";

export function PerguntaEspaco({ espacoId }: { espacoId: string }) {
  const [estado, executar] = useActionState<EstadoPerguntaEspaco, FormData>(perguntar, {});
  return (
    <div className="space-y-4">
      <form action={executar} className="space-y-3">
        <input type="hidden" name="espaco" value={espacoId} />
        <label htmlFor="pergunta-espaco" className="block text-sm font-medium text-zinc-800">
          O que você quer saber?
        </label>
        <textarea
          id="pergunta-espaco"
          name="pergunta"
          rows={2}
          maxLength={500}
          required
          defaultValue={estado.pergunta ?? ""}
          placeholder="Ex.: o que ficou combinado sobre o orçamento?"
          className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
        <BotaoEnviar enviando="Procurando…">Perguntar</BotaoEnviar>
      </form>
      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado.resposta ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="whitespace-pre-line text-zinc-900">{estado.resposta}</p>
        </div>
      ) : null}
    </div>
  );
}
