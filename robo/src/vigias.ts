// Vigias de passagem: consulta o preço, decide se avisa, grava o histórico.
// Usado pela rotina (de tempos em tempos) e pela ferramenta que cria a vigia
// (primeira consulta na hora).

import { config } from "./config";
import * as banco from "./banco";
import { log } from "./log";
import {
  buscasDasVigiasHoje,
  cota,
  CotaEsgotada,
  datasLegiveis,
  decidirAviso,
  ErroNaBusca,
  menorPrecoDaVigia,
  montarAvisoPassagem,
  passagensConfigurado,
  PassagensNaoConfigurado,
  rotaLegivel,
} from "./passagens";
import { hojeISO, instanteParaLocal } from "@/lib/datas";
import { numeroPermitido } from "./regras";

export type ResultadoVigia = {
  preco: number | null;
  texto: string;
  link: string;
  abaixo: boolean;
  avisou: boolean;
  erro?: string;
};

/**
 * Consulta uma vigia. Se o preço pedir aviso, chama `enviar` com a mensagem
 * e só marca como avisado se o envio deu certo. Cota esgotada sobe como erro.
 */
export async function checarVigia(
  usuarioId: string,
  vigia: banco.VigiaPassagem,
  enviar: (mensagem: string) => Promise<boolean>,
): Promise<ResultadoVigia> {
  let r: Awaited<ReturnType<typeof menorPrecoDaVigia>>;
  try {
    r = await menorPrecoDaVigia(vigia);
  } catch (e) {
    if (e instanceof ErroNaBusca) {
      await banco.registrarBuscaDaVigia(usuarioId, vigia, { preco: null, detalhe: null, erro: e.message, abaixo: vigia.abaixo_do_alvo, avisou: false });
      return { preco: null, texto: "", link: "", abaixo: vigia.abaixo_do_alvo, avisou: false, erro: e.message };
    }
    throw e;
  }
  const decisao = decidirAviso(vigia, r.preco);
  let avisou = false;
  if (decisao.avisar && r.preco != null) {
    const mensagem = montarAvisoPassagem({
      rota: rotaLegivel(vigia),
      datas: datasLegiveis(vigia),
      adultos: vigia.adultos,
      preco: r.preco,
      alvo: vigia.preco_alvo,
      quedaExtra: vigia.abaixo_do_alvo,
      detalhe: r.texto,
      menorJaVisto: vigia.menor_preco,
      nivel: r.nivel,
      link: r.link,
    });
    avisou = await enviar(mensagem);
  }
  await banco.registrarBuscaDaVigia(usuarioId, vigia, {
    preco: r.preco,
    detalhe: { ...r.detalhe, link: r.link },
    abaixo: decisao.abaixo && (avisou || !decisao.avisar),
    avisou,
  });
  return { preco: r.preco, texto: r.texto, link: r.link, abaixo: decisao.abaixo, avisou };
}

// ------------------------------------------------------------ rotina

let ocupado = false;
let pausadoAte = 0;
let encerradasEm = "";

/** Chamada a cada 5 minutos. Faz no máximo 3 buscas por vez. */
export async function cuidarDasVigias(enviarTexto: (celular: string, texto: string) => Promise<void>): Promise<void> {
  if (!passagensConfigurado() || ocupado || Date.now() < pausadoAte) return;
  const hora = Number(instanteParaLocal(new Date().toISOString()).slice(11, 13));
  if (hora < 7 || hora >= 22) return; // ninguém quer aviso de passagem de madrugada
  ocupado = true;
  try {
    const hoje = hojeISO();
    if (encerradasEm !== hoje) {
      const n = await banco.encerrarVigiasVencidas();
      encerradasEm = hoje;
      if (n > 0) log.info(`vigias de passagem encerradas (data passou): ${n}`);
    }
    const { restantes, porMes } = await cota();
    const feitasHoje = await banco.buscasDeVigiaHoje();
    const podeHoje = buscasDasVigiasHoje({ restantes, porMes, feitasHoje, hoje });
    const fila = await banco.vigiasParaChecar(Math.min(3, podeHoje));
    for (const item of fila) {
      const [vigia] = await banco.vigiasPorIds(item.usuario_id, [item.id]);
      if (!vigia) continue;
      const pode = numeroPermitido(item.celular, config.numerosPermitidos);
      await checarVigia(item.usuario_id, vigia, async (mensagem) => {
        if (!pode) return false;
        try {
          await enviarTexto(item.celular, mensagem);
          return true;
        } catch (e) {
          log.aviso("aviso de passagem não enviado:", (e as Error).message);
          return false;
        }
      });
    }
  } catch (e) {
    if (e instanceof CotaEsgotada) {
      pausadoAte = Date.now() + 6 * 3_600_000;
      log.aviso("passagens: a cota do SerpApi acabou; tento de novo em 6 horas");
    } else if (e instanceof PassagensNaoConfigurado) {
      pausadoAte = Date.now() + 3_600_000;
      log.aviso("passagens:", e.message);
    } else {
      log.erro("passagens:", e);
    }
  } finally {
    ocupado = false;
  }
}
