import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function PaginaCentral({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center text-sm font-semibold tracking-wide text-emerald-700">
          Assistente Pessoal
        </Link>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-zinc-900">{titulo}</h1>
          {subtitulo ? <div className="mt-2 text-sm text-zinc-600">{subtitulo}</div> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

type CampoProps = ComponentProps<"input"> & { rotulo: string; dica?: string };

export function Campo({ rotulo, dica, id, name, ...resto }: CampoProps) {
  const idCampo = id ?? name;
  return (
    <div className="space-y-1">
      <label htmlFor={idCampo} className="block text-sm font-medium text-zinc-800">
        {rotulo}
      </label>
      <input
        id={idCampo}
        name={name}
        className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        {...resto}
      />
      {dica ? <p className="text-xs text-zinc-500">{dica}</p> : null}
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "sucesso" | "info"; children: ReactNode }) {
  const cores = {
    erro: "border-red-200 bg-red-50 text-red-800",
    sucesso: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-amber-200 bg-amber-50 text-amber-900",
  }[tipo];
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${cores}`}>
      {children}
    </div>
  );
}

export function LinkBotao({ href, children, variante = "principal" }: { href: string; children: ReactNode; variante?: "principal" | "secundario" }) {
  const estilo =
    variante === "principal"
      ? "bg-emerald-700 text-white hover:bg-emerald-800"
      : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50";
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold ${estilo}`}>
      {children}
    </Link>
  );
}
