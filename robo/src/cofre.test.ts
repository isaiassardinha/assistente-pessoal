import { describe, expect, it } from "vitest";
import { cifrar, decifrar } from "./cofre";

const CHAVE = "a".repeat(64);

describe("cofre das conexões", () => {
  it("cifra e decifra", () => {
    const c = cifrar("abcd efgh ijkl mnop", CHAVE);
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain("abcd");
    expect(decifrar(c, CHAVE)).toBe("abcd efgh ijkl mnop");
  });
  it("cada vez sai diferente", () => {
    expect(cifrar("x", CHAVE)).not.toBe(cifrar("x", CHAVE));
  });
  it("chave errada ou texto mexido não abre", () => {
    const c = cifrar("segredo", CHAVE);
    expect(() => decifrar(c, "b".repeat(64))).toThrow();
    expect(() => decifrar(c.slice(0, -2) + "AA", CHAVE)).toThrow();
  });
  it("sem chave configurada, não cifra", () => {
    expect(() => cifrar("x", "")).toThrow(/CONEXOES_CHAVE/);
  });
});
