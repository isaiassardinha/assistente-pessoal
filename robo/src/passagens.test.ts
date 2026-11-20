import { describe, expect, it } from "vitest";
import {
  buscasDasVigiasHoje,
  conferirErro,
  CotaEsgotada,
  datasLegiveis,
  decidirAviso,
  descreverVoo,
  ErroNaBusca,
  lerCalendario,
  lerVoos,
  linkGoogleFlights,
  montarAvisoPassagem,
  parametrosCalendario,
  parametrosVoos,
  PassagensNaoConfigurado,
} from "./passagens";
import { mesFoiDito } from "./regras";
import { duracaoFoiDita } from "./ferramentas";

// Resposta no formato do SerpApi (Google Flights), resumida
const RESPOSTA = {
  search_metadata: { google_flights_url: "https://www.google.com/travel/flights?hl=pt&tfs=abc" },
  best_flights: [
    {
      flights: [
        { departure_airport: { id: "GRU", time: "2027-03-10 22:35" }, arrival_airport: { id: "PTY", time: "2027-03-11 04:10" }, airline: "Copa" },
        { departure_airport: { id: "PTY", time: "2027-03-11 06:00" }, arrival_airport: { id: "MIA", time: "2027-03-11 10:05" }, airline: "Copa" },
      ],
      layovers: [{ id: "PTY", duration: 110 }],
      total_duration: 750,
      price: 3120,
    },
  ],
  other_flights: [
    {
      flights: [{ departure_airport: { id: "GRU", time: "2027-03-10 23:50" }, arrival_airport: { id: "MIA", time: "2027-03-11 07:20" }, airline: "LATAM" }],
      total_duration: 510,
      price: 2890,
    },
    { flights: [], price: 100 }, // inválida: sem trechos
    { flights: [{ airline: "X" }], price: "barato" }, // inválida: preço não numérico
  ],
  price_insights: { lowest_price: 2890, price_level: "low", typical_price_range: [3100, 4200] },
};
const PEDIDO = { origem: "GRU,CGH", destino: "MIA", ida: "2027-03-10", volta: "2027-03-20" };

describe("pedido ao SerpApi", () => {
  it("ida e volta, em reais, mais barato primeiro", () => {
    const p = parametrosVoos({ ...PEDIDO, adultos: 2, soDireto: true });
    expect(p).toMatchObject({
      engine: "google_flights",
      departure_id: "GRU,CGH",
      arrival_id: "MIA",
      outbound_date: "2027-03-10",
      return_date: "2027-03-20",
      type: "1",
      currency: "BRL",
      adults: "2",
      stops: "1",
      sort_by: "2",
    });
  });
  it("só ida não manda volta", () => {
    const p = parametrosVoos({ origem: "GRU", destino: "LIS", ida: "2027-04-01" });
    expect(p.type).toBe("2");
    expect(p.return_date).toBeUndefined();
    expect(p.adults).toBe("1");
    expect(p.stops).toBe("0");
  });
  it("calendário usa a janela e a duração", () => {
    expect(parametrosCalendario({ origem: "GRU", destino: "LIS", de: "2027-04-01", ate: "2027-04-30", diasViagem: 10 })).toMatchObject({
      engine: "google_flights_calendar",
      date_range_start: "2027-04-01",
      date_range_end: "2027-04-30",
      round_trip_days: "10",
      type: "1",
    });
    expect(parametrosCalendario({ origem: "GRU", destino: "LIS", de: "2027-04-01", ate: "2027-04-30" }).type).toBe("2");
  });
  it("link próprio para o Google Flights quando não vier um", () => {
    expect(linkGoogleFlights(PEDIDO)).toContain(encodeURIComponent("Flights from GRU to MIA on 2027-03-10 through 2027-03-20"));
    expect(linkGoogleFlights({ origem: "GRU", destino: "LIS", ida: "2027-04-01" })).toContain("one%20way");
  });
});

