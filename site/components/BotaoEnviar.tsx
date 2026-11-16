"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Botão de enviar que se desativa enquanto o formulário está sendo enviado. */
export function BotaoEnviar({
  children,
  enviando = "Aguarde…",
  variante = "principal",
}: {
  children: ReactNode;
  enviando?: string;
  variante?: "principal" | "secundario" | "perigo";
}) {
  const { pending } = useFormStatus();
  const estilo = {
    principal: "w-full bg-emerald-700 text-white hover:bg-emerald-800",
    secundario: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
    perigo: "bg-red-600 text-white hover:bg-red-700",
  }[variante];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${estilo}`}
    >
      {pending ? enviando : children}
    </button>
  );
}
