// Confere, lendo o próprio código, que TODA função do banco.ts que mexe em
// dados pessoais recebe o dono (usuarioId) e filtra por ele.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TABELAS_PESSOAIS = [
  "categorias",
  "despesas",
  "despesas_fixas",
  "orcamentos",
  "tarefas",
  "lembretes",
  "memorias",
  "decisoes",
  "decisao_pontos",
  "documentos",
  "mensagens_conversa",
  "acoes_pendentes",
  "codigos_verificacao",
  "trechos",
];

// Funções que leem perfis/avisos pelo próprio servidor (não são dados de um usuário específico)
const EXCECOES = new Set([
  "limparRegistrosAntigos",
  // filas da rotina (olham todas as pessoas, mas só id/situação; o trabalho em si
  // é feito pelas funções seguintes, que recebem o dono)
  "anotacoesParaIndexar",
  "documentosParaProcessar",
]);

const codigo = readFileSync(path.join(__dirname, "banco.ts"), "utf8");
const funcoes = codigo.split(/\nexport async function /).slice(1).map((bloco) => {
  const nome = bloco.slice(0, bloco.indexOf("("));
  const corpo = bloco.slice(0, bloco.search(/\n}\n/));
  return { nome, corpo };
});

describe("todo acesso a dados pessoais é filtrado pelo dono", () => {
  it("encontrou as funções do banco", () => {
    expect(funcoes.length).toBeGreaterThan(20);
  });

  for (const { nome, corpo } of funcoes) {
    const tabelas = TABELAS_PESSOAIS.filter((t) => corpo.includes(`from("${t}")`));
    if (tabelas.length === 0 || EXCECOES.has(nome)) continue;

    it(`${nome} recebe usuarioId e filtra por ele (${tabelas.join(", ")})`, () => {
      const parametros = corpo.slice(0, corpo.indexOf(")"));
      expect(parametros).toContain("usuarioId: string");
      const filtra = corpo.includes('.eq("usuario_id", usuarioId)') || /usuario_id: usuarioId/.test(corpo);
      expect(filtra).toBe(true);
      // nunca um update/delete/select sem o filtro (insert leva usuario_id no dado)
      if (/\.(update|delete|select)\(/.test(corpo) && !/\.insert\(|\.upsert\(/.test(corpo)) {
        expect(corpo).toContain('.eq("usuario_id", usuarioId)');
      }
    });
  }
});