describe("leitura da resposta", () => {
  const r = lerVoos(RESPOSTA, PEDIDO);
  it("junta melhores e outros, ignora inválidos e ordena pelo preço", () => {
    expect(r.voos.map((v) => v.preco)).toEqual([2890, 3120]);
  });
  it("companhias, paradas, escalas e duração", () => {
    expect(r.voos[1]).toMatchObject({ companhias: ["Copa"], paradas: 1, escalas: ["PTY"], duracaoMin: 750, partida: "2027-03-10 22:35", chegada: "2027-03-11 10:05" });
    expect(descreverVoo(r.voos[0])).toBe("R$ 2.890,00, LATAM, direto, 8h30");
    expect(descreverVoo(r.voos[1])).toBe("R$ 3.120,00, Copa, 1 parada (PTY), 12h30");
  });
  it("avaliação do Google e link", () => {
    expect(r.nivel).toBe("baixo");
    expect(r.faixaTipica).toEqual([3100, 4200]);
    expect(r.link).toBe("https://www.google.com/travel/flights?hl=pt&tfs=abc");
  });
  it("resposta sem nada não quebra", () => {
    expect(lerVoos({}, PEDIDO)).toMatchObject({ voos: [], nivel: null, faixaTipica: null });
    expect(lerVoos({}, PEDIDO).link).toContain("google.com/travel/flights");
  });
  it("calendário: datas do mais barato para o mais caro", () => {
    const d = lerCalendario({
      prices: [
        { outbound_date: "2027-04-03", return_date: "2027-04-13", price: 4100 },
        { outbound_date: "2027-04-01", return_date: "2027-04-11", price: 3900 },
        { outbound_date: "2027-04-02", price: null },
      ],
    });
    expect(d).toEqual([
      { ida: "2027-04-01", volta: "2027-04-11", preco: 3900 },
      { ida: "2027-04-03", volta: "2027-04-13", preco: 4100 },
    ]);
  });
});

describe("erros do SerpApi", () => {
  it("sem resultado não é erro", () => {
    expect(() => conferirErro({ error: "Google Flights hasn't returned any results for this query." })).not.toThrow();
  });
  it("cota esgotada", () => {
    expect(() => conferirErro({ error: "Your account has run out of searches." }, 429)).toThrow(CotaEsgotada);
  });
  it("chave inválida", () => {
    expect(() => conferirErro({ error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }, 401)).toThrow(
      PassagensNaoConfigurado,
    );
  });
  it("outros erros", () => {
    expect(() => conferirErro({}, 503)).toThrow(ErroNaBusca);
    expect(() => conferirErro({ error: "departure_id is invalid" }, 400)).toThrow(ErroNaBusca);
  });
});

describe("quando avisar", () => {
  const base = { preco_alvo: 3000, abaixo_do_alvo: false, ultimo_aviso_preco: null };
  it("acima do alvo: não avisa", () => {
    expect(decidirAviso(base, 3200)).toEqual({ avisar: false, abaixo: false });
  });
  it("entrou abaixo do alvo (ou igual): avisa", () => {
    expect(decidirAviso(base, 2990)).toEqual({ avisar: true, abaixo: true });
    expect(decidirAviso(base, 3000)).toEqual({ avisar: true, abaixo: true });
  });
  it("continua abaixo: só avisa de novo se cair 5% ou mais", () => {
    const ja = { ...base, abaixo_do_alvo: true, ultimo_aviso_preco: 2900 };
    expect(decidirAviso(ja, 2850).avisar).toBe(false);
    expect(decidirAviso(ja, 2755).avisar).toBe(true);
  });
  it("voltou acima e caiu de novo: avisa de novo", () => {
    const ja = { ...base, abaixo_do_alvo: true, ultimo_aviso_preco: 2900 };
    const subiu = decidirAviso(ja, 3300);
    expect(subiu).toEqual({ avisar: false, abaixo: false });
    expect(decidirAviso({ ...ja, abaixo_do_alvo: subiu.abaixo }, 2950).avisar).toBe(true);
  });
  it("sem voo na busca: não muda nada", () => {
    expect(decidirAviso({ ...base, abaixo_do_alvo: true, ultimo_aviso_preco: 2900 }, null)).toEqual({ avisar: false, abaixo: true });
  });
});

