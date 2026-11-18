"use client";

import { useState } from "react";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Campo } from "@/components/ui";
import { apagarDocumento, editarDescricao, relerDocumento } from "./acoes";

const ICONE = "rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

/** Ícones de editar e excluir ao lado do nome do documento. */
export function AcoesDocumento({ id, nome, descricao, comErro }: { id: string; nome: string; descricao: string; comErro: boolean }) {
  const [editando, setEditando] = useState(false);
  return (
    <>
      <span className="inline-flex items-center gap-0.5">
        <button type="button" className={ICONE} title="Editar descrição" aria-label={`Editar ${nome}`} onClick={() => setEditando((v) => !v)}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
          </svg>
        </button>
        <form
          action={apagarDocumento}
          onSubmit={(e) => {
            if (!window.confirm(`Apagar "${nome}"? O arquivo sai do cofre e das buscas.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={`${ICONE} hover:text-red-700`} title="Excluir" aria-label={`Excluir ${nome}`}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </form>
        {comErro ? (
          <form action={relerDocumento}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="ml-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              Tentar ler de novo
            </button>
          </form>
        ) : null}
      </span>
      {editando ? (
        <div className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <FormularioAcao acao={editarDescricao} rotulo="Salvar descrição" variante="secundario">
            <input type="hidden" name="id" value={id} />
            <Campo rotulo="Descrição" name="descricao" maxLength={1000} defaultValue={descricao} />
          </FormularioAcao>
        </div>
      ) : null}
    </>
  );
}
