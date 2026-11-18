"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Enquanto algum documento está sendo lido, atualiza a tela a cada 5 segundos. */
export function AtualizarSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
