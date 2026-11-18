"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Aviso } from "@/components/ui";
import {
  DESCRICAO_TIPOS,
  EXTENSOES_ACEITAS,
  MAXIMO_POR_ENVIO,
  pastaDoArquivo,
  prepararEnvio,
  tamanhoLegivel,
  type Ignorado,
} from "@/lib/arquivos";
import { classeLargura } from "@/lib/orcamento";
import { concluirEnvio, enviarArquivo } from "./acoes";

type Item = { arquivo: File; nome: string; tamanho: number; tipo: string; caminho: string };
type Situacao = "esperando" | "enviando" | "enviado" | "repetido" | "erro";

const ACEITOS = EXTENSOES_ACEITAS.map((e) => `.${e}`).join(",");
const BOTAO = "rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";

export function EnviarArquivos() {
  const router = useRouter();
  const arquivosRef = useRef<HTMLInputElement>(null);
  const pastaRef = useRef<HTMLInputElement>(null);
  const [fila, setFila] = useState<Item[]>([]);
  const [ignorados, setIgnorados] = useState<Ignorado[]>([]);
  const [situacao, setSituacao] = useState<Record<number, { s: Situacao; erro?: string }>>({});
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  // o navegador só aceita "escolher pasta" com este atributo (não existe nos tipos do React)
  useEffect(() => {
    pastaRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  // avisa antes de sair da página no meio do envio
  useEffect(() => {
    if (!enviando) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [enviando]);

  function escolher(lista: FileList | File[] | null) {
    if (!lista || enviando) return;
    const itens: Item[] = Array.from(lista).map((f) => ({
      arquivo: f,
      nome: f.name,
      tamanho: f.size,
      tipo: f.type,
      caminho: f.webkitRelativePath || "",
    }));
    const { enviar, ignorados } = prepararEnvio(itens);
    setFila(enviar);
    setIgnorados(ignorados);
    setSituacao({});
    setTerminou(false);
    if (arquivosRef.current) arquivosRef.current.value = "";
    if (pastaRef.current) pastaRef.current.value = "";
  }

  async function enviarTudo() {
    setEnviando(true);
    for (const [i, item] of fila.entries()) {
      setSituacao((s) => ({ ...s, [i]: { s: "enviando" } }));
      const dados = new FormData();
      dados.append("arquivo", item.arquivo);
      const pasta = pastaDoArquivo(item.caminho);
      dados.append("descricao", [descricao.trim(), pasta ? `Pasta: ${pasta}` : ""].filter(Boolean).join(" · "));
      try {
        const r = await enviarArquivo(dados);
        setSituacao((s) => ({ ...s, [i]: r.ok ? { s: r.repetido ? "repetido" : "enviado" } : { s: "erro", erro: r.erro } }));
      } catch {
        setSituacao((s) => ({ ...s, [i]: { s: "erro", erro: "falha na conexão" } }));
      }
    }
    await concluirEnvio().catch(() => {});
    setEnviando(false);
    setTerminou(true);
    router.refresh();
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    escolher(e.dataTransfer.files);
  }

  const valores = Object.values(situacao);
  const feitos = valores.filter((v) => v.s !== "esperando" && v.s !== "enviando").length;
  const enviados = valores.filter((v) => v.s === "enviado").length;
  const repetidos = valores.filter((v) => v.s === "repetido").length;
  const erros = valores.filter((v) => v.s === "erro").length;
  const total = fila.reduce((s, i) => s + i.tamanho, 0);
  const percentual = fila.length ? (feitos / fila.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={`rounded-xl border-2 border-dashed p-5 text-center ${arrastando ? "border-emerald-500 bg-emerald-50" : "border-zinc-300"}`}
      >
        <p className="text-sm text-zinc-700">Arraste arquivos para cá, ou:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className={BOTAO} disabled={enviando} onClick={() => arquivosRef.current?.click()}>
            Escolher arquivos
          </button>
          <button type="button" className={BOTAO} disabled={enviando} onClick={() => pastaRef.current?.click()}>
            Escolher uma pasta inteira
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {DESCRICAO_TIPOS}. Até 20 MB cada e {MAXIMO_POR_ENVIO} arquivos por vez. Arquivos de outros tipos dentro da pasta são pulados.
        </p>
        <input ref={arquivosRef} type="file" multiple accept={ACEITOS} className="hidden" onChange={(e) => escolher(e.target.files)} />
        <input ref={pastaRef} type="file" multiple className="hidden" onChange={(e) => escolher(e.target.files)} />
      </div>

      {fila.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-800">
            <strong>{fila.length}</strong> arquivo(s) para enviar ({tamanhoLegivel(total)}).
          </p>
          {!enviando && !terminou ? (
            <>
              <div className="space-y-1">
                <label htmlFor="descricao-envio" className="block text-sm font-medium text-zinc-800">
                  Descrição para todos (opcional)
                </label>
                <input
                  id="descricao-envio"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: documentos do apartamento"
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
                <p className="text-xs text-zinc-500">O nome da pasta de origem também é guardado, para ajudar nas buscas.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={enviarTudo}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Enviar {fila.length} arquivo(s)
                </button>
                <button type="button" className={BOTAO} onClick={() => escolher([])}>
                  Cancelar
                </button>
              </div>
            </>
          ) : null}

          {enviando || terminou ? (
            <div>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                <div className={`h-full rounded-full bg-emerald-500 ${classeLargura(percentual)}`} />
              </div>
              <p className="mt-1 text-sm text-zinc-700">
                {enviando ? `Enviando ${Math.min(feitos + 1, fila.length)} de ${fila.length}… não feche esta página.` : "Envio concluído."}
              </p>
            </div>
          ) : null}

          {terminou ? (
            <Aviso tipo={erros ? "info" : "sucesso"}>
              {enviados} enviado(s)
              {repetidos ? `, ${repetidos} já estava(m) guardado(s)` : ""}
              {erros ? `, ${erros} com problema (veja a lista abaixo)` : ""}. Os novos aparecem na lista como “Na fila para ler”.
            </Aviso>
          ) : null}

          <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 text-sm">
            {fila.map((item, i) => {
              const st = situacao[i]?.s ?? "esperando";
              const rotulo = {
                esperando: "aguardando",
                enviando: "enviando…",
                enviado: "enviado ✓",
                repetido: "já estava guardado",
                erro: situacao[i]?.erro ?? "erro",
              }[st];
              const cor = st === "erro" ? "text-red-700" : st === "enviado" ? "text-emerald-700" : "text-zinc-500";
              return (
                <li key={`${item.caminho || item.nome}-${i}`} className="flex justify-between gap-3 px-3 py-1.5">
                  <span className="truncate text-zinc-800">{item.caminho || item.nome}</span>
                  <span className={`shrink-0 ${cor}`}>{rotulo}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {ignorados.length > 0 ? (
        <details className="text-sm text-zinc-600">
          <summary className="cursor-pointer">{ignorados.length} arquivo(s) não serão enviados</summary>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
            {ignorados.map((g, i) => (
              <li key={`${g.nome}-${i}`}>
                {g.nome} — {g.motivo}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
