import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as páginas são geradas na hora (necessário para a proteção CSP com
  // "nonce" e para o login). Para um site pessoal isso não pesa.
  poweredByHeader: false,
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
