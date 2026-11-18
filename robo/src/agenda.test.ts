import { describe, expect, it } from "vitest";
import { compromissosDoIcs, descreverCompromisso, linkIcsValido } from "./agenda";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Teste//PT
BEGIN:VEVENT
UID:reuniao-1
DTSTART:20261119T130000Z
DTEND:20261119T140000Z
SUMMARY:Reunião com fornecedor
LOCATION:Escritório
END:VEVENT
BEGIN:VEVENT
UID:academia
DTSTART;TZID=America/Sao_Paulo:20261116T070000
DTEND;TZID=America/Sao_Paulo:20261116T080000
RRULE:FREQ=DAILY;COUNT=10
EXDATE;TZID=America/Sao_Paulo:20261120T070000
SUMMARY:Academia
END:VEVENT
BEGIN:VEVENT
UID:academia
RECURRENCE-ID;TZID=America/Sao_Paulo:20261121T070000
DTSTART;TZID=America/Sao_Paulo:20261121T090000
DTEND;TZID=America/Sao_Paulo:20261121T100000
SUMMARY:Academia (mais tarde)
END:VEVENT
BEGIN:VEVENT
UID:aniversario
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261121
SUMMARY:Aniversário da Ana
END:VEVENT
BEGIN:VEVENT
UID:cancelado
DTSTART:20261119T150000Z
DTEND:20261119T160000Z
STATUS:CANCELLED
SUMMARY:Cancelado
END:VEVENT
END:VCALENDAR`;

describe("agenda (iCal)", () => {
  const de = new Date("2026-11-19T03:00:00Z"); // 19/11 00:00 em Brasília
  const ate = new Date("2026-11-22T03:00:00Z"); // 22/11 00:00 em Brasília
  const lista = compromissosDoIcs(ICS, de, ate);

  it("traz compromissos simples com horário de Brasília", () => {
    const r = lista.find((c) => c.titulo === "Reunião com fornecedor")!;
    expect(r.dia).toBe("2026-11-19");
    expect(descreverCompromisso(r)).toBe("10:00–11:00 Reunião com fornecedor (Escritório)");
  });

  it("expande repetições, pula a data excluída e aplica a alteração de um dia", () => {
    const academia = lista.filter((c) => c.titulo.startsWith("Academia"));
    expect(academia.map((c) => c.dia)).toEqual(["2026-11-19", "2026-11-21"]);
    expect(academia[1].titulo).toBe("Academia (mais tarde)");
    expect(descreverCompromisso(academia[1])).toContain("09:00–10:00");
  });

  it("dia inteiro e cancelados", () => {
    const aniv = lista.find((c) => c.titulo === "Aniversário da Ana")!;
    expect(aniv.diaInteiro).toBe(true);
    expect(aniv.dia).toBe("2026-11-20");
    expect(descreverCompromisso(aniv)).toBe("dia todo Aniversário da Ana");
    expect(lista.some((c) => c.titulo === "Cancelado")).toBe(false);
  });

  it("chaves diferentes para cada ocorrência", () => {
    expect(new Set(lista.map((c) => c.chave)).size).toBe(lista.length);
  });

  it("aceita só link https de agenda", () => {
    expect(linkIcsValido("https://calendar.google.com/calendar/ical/abc%40gmail.com/private-123/basic.ics")).toBe(true);
    expect(linkIcsValido("http://calendar.google.com/x/basic.ics")).toBe(false);
    expect(linkIcsValido("https://exemplo.com/pagina")).toBe(false);
    expect(linkIcsValido("não é link")).toBe(false);
  });
});