describe("mensagem de aviso", () => {
  it("traz rota, preço, alvo, link e o lembrete de que o preço muda", () => {
    const m = montarAvisoPassagem({
      rota: "São Paulo → Miami",
      datas: datasLegiveis({ ida: "2027-03-10", volta: "2027-03-20" }),
      adultos: 2,
      preco: 2890,
      alvo: 3000,
      quedaExtra: false,
      detalhe: "LATAM, direto",
      menorJaVisto: 2700,
      nivel: "baixo",
      link: "https://x.test/voo",
    });
    expect(m).toContain("Passagem abaixo do alvo: São Paulo → Miami");
    expect(m).toContain("10/03 a 20/03 · 2 adultos");
    expect(m).toContain("R$ 2.890,00");
    expect(m).toContain("seu alvo: R$ 3.000,00");
    expect(m).toContain("R$ 2.700,00");
    expect(m).toContain("https://x.test/voo");
    expect(m).toContain("pode mudar");
  });
  it("datas flexíveis", () => {
    expect(datasLegiveis({ ida: "2027-04-01", ida_ate: "2027-04-30", dias_viagem: 10 })).toBe("saída entre 01/04 e 30/04, 10 dias de viagem");
    expect(datasLegiveis({ ida: "2027-04-01", ida_ate: "2027-04-30", so_ida: true })).toBe("saída entre 01/04 e 30/04, só ida");
    expect(datasLegiveis({ ida: "2027-04-01" })).toBe("01/04, só ida");
  });
});

describe("cota do mês dividida pelos dias", () => {
  it("reserva parte para as buscas na hora e divide o resto", () => {
    // 250 por mês, 200 restantes, reserva 50 → 150 para 11 dias (20 a 30/11) → 13 por dia
    expect(buscasDasVigiasHoje({ restantes: 200, porMes: 250, feitasHoje: 0, hoje: "2026-11-20" })).toBe(13);
  });
  it("desconta o que já foi feito hoje (não libera de novo a cada rodada)", () => {
    expect(buscasDasVigiasHoje({ restantes: 190, porMes: 250, feitasHoje: 10, hoje: "2026-11-20" })).toBe(3);
    expect(buscasDasVigiasHoje({ restantes: 187, porMes: 250, feitasHoje: 13, hoje: "2026-11-20" })).toBe(0);
  });
  it("cota apertada: só a reserva fica, vigias param", () => {
    expect(buscasDasVigiasHoje({ restantes: 40, porMes: 250, feitasHoje: 0, hoje: "2026-11-20" })).toBe(0);
    expect(buscasDasVigiasHoje({ restantes: 0, porMes: 0, feitasHoje: 0, hoje: "2026-11-30" })).toBe(0);
  });
  it("último dia do mês pode usar o que sobrou", () => {
    expect(buscasDasVigiasHoje({ restantes: 80, porMes: 250, feitasHoje: 0, hoje: "2026-11-30" })).toBe(30);
  });
});

describe("datas e duração ditas", () => {
  const hoje = "2026-11-20";
  it("mês dito (janela flexível)", () => {
    expect(mesFoiDito("2027-03-01", ["qualquer data em março"], hoje)).toBe(true);
    expect(mesFoiDito("2027-03-31", ["em mar"], hoje)).toBe(true);
    expect(mesFoiDito("2027-03-15", ["entre 10/03 e 20/03"], hoje)).toBe(true);
    expect(mesFoiDito("2026-12-05", ["mês que vem"], hoje)).toBe(true);
    expect(mesFoiDito("2027-04-01", ["em março"], hoje)).toBe(false);
  });
  it("duração dita", () => {
    expect(duracaoFoiDita(10, ["uns 10 dias"])).toBe(true);
    expect(duracaoFoiDita(7, ["uma semana"])).toBe(true);
    expect(duracaoFoiDita(14, ["duas semanas"])).toBe(true);
    expect(duracaoFoiDita(10, ["uma semana"])).toBe(false);
  });
});
