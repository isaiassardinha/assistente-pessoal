import type { Metadata } from "next";
import Link from "next/link";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Aviso, Campo, Secao, Selecao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { cotacaoDolar, emReais, formatarDolar, resumirUso, type LinhaUso } from "@/lib/consumo";
import { limitesDoMes } from "@/lib/contas";
import { hojeISO } from "@/lib/datas";
import { formatarCelular } from "@/lib/validacao";
import { salvarDados } from "./acoes";
import { conectarAgenda, conectarGmail, desconectar, salvarAvisosPessoais } from "./conexoes";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { formatarDataHora } from "@/lib/datas";
import { googleConfigurado, RESULTADOS_GOOGLE, type ResultadoGoogle } from "@/lib/google";
import { Verificacao } from "./Verificacao";

export const metadata: Metadata = { title: "Minha conta" };

export default async function MinhaConta({ searchParams }: PageProps<"/painel/conta">) {
  const { supabase, perfil, usuarioId } = await exigirAprovado();
  const { google: retornoGoogle } = await searchParams;
  const resultadoGoogle = typeof retornoGoogle === "string" && retornoGoogle in RESULTADOS_GOOGLE ? RESULTADOS_GOOGLE[retornoGoogle as ResultadoGoogle] : null;
  const comGoogle = googleConfigurado();
  const hoje = hojeISO();
  const { inicio, fim } = limitesDoMes(hoje.slice(0, 7));
  const [{ data: uso }, cotacao, { data: conexoes }] = await Promise.all([
    supabase.rpc("resumo_uso_ia", { p_de: inicio, p_ate: fim }),
    cotacaoDolar(),
    supabase.from("conexoes").select("tipo, conta, situacao, erro, ultima_leitura"),
  ]);
  const gmail = (conexoes ?? []).find((c) => c.tipo === "gmail");
  const agenda = (conexoes ?? []).find((c) => c.tipo === "agenda_ics");
  const agendaGoogle = (conexoes ?? []).find((c) => c.tipo === "google_calendar");
  const opcoes = (de: number, ate: number, rotulo: (n: number) => string) =>
    Array.from({ length: ate - de + 1 }, (_, i) => ({ valor: String(de + i), rotulo: rotulo(de + i) }));
  const meuUso = resumirUso(((uso ?? []) as LinhaUso[]).filter((l) => l.usuario_id === usuarioId), hoje, hoje.slice(0, 7));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Minha conta</h1>

      <Secao
        titulo="Celular (WhatsApp)"
        descricao={
          <>
            Número cadastrado: <strong>{formatarCelular(perfil.celular) || "nenhum"}</strong>
          </>
        }
      >
        {perfil.celular_verificado ? (
          <Aviso tipo="sucesso">Verificado. O assistente conversa com você por este número.</Aviso>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Para o assistente atender este número, confirme que ele é seu: enviamos um código de 6 números no WhatsApp.
            </p>
            <Verificacao />
          </div>
        )}
      </Secao>

      <Secao
        titulo="Conexões"
        descricao="Ligue seu e-mail e sua agenda pessoais. O e-mail é só de leitura: o assistente nunca apaga, move ou responde nada. Na agenda conectada pelo Google, ele também marca, muda e cancela compromissos quando você pede no WhatsApp. As senhas ficam criptografadas."
      >
        <div className="space-y-6">
          <div id="gmail" className="space-y-3">
            <h3 className="font-semibold text-zinc-900">📧 E-mail (Gmail)</h3>
            {gmail ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Conectado: <strong>{gmail.conta}</strong>
                  {gmail.ultima_leitura ? ` · última leitura ${formatarDataHora(gmail.ultima_leitura)}` : " · fazendo a primeira leitura…"}
                </p>
                {gmail.situacao === "erro" ? <Aviso tipo="erro">{gmail.erro ?? "Deu um problema na conexão."} Conecte de novo abaixo.</Aviso> : null}
                <form action={desconectar}>
                  <input type="hidden" name="tipo" value="gmail" />
                  <BotaoEnviar variante="secundario" enviando="…">
                    Desconectar e-mail
                  </BotaoEnviar>
                </form>
              </div>
            ) : null}
            {!gmail || gmail.situacao === "erro" ? (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  <li>
                    Ligue a{" "}
                    <a className="text-emerald-700 underline" href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noopener">
                      verificação em duas etapas
                    </a>{" "}
                    da sua conta Google (se ainda não estiver ligada).
                  </li>
                  <li>
                    Abra{" "}
                    <a className="text-emerald-700 underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">
                      Senhas de app
                    </a>
                    , dê o nome <strong>Assistente</strong> e clique em <strong>Criar</strong>.
                  </li>
                  <li>Copie a senha de 16 letras que aparecer e cole aqui embaixo (com ou sem espaços).</li>
                </ol>
                <FormularioAcao acao={conectarGmail} rotulo="Conectar e-mail" enviando="Testando a conexão…">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo rotulo="Seu Gmail" name="email" type="email" required autoComplete="email" placeholder="voce@gmail.com" />
                    <Campo rotulo="Senha de app (16 letras)" name="senha" type="password" required autoComplete="off" placeholder="abcd efgh ijkl mnop" />
                  </div>
                  <p className="text-xs text-zinc-500">Não é a senha normal da sua conta. Para cortar o acesso a qualquer momento, apague a senha de app no Google.</p>
                </FormularioAcao>
              </>
            ) : null}
          </div>

          <div id="agenda" className="space-y-3 border-t border-zinc-200 pt-5">
            <h3 className="font-semibold text-zinc-900">📅 Agenda (Google Agenda)</h3>
            {resultadoGoogle ? <Aviso tipo={resultadoGoogle.tipo}>{resultadoGoogle.texto}</Aviso> : null}

            {agendaGoogle ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Conectada pelo Google{agendaGoogle.conta ? ` (${agendaGoogle.conta})` : ""}: ler, marcar, mudar e cancelar compromissos
                  {agendaGoogle.ultima_leitura ? ` · última leitura ${formatarDataHora(agendaGoogle.ultima_leitura)}` : ""}
                </p>
                {agendaGoogle.situacao === "erro" ? (
                  <Aviso tipo="erro">{agendaGoogle.erro ?? "Deu um problema na conexão."} Clique em Conectar com Google de novo.</Aviso>
                ) : null}
                <form action={desconectar}>
                  <input type="hidden" name="tipo" value="google_calendar" />
                  <BotaoEnviar variante="secundario" enviando="…">
                    Desconectar agenda do Google
                  </BotaoEnviar>
                </form>
                <p className="text-xs text-zinc-500">
                  Para cortar o acesso também do lado do Google, abra{" "}
                  <a className="underline" href="https://myaccount.google.com/connections" target="_blank" rel="noopener">
                    Conta do Google → Apps conectados
                  </a>
                  .
                </p>
              </div>
            ) : null}

            {comGoogle && (!agendaGoogle || agendaGoogle.situacao === "erro") ? (
              <div className="space-y-2">
                {!agendaGoogle ? (
                  <p className="text-sm text-zinc-700">
                    Recomendado: com o login do Google, além de ler a agenda, o assistente marca, muda e cancela compromissos pelo WhatsApp.
                  </p>
                ) : null}
                <a
                  href="/auth/google/iniciar"
                  className="inline-flex items-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Conectar com Google
                </a>
                <p className="text-xs text-zinc-500">
                  O Google vai mostrar &quot;O Google não verificou este app&quot;. É normal: o app é seu. Clique em <strong>Avançado</strong> →{" "}
                  <strong>Acessar</strong> e depois marque a permissão da agenda.
                </p>
              </div>
            ) : null}

            {agenda ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-700">
                  Link secreto (só leitura) conectado{agenda.ultima_leitura ? ` · última leitura ${formatarDataHora(agenda.ultima_leitura)}` : ""}
                  {agendaGoogle && agendaGoogle.situacao !== "erro" ? ". Não é mais necessário: o login do Google já faz tudo." : ""}
                </p>
                {agenda.situacao === "erro" && !agendaGoogle ? (
                  <Aviso tipo="erro">{agenda.erro ?? "Deu um problema na conexão."} Conecte de novo abaixo.</Aviso>
                ) : null}
                <form action={desconectar}>
                  <input type="hidden" name="tipo" value="agenda_ics" />
                  <BotaoEnviar variante="secundario" enviando="…">
                    Desconectar link secreto
                  </BotaoEnviar>
                </form>
              </div>
            ) : null}

            {!agendaGoogle && (!agenda || agenda.situacao === "erro") ? (
              <details className="space-y-2 text-sm" open={!comGoogle}>
                <summary className="cursor-pointer text-zinc-700">
                  {comGoogle ? "Outra forma (só leitura): pelo link secreto" : "Conectar pelo link secreto (só leitura)"}
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  <li>
                    Abra as{" "}
                    <a className="text-emerald-700 underline" href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">
                      configurações do Google Agenda
                    </a>{" "}
                    (no computador).
                  </li>
                  <li>À esquerda, em &quot;Configurações das minhas agendas&quot;, clique na sua agenda (o seu nome).</li>
                  <li>
                    Desça até <strong>Integrar agenda</strong> e copie o <strong>Endereço secreto no formato iCal</strong> (termina em .ics).
                  </li>
                  <li>Cole aqui embaixo. Não compartilhe esse endereço com ninguém.</li>
                </ol>
                <FormularioAcao acao={conectarAgenda} rotulo="Conectar agenda" enviando="Testando a agenda…">
                  <Campo rotulo="Endereço secreto no formato iCal" name="url" type="password" required autoComplete="off" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
                </FormularioAcao>
              </details>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-zinc-200 pt-5">
            <h3 className="font-semibold text-zinc-900">🔔 Avisos</h3>
            <FormularioAcao acao={salvarAvisosPessoais} rotulo="Salvar avisos" variante="secundario">
              <div className="grid gap-3 sm:grid-cols-2">
                <Selecao
                  rotulo="Resumo da manhã no WhatsApp"
                  name="resumo"
                  opcoes={[
                    { valor: "sim", rotulo: "Ligado" },
                    { valor: "nao", rotulo: "Desligado" },
                  ]}
                  defaultValue={perfil.resumo_manha ? "sim" : "nao"}
                />
                <Selecao rotulo="Horário do resumo" name="hora" opcoes={opcoes(5, 11, (n) => `${n}h`)} defaultValue={String(perfil.resumo_manha_hora)} />
                <Selecao
                  rotulo="Avisar antes de cada compromisso"
                  name="minutos"
                  opcoes={[0, 5, 10, 15, 30, 45, 60, 120].map((n) => ({ valor: String(n), rotulo: n === 0 ? "Não avisar" : n < 60 ? `${n} minutos antes` : `${n / 60} hora(s) antes` }))}
                  defaultValue={String(perfil.agenda_aviso_minutos)}
                />
                <Selecao
                  rotulo="Respostas do robô"
                  name="audio"
                  opcoes={[
                    { valor: "quando_audio", rotulo: "Em áudio quando eu mandar áudio" },
                    { valor: "sempre", rotulo: "Sempre em áudio" },
                    { valor: "nunca", rotulo: "Sempre por escrito" },
                  ]}
                  defaultValue={perfil.respostas_em_audio ?? "quando_audio"}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Selecao rotulo="Silêncio a partir de" name="silencio_inicio" opcoes={opcoes(18, 23, (n) => `${n}h`)} defaultValue={String(perfil.silencio_inicio)} />
                  <Selecao rotulo="até" name="silencio_fim" opcoes={opcoes(5, 10, (n) => `${n}h`)} defaultValue={String(perfil.silencio_fim)} />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                No silêncio, e-mails urgentes ficam guardados e chegam de manhã. Avisos de compromisso e lembretes que você mesmo marcou chegam sempre.
                Respostas em áudio: links, listas e valores também vão por escrito.
              </p>
            </FormularioAcao>
          </div>
        </div>
      </Secao>

      <Secao titulo="Consumo da IA neste mês" descricao="Quanto as suas conversas, áudios e documentos custaram de inteligência artificial (estimativa).">
        <p>
          <span className="text-2xl font-semibold text-zinc-900">{formatarDolar(meuUso.total.custo)}</span>
          {cotacao ? <span className="ml-2 text-sm text-zinc-500">{emReais(meuUso.total.custo, cotacao)}</span> : null}
        </p>
        <p className="text-sm text-zinc-600">
          {meuUso.total.chamadas} chamadas à IA · previsão para o mês: {formatarDolar(meuUso.previsao)}
          {perfil.is_admin ? (
            <>
              {" · "}
              <Link href="/admin/consumo" className="font-medium text-emerald-700 hover:underline">
                ver detalhes de todos
              </Link>
            </>
          ) : null}
        </p>
      </Secao>

      <Secao titulo="Meus dados">
        <FormularioAcao acao={salvarDados} rotulo="Salvar">
          <Campo rotulo="Nome" name="nome" maxLength={100} required defaultValue={perfil.nome} />
          <Campo
            rotulo="Celular (WhatsApp)"
            name="celular"
            type="tel"
            required
            defaultValue={formatarCelular(perfil.celular)}
            dica="Se trocar o número, vai precisar verificar de novo."
          />
          <Campo
            rotulo="Nome do assistente"
            name="nome_assistente"
            maxLength={30}
            required
            defaultValue={perfil.nome_assistente}
            dica="Como ele se apresenta. Só letras, sem espaço (ex.: Júnior)."
          />
        </FormularioAcao>
      </Secao>

      <Secao titulo="Senha">
        <Link href="/nova-senha" className="text-sm font-medium text-emerald-700 hover:underline">
          Trocar minha senha →
        </Link>
      </Secao>
    </div>
  );
}
