import { describe, expect, it } from "vitest";
import {
  caminhoSeguro,
  formatarCelular,
  normalizarCelular,
  problemaNaSenha,
  validarCodigo6,
  validarEmail,
} from "./validacao";

describe("normalizarCelular", () => {
  it("aceita os formatos comuns do Brasil", () => {
    expect(normalizarCelular("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizarCelular("11912345678")).toBe("5511912345678");
    expect(normalizarCelular("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizarCelular("5511912345678")).toBe("5511912345678");
    expect(normalizarCelular("011 91234-5678")).toBe("5511912345678");
  });
  it("aceita número antigo de 8 dígitos", () => {
    expect(normalizarCelular("(21) 8123-4567")).toBe("552181234567");
  });
  it("aceita número estrangeiro com +", () => {
    expect(normalizarCelular("+49 151 23456789")).toBe("4915123456789");
  });
  it("recusa o que não é celular", () => {
    expect(normalizarCelular("")).toBeNull();
    expect(normalizarCelular("1234")).toBeNull();
    expect(normalizarCelular("(11) 81234-5678")).toBeNull(); // 9 dígitos sem começar com 9
    expect(normalizarCelular("(10) 91234-5678")).toBeNull(); // DDD inválido (não existe DDD com zero)
    expect(normalizarCelular("abc")).toBeNull();
  });
});

describe("formatarCelular", () => {
  it("mostra bonito", () => {
    expect(formatarCelular("5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatarCelular(null)).toBe("");
  });
});

describe("senha", () => {
  it("exige no mínimo 8 caracteres", () => {
    expect(problemaNaSenha("1234567")).toMatch(/pelo menos 8/);
    expect(problemaNaSenha("12345678")).toBeNull();
  });
  it("confere a confirmação", () => {
    expect(problemaNaSenha("12345678", "12345679")).toMatch(/não são iguais/);
    expect(problemaNaSenha("12345678", "12345678")).toBeNull();
  });
  it("limita o tamanho máximo", () => {
    expect(problemaNaSenha("a".repeat(73))).toMatch(/no máximo/);
  });
});

describe("validarEmail e validarCodigo6", () => {
  it("e-mail", () => {
    expect(validarEmail("ana@exemplo.com")).toBe(true);
    expect(validarEmail("ana@exemplo")).toBe(false);
    expect(validarEmail("ana exemplo.com")).toBe(false);
  });
  it("código de 6 dígitos", () => {
    expect(validarCodigo6("123456")).toBe(true);
    expect(validarCodigo6(" 123456 ")).toBe(true);
    expect(validarCodigo6("12345")).toBe(false);
    expect(validarCodigo6("12345a")).toBe(false);
  });
});

describe("caminhoSeguro (evita redirecionar para outro site)", () => {
  it("aceita caminhos internos", () => {
    expect(caminhoSeguro("/admin")).toBe("/admin");
    expect(caminhoSeguro("/nova-senha")).toBe("/nova-senha");
  });
  it("recusa endereços externos e truques", () => {
    expect(caminhoSeguro("https://golpe.com")).toBe("/painel");
    expect(caminhoSeguro("//golpe.com")).toBe("/painel");
    expect(caminhoSeguro("/\\golpe.com")).toBe("/painel");
    expect(caminhoSeguro("/a\r\nSet-Cookie: x")).toBe("/painel");
    expect(caminhoSeguro(null)).toBe("/painel");
    expect(caminhoSeguro(undefined, "/")).toBe("/");
  });
});
