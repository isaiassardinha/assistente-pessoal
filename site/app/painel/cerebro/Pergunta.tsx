"use client";

import { useActionState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { Aviso } from "@/components/ui";
import { perguntar, type EstadoPergunta } from "./acoes";

export function Pergunta() {
  const [estado, executar] = useActionState<EstadoPergunta, FormData>(perguntar, {});
  return (
    <div className="space-y-4">
      <form action={executar} className="space-y-3">
        <label htmlFor="pergunta" className="block text-sm font-medium text-zinc-800">
          O que você quer saber?
        </label>
        <textarea
          id="pergunta"
          name="pergunta"
          rows={2}
          maxLength={500}
          required
          defaultValue={estado.pergunta ?? ""}
          placeholder="Ex.: qual a multa se eu sair antes do fim do contrato de aluguel?"
          className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
        <BotaoEnviar enviando="Procurando…">Perguntar</BotaoEnviar>
      </form>

      {estado.erro ? <Aviso tipo="erro">{estado.erro}</Aviso> : null}
      {estado.resposta ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="whitespace-pre-line text-zinc-900">{estado.resposta}</p>
          {estado.fontes && estado.fontes.length > 0 ? (
            <div className="mt-3 border-t border-emerald-200 pt-2 text-sm text-zinc-700">
              <span className="font-medium">Fontes: </span>
              {estado.fontes.map((f, i) => (
                <span key={`${f.tipo}-${f.id}`}>
                  {i > 0 ? ", " : ""}
                  {f.tipo === "documento" ? (
                    <a href={`/painel/cerebro/baixar/${f.id}`} className="text-emerald-700 underline" target="_blank" rel="noopener">
                      {f.nome}
                    </a>
                  ) : (
                    <a href="#anotacoes" className="text-emerald-700 underline">
                      {f.nome}
                    </a>
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
