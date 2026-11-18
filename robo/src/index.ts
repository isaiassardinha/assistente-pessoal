// Robô do WhatsApp: liga a API interna, a conexão com o WhatsApp e as rotinas.

import { mkdirSync } from "node:fs";
import { config, configuracoesFaltando, versao } from "./config";
import { receberMensagem } from "./conversa";
import { iniciarAutoteste } from "./autoteste";
import { iniciarApiInterna } from "./interno";
import { log } from "./log";
import { iniciarRotinas } from "./rotinas";
import { iniciarWhatsApp } from "./whatsapp";

log.info(`Robô iniciando (versão ${versao().slice(0, 7)})`);
mkdirSync(config.pastaDados, { recursive: true, mode: 0o700 });
iniciarApiInterna();

const faltando = configuracoesFaltando();
if (faltando.length > 0) {
  log.aviso(`Faltam configurações: ${faltando.join(", ")}. Rode "assistente-configurar" no servidor. O robô fica esperando.`);
} else {
  iniciarWhatsApp(receberMensagem).catch((e) => log.erro("não consegui iniciar o WhatsApp:", (e as Error).message));
  iniciarRotinas();
  iniciarAutoteste();
}

process.on("unhandledRejection", (e) => log.erro("erro não tratado:", (e as Error)?.message ?? e));
