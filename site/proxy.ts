import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Roda antes de cada página:
 *  1. renova a sessão de login (cookies do Supabase), se precisar;
 *  2. coloca a proteção CSP com um "nonce" novo a cada visita, que impede
 *     o navegador de rodar qualquer script que não seja o nosso.
 * A checagem de quem pode ver o quê fica nas páginas e no banco (RLS).
 */
export async function proxy(request: NextRequest) {
  const cookiesParaGravar: { name: string; value: string; options: Record<string, unknown> }[] = [];
  let cabecalhosDeCache: Record<string, string> = {};

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url && chave) {
    const supabase = createServerClient(url, chave, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista, cabecalhos) {
          for (const { name, value, options } of lista) {
            request.cookies.set(name, value);
            cookiesParaGravar.push({ name, value, options });
          }
          cabecalhosDeCache = cabecalhos ?? {};
        },
      },
    });
    // Valida o login e renova a sessão quando estiver para vencer.
    await supabase.auth.getClaims();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const cabecalhosDaRequisicao = new Headers(request.headers);
  cabecalhosDaRequisicao.set("x-nonce", nonce);
  cabecalhosDaRequisicao.set("Content-Security-Policy", csp);

  const resposta = NextResponse.next({ request: { headers: cabecalhosDaRequisicao } });
  resposta.headers.set("Content-Security-Policy", csp);
  for (const { name, value, options } of cookiesParaGravar) {
    resposta.cookies.set(name, value, options);
  }
  for (const [chaveCabecalho, valor] of Object.entries(cabecalhosDeCache)) {
    resposta.headers.set(chaveCabecalho, valor);
  }
  return resposta;
}

export const config = {
  matcher: [
    {
      // tudo, menos /api, arquivos estáticos e o ícone
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
