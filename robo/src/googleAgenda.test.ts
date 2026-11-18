import { describe, expect, it } from "vitest";
import { corpoDoEvento, idDeEventoValido, paraCompromisso, redirectUriValido } from "./googleAgenda";

describe("corpo do evento (horário de Brasília)", () => {
  it("sem término: 1 hora", () => {
    expect(corpoDoEvento({ titulo: "Dentista", data: "2026-11-20", inicio: "15:00" })).toEqual({
      summary: "Dentista",
      start: { dateTime: "2026-11-20T15:00:00", timeZone: "America/Sao_Paulo" },
      end: { dateTime: "2026-11-20T16:00:00", timeZone: "America/Sao_Paulo" },
    });
  });
  it("com término e local", () => {
    const c = corpoDoEvento({ titulo: "Reunião", data: "2026-11-20", inicio: "09:30", fim: "11:00", local: "Escritório" });
    expect(c.location).toBe("Escritório");
    expect(c.end).toEqual({ dateTime: "2026-11-20T11:00:00", timeZone: "America/Sao_Paulo" });
  });
  it("término depois da meia-noite vai para o dia seguinte", () => {
    const c = corpoDoEvento({ titulo: "Show", data: "2026-11-20", inicio: "22:00", fim: "01:00" });
    expect(c.end).toEqual({ dateTime: "2026-11-21T01:00:00", timeZone: "America/Sao_Paulo" });
  });
  it("dia inteiro: termina no dia seguinte (regra do Google)", () => {
    expect(corpoDoEvento({ titulo: "Férias", data: "2026-12-31", diaInteiro: true })).toEqual({
      summary: "Férias",
      start: { date: "2026-12-31" },
      end: { date: "2027-01-01" },
    });
  });
});

describe("evento do Google → compromisso", () => {
  it("com horário", () => {
    const c = paraCompromisso({ id: "abc12345", summary: "Almoço", start: { dateTime: "2026-11-20T12:00:00-03:00" }, end: { dateTime: "2026-11-20T13:00:00-03:00" } })!;
    expect(c.id).toBe("abc12345");
    expect(c.dia).toBe("2026-11-20");
    expect(c.diaInteiro).toBe(false);
    expect(c.inicio.toISOString()).toBe("2026-11-20T15:00:00.000Z");
  });
  it("dia inteiro e sem título", () => {
    const c = paraCompromisso({ id: "abc12345", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } })!;
    expect(c.diaInteiro).toBe(true);
    expect(c.dia).toBe("2026-11-20");
    expect(c.titulo).toBe("(sem título)");
  });
  it("cancelado some", () => {
    expect(paraCompromisso({ id: "abc12345", status: "cancelled", start: { date: "2026-11-20" } })).toBeNull();
  });
});

describe("validações", () => {
  it("id de evento", () => {
    expect(idDeEventoValido("abc123_20261120T150000Z")).toBe(true);
    expect(idDeEventoValido("../../calendars")).toBe(false);
    expect(idDeEventoValido("a b c d e")).toBe(false);
    expect(idDeEventoValido(42)).toBe(false);
  });
  it("endereço de retorno do login", () => {
    expect(redirectUriValido("https://sc.hayahtraining.com/auth/google/retorno")).toBe(true);
    expect(redirectUriValido("https://malicioso.com/auth/google/retorno?x=1")).toBe(false);
    expect(redirectUriValido("http://sc.hayahtraining.com/auth/google/retorno")).toBe(false);
  });
});
