import type { Metadata } from "next";
import Link from "next/link";
import { PaginaCentral } from "@/components/ui";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

export default function VerifiqueEmail() {
  return (
    <PaginaCentral titulo="Confira seu e-mail">
      <div className="space-y-3 text-zinc-700">
        <p>Enviamos uma mensagem com um link de confirmação. Clique nele para ativar sua conta.</p>
        <p className="text-sm text-zinc-500">
          Não chegou em alguns minutos? Olhe a caixa de spam ou promoções. Se você já tinha conta com
          este e-mail, é só{" "}
          <Link href="/entrar" className="font-medium text-emerald-700 hover:underline">
            entrar
          </Link>
          .
        </p>
      </div>
    </PaginaCentral>
  );
}
