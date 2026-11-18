import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as páginas são geradas na hora (necessário para a proteção CSP com
  // "nonce" e para o login). Para um site pessoal isso não pesa.
  poweredByHeader: false,
  experimental: {
    // envio de documentos de até 20 MB pela tela "Cérebro" (+ folga do formulário)
    serverActions: { bodySizeLimit: "21mb" },
    proxyClientMaxBodySize: "21mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
