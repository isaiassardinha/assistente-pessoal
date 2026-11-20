import { describe, expect, it } from "vitest";
import { enderecoDeAutorizacao, espacoDoDestino, estadoConfere } from "./google";

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
  it("no Drive do espaço pede só os arquivos criados pelo assistente, sem juntar outras permissões", () => {
    process.env.SITE_URL = "https://sc.hayahtraining.com";
    process.env.GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
    const u = new URL(enderecoDeAutorizacao(estado, "drive"));
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(u.searchParams.get("include_granted_scopes")).toBeNull();
    expect(u.searchParams.get("access_type")).toBe("offline");
  });
  it("destino do Drive só aceita id de espaço válido", () => {
    expect(espacoDoDestino("drive:00000000-0000-4000-a000-00000000a001")).toBe("00000000-0000-4000-a000-00000000a001");
    expect(espacoDoDestino("drive:../x")).toBeNull();
    expect(espacoDoDestino(undefined)).toBeNull();
  });
});
