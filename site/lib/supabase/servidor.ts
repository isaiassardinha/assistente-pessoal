import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import type { Database } from "./tipos";

/**
 * Cliente do Supabase com a sessão de QUEM ESTÁ LOGADO (lida dos cookies).
 * Usa a chave pública: o banco aplica as travas (RLS) normalmente, então
 * cada pessoa só enxerga os próprios dados.
 */
export async function criarClienteSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(config.supabaseUrl, config.supabaseChavePublica, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de dentro de uma página (só leitura). O proxy renova a sessão.
        }
      },
    },
  });
}
