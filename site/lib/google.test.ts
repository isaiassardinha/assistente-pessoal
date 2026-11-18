import { describe, expect, it } from "vitest";
import { enderecoDeAutorizacao, estadoConfere } from "./google";

describe("login do Google", () => {
  const estado = "a".repeat(64);
  it("estado só confere se for igual ao do cookie", () => {
    expect(estadoConfere(estado, estado)).toBe(true);
    expect(estadoConfere("b".repeat(64), estado)).toBe(false);
    expect(estadoConfere(estado, undefined)).toBe(false);
    expect(estadoConfere(null, estado)).toBe(false);
    expect(estadoConfere("x", "x")).toBe(false);
  });
  it("pede só a agenda, com acesso contínuo e retorno no nosso site", () => {
    process.env.SITE_URL = "https://sc.hayahtraining.com";
    process.env.GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
    const u = new URL(enderecoDeAutorizacao(estado));
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("redirect_uri")).toBe("https://sc.hayahtraining.com/auth/google/retorno");
    expect(u.searchParams.get("state")).toBe(estado);
  });
});
