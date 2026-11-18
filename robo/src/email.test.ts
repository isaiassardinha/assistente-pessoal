import { describe, expect, it } from "vitest";
import { aplicarRegras, ehAutomatico, emailValido, emSilencio, limparSenhaDeApp, regraCasa, senhaDeAppValida, textoParaIa } from "./email";

const e = { remetenteEmail: "alertas@banco.com.br", remetenteNome: "Banco Exemplo", assunto: "Fatura do cartão vence amanhã" };

describe("senha de app e e-mail", () => {
  it("aceita a senha do jeito que o Google mostra (com espaços)", () => {
    expect(limparSenhaDeApp("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(senhaDeAppValida("abcd efgh ijkl mnop")).toBe(true);
    expect(senhaDeAppValida("minhaSenha123")).toBe(false);
  });
  it("e-mail válido", () => {
    expect(emailValido("henrique@gmail.com")).toBe(true);
    expect(emailValido("henrique")).toBe(false);
  });
});

describe("regras da pessoa", () => {
  it("domínio, endereço e palavra", () => {
    expect(regraCasa("@banco.com.br", e)).toBe(true);
    expect(regraCasa("alertas@banco.com.br", e)).toBe(true);
    expect(regraCasa("outro@banco.com.br", e)).toBe(false);
    expect(regraCasa("fatura", e)).toBe(true);
    expect(regraCasa("fat", e)).toBe(false); // palavra inteira
    expect(regraCasa("cartao", e)).toBe(true); // sem acento
  });
  it("'sempre importante' ganha de 'ignorar'", () => {
    expect(aplicarRegras([{ tipo: "ignorar", padrao: "@banco.com.br" }, { tipo: "importante", padrao: "fatura" }], e)).toBe("importante");
    expect(aplicarRegras([{ tipo: "ignorar", padrao: "@banco.com.br" }], e)).toBe("ignorar");
    expect(aplicarRegras([], e)).toBeNull();
  });
});

describe("e-mail automático", () => {
  it("newsletter, lista e robôs", () => {
    expect(ehAutomatico("List-Unsubscribe: <mailto:x@y>\r\n", "loja@loja.com")).toBe(true);
    expect(ehAutomatico("Precedence: bulk\r\n", "a@b.com")).toBe(true);
    expect(ehAutomatico("Auto-Submitted: auto-generated\r\n", "a@b.com")).toBe(true);
    expect(ehAutomatico("Auto-Submitted: no\r\n", "a@b.com")).toBe(false);
    expect(ehAutomatico("", "no-reply@servico.com")).toBe(true);
    expect(ehAutomatico("", "joao@empresa.com")).toBe(false);
  });
});

describe("texto para a IA", () => {
  it("usa o HTML quando não há texto e corta trechos citados", () => {
    const t = textoParaIa(undefined, "<style>x{}</style><p>Olá&nbsp;Henrique</p><div>Boleto R$ 100</div>");
    expect(t).toBe("Olá Henrique\nBoleto R$ 100");
    expect(textoParaIa("Resposta\n> mensagem antiga\n> mais antiga", undefined)).toBe("Resposta");
    expect(textoParaIa("a".repeat(5000), undefined).length).toBe(2500);
  });
});

describe("horário de silêncio", () => {
  it("atravessa a meia-noite", () => {
    expect(emSilencio(23, 22, 7)).toBe(true);
    expect(emSilencio(3, 22, 7)).toBe(true);
    expect(emSilencio(7, 22, 7)).toBe(false);
    expect(emSilencio(15, 22, 7)).toBe(false);
  });
});
