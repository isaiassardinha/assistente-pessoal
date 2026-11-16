// Configurações lidas do ambiente (arquivo /etc/assistente/site.env no servidor).
// Nada de chave ou senha escrita no código.

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Configuração ausente: ${nome}. Veja .env.example e docs/servidor.md.`);
  }
  return valor;
}

export const config = {
  /** Endereço público do site. Atrás do Caddy o Next.js se enxerga como
   *  localhost:3000, por isso TODO link e redirecionamento usa este valor. */
  get siteUrl() {
    return obrigatoria("SITE_URL").replace(/\/+$/, "");
  },
  get supabaseUrl() {
    return obrigatoria("SUPABASE_URL");
  },
  get supabaseChavePublica() {
    return obrigatoria("SUPABASE_PUBLISHABLE_KEY");
  },
};

/** Monta um endereço completo do site a partir de um caminho ("/painel"). */
export function urlDoSite(caminho: string): string {
  return new URL(caminho, `${config.siteUrl}/`).toString();
}
