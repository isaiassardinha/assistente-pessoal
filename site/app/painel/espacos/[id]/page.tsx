import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Aviso, Campo, Secao } from "@/components/ui";
import { AtualizarSozinho } from "@/app/painel/cerebro/AtualizarSozinho";
import { tamanhoLegivel } from "@/lib/arquivos";
import { exigirAprovado } from "@/lib/auth/sessao";
import { formatarDataHora } from "@/lib/datas";
import { ehUuid } from "@/lib/despesas";
import { googleConfigurado, RESULTADOS_DRIVE, type ResultadoDrive } from "@/lib/google";
import { estadoDoRobo } from "@/lib/robo";
import { formatarCelular } from "@/lib/validacao";
import {
  adicionarMembro,
  apagarDocumento,
  apagarEspaco,
  apagarMinhaMensagem,
  definirPapel,
  desconectarDrive,
  desligarGrupo,
  gerarCodigo,
  relerDocumento,
  removerMembro,
  renomearEspaco,
} from "../acoes";
import { PerguntaEspaco } from "./PerguntaEspaco";

export const metadata: Metadata = { title: "Espaço" };

const SITUACAO: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "Na fila para ler", cor: "bg-amber-100 text-amber-900" },
  processando: { texto: "Lendo…", cor: "bg-amber-100 text-amber-900" },
  pronto: { texto: "Pronto", cor: "bg-emerald-100 text-emerald-800" },
  erro: { texto: "Não consegui ler (arquivo guardado)", cor: "bg-red-100 text-red-800" },
};

function Pilula({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>{children}</span>;
}

export default async function EspacoPagina({ params, searchParams }: PageProps<"/painel/espacos/[id]">) {
  const { id } = await params;
  const { drive: retornoDrive, arquivo: retornoArquivo } = await searchParams;
  if (!ehUuid(id)) notFound();
  const { supabase, usuarioId, perfil } = await exigirAprovado();

  const [{ data: espaco }, { data: membros }, { data: documentos }, { data: mensagens }, robo] = await Promise.all([
    supabase.from("espacos").select("id, nome, grupo_jid, grupo_nome, drive_conta, drive_situacao, criado_em").eq("id", id).maybeSingle(),
    supabase.rpc("membros_do_espaco", { p_espaco: id }),
    supabase
      .from("espaco_documentos")
      .select("id, enviado_por, enviado_por_nome, nome_arquivo, descricao, tamanho_bytes, armazenamento, status, resumo, erro, criado_em")
      .eq("espaco_id", id)
      .order("criado_em", { ascending: false })
      .limit(500),
    supabase
      .from("espaco_mensagens")
      .select("id, autor_id, autor_nome, do_robo, tipo, texto, criado_em")
      .eq("espaco_id", id)
      .order("criado_em", { ascending: false })
      .limit(100),
    estadoDoRobo(),
  ]);
  if (!espaco || !membros) notFound();

  const souAdmin = membros.some((m) => m.usuario_id === usuarioId && m.papel === "admin");
  const admins = membros.filter((m) => m.papel === "admin").length;
  const docs = documentos ?? [];
  const lendo = docs.some((d) => d.status === "pendente" || d.status === "processando");
  const resultadoDrive = typeof retornoDrive === "string" && retornoDrive in RESULTADOS_DRIVE ? RESULTADOS_DRIVE[retornoDrive as ResultadoDrive] : null;
  const numeroRobo = robo.numero ? formatarCelular(robo.numero) : null;
  const assistente = perfil.nome_assistente;
  const noCofre = docs.filter((d) => d.armazenamento === "supabase").reduce((t, d) => t + d.tamanho_bytes, 0);

  return (
    <div className="space-y-6">
      <AtualizarSozinho ativo={lendo} />
      <div>
        <Link href="/painel/espacos" className="text-sm text-emerald-700 hover:underline">
          ← Espaços
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{espaco.nome}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pilula cor={espaco.grupo_jid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>
            {espaco.grupo_jid ? `Grupo: ${espaco.grupo_nome || "ligado"}` : "Sem grupo ligado"}
          </Pilula>
          <Pilula cor={espaco.drive_conta ? (espaco.drive_situacao === "erro" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800") : "bg-zinc-100 text-zinc-700"}>
            {espaco.drive_conta ? (espaco.drive_situacao === "erro" ? "Google Drive com problema" : "Arquivos no Google Drive") : "Arquivos no cofre do site"}
          </Pilula>
          <Pilula cor="bg-zinc-100 text-zinc-700">{souAdmin ? "Você é administrador" : "Você é membro"}</Pilula>
        </div>
      </div>

      {retornoArquivo === "erro" ? <Aviso tipo="erro">Não consegui baixar esse arquivo agora. Ele pode ter sido apagado ou movido no Google Drive.</Aviso> : null}

      <Secao titulo="Pergunte à memória do grupo" descricao={`Ou no próprio grupo, marcando o assistente: "@${assistente} o que ficou combinado sobre…"`}>
        <PerguntaEspaco espacoId={espaco.id} />
      </Secao>

      <section id="grupo">
        <Secao titulo="Grupo do WhatsApp">
          {espaco.grupo_jid ? (
            <div className="space-y-3">
              <Aviso tipo="sucesso">
                Ligado ao grupo {espaco.grupo_nome ? <strong>&quot;{espaco.grupo_nome}&quot;</strong> : "do WhatsApp"}. O assistente guarda o que os
                membros mandam lá e responde quando é marcado com @ ou quando alguém responde a uma mensagem dele.
              </Aviso>
              <p className="text-sm text-zinc-600">
                Só o que os <strong>membros deste espaço</strong> mandam fica guardado. Quem está no grupo mas não é membro é ignorado.
              </p>
              {souAdmin ? (
                <form action={desligarGrupo}>
                  <input type="hidden" name="espaco" value={espaco.id} />
                  <BotaoEnviar variante="secundario" enviando="Desligando…">
                    Desligar do grupo
                  </BotaoEnviar>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-zinc-700">
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Adicione o número do assistente ao grupo{numeroRobo ? <> (<strong>{numeroRobo}</strong>)</> : null}.
                </li>
                <li>Um administrador do espaço gera o código abaixo (vale 30 minutos).</li>
                <li>
                  No grupo, o administrador manda o código marcando o assistente: <strong>@{assistente} CÓDIGO</strong>.
                </li>
              </ol>
              {souAdmin ? (
                <FormularioAcao acao={gerarCodigo} rotulo="Gerar código" enviando="Gerando…" variante="secundario">
                  <input type="hidden" name="espaco" value={espaco.id} />
                </FormularioAcao>
              ) : (
                <p className="text-zinc-500">Peça para um administrador gerar o código.</p>
              )}
            </div>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            Dica (LGPD): fixe no grupo a mensagem que o assistente manda ao ser ligado, para todos saberem que o que é enviado lá fica guardado.
          </p>
        </Secao>
      </section>

      <section id="drive">
        <Secao
          titulo="Onde ficam os arquivos"
          descricao="Com o Google Drive conectado, os originais vão para uma pasta criada pelo assistente no Drive de um administrador. O texto lido fica no site, para a busca. O assistente só enxerga os arquivos que ele mesmo criou no Drive."
        >
          <div className="space-y-3">
            {resultadoDrive ? <Aviso tipo={resultadoDrive.tipo}>{resultadoDrive.texto}</Aviso> : null}
            {espaco.drive_conta ? (
              <>
                <p className="text-sm text-zinc-700">
                  Conectado ao Google Drive de <strong>{espaco.drive_conta}</strong>, pasta &quot;Assistente - {espaco.nome}&quot;.
                </p>
                {espaco.drive_situacao === "erro" ? (
                  <Aviso tipo="erro">
                    O Google recusou o acesso ou o Drive está cheio. Enquanto isso, os arquivos novos vão para o cofre do site. {souAdmin ? "Conecte de novo." : ""}
                  </Aviso>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-zinc-700">
                Sem Drive conectado: os arquivos ficam no cofre do site ({tamanhoLegivel(noCofre)} usados por este espaço; o plano gratuito tem 1 GB no total).
              </p>
            )}
            {souAdmin ? (
              <div className="flex flex-wrap gap-2">
                {googleConfigurado() ? (
                  <a
                    href={`/auth/google/iniciar?espaco=${espaco.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    {espaco.drive_conta ? "Conectar de novo" : "Conectar Google Drive"}
                  </a>
                ) : (
                  <Aviso tipo="info">O login do Google ainda não foi configurado no servidor.</Aviso>
                )}
                {espaco.drive_conta ? (
                  <form action={desconectarDrive}>
                    <input type="hidden" name="espaco" value={espaco.id} />
                    <BotaoEnviar variante="secundario" enviando="Desconectando…">
                      Desconectar Drive
                    </BotaoEnviar>
                  </form>
                ) : null}
              </div>
            ) : null}
            {souAdmin && espaco.drive_conta ? (
              <p className="text-xs text-zinc-500">
                Ao desconectar, os arquivos que já estão no Drive continuam lá e a busca continua funcionando, mas o assistente não consegue mais
                mandar os originais.
              </p>
            ) : null}
          </div>
        </Secao>
      </section>

      <Secao titulo={`Membros (${membros.length})`} descricao="Só contas aprovadas no site. Para o assistente reconhecer a pessoa no grupo, o celular dela precisa estar verificado.">
        <ul className="divide-y divide-zinc-200">
          {membros.map((m) => (
            <li key={m.usuario_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <span className="font-medium text-zinc-900">{m.nome}</span>
                {m.usuario_id === usuarioId ? <span className="text-zinc-500"> (você)</span> : null}
                <p className="text-xs text-zinc-500">
                  {m.papel === "admin" ? "Administrador" : "Membro"} · {m.whatsapp_ok ? "celular verificado" : "celular ainda não verificado"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {souAdmin && m.usuario_id !== usuarioId ? (
                  <>
                    <form action={definirPapel}>
                      <input type="hidden" name="espaco" value={espaco.id} />
                      <input type="hidden" name="usuario" value={m.usuario_id} />
                      <input type="hidden" name="papel" value={m.papel === "admin" ? "membro" : "admin"} />
                      <BotaoEnviar variante="secundario" enviando="Salvando…">
                        {m.papel === "admin" ? "Tirar de admin" : "Tornar admin"}
                      </BotaoEnviar>
                    </form>
                    <form action={removerMembro}>
                      <input type="hidden" name="espaco" value={espaco.id} />
                      <input type="hidden" name="usuario" value={m.usuario_id} />
                      <BotaoEnviar variante="secundario" enviando="Tirando…">
                        Tirar do espaço
                      </BotaoEnviar>
                    </form>
                  </>
                ) : null}
                {m.usuario_id === usuarioId ? (
                  <form action={removerMembro}>
                    <input type="hidden" name="espaco" value={espaco.id} />
                    <input type="hidden" name="usuario" value={m.usuario_id} />
                    <BotaoEnviar variante="secundario" enviando="Saindo…">
                      Sair do espaço
                    </BotaoEnviar>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {souAdmin && admins === 1 ? (
          <p className="mt-2 text-xs text-zinc-500">Se o único administrador sair, o membro mais antigo vira administrador.</p>
        ) : null}
        {souAdmin ? (
          <div className="mt-4 border-t border-zinc-200 pt-4">
            <FormularioAcao acao={adicionarMembro} rotulo="Adicionar ao espaço" enviando="Adicionando…">
              <input type="hidden" name="espaco" value={espaco.id} />
              <Campo rotulo="E-mail da pessoa (o mesmo do cadastro no site)" name="email" type="email" required maxLength={320} />
            </FormularioAcao>
          </div>
        ) : null}
      </Secao>

      <Secao
        titulo={`Documentos e fotos (${docs.length})`}
        descricao="Tudo o que os membros mandam no grupo. O assistente lê e deixa pesquisável; reage com ✅ no grupo quando termina."
      >
        <ul className="divide-y divide-zinc-200">
          {docs.length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhum documento ainda. Mande um PDF, Word ou foto no grupo.</li> : null}
          {docs.map((d) => {
            const s = SITUACAO[d.status] ?? SITUACAO.pendente;
            const podeApagar = souAdmin || d.enviado_por === usuarioId;
            return (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <a href={`/painel/espacos/${espaco.id}/arquivo/${d.id}`} className="break-all font-medium text-zinc-900 hover:underline" target="_blank" rel="noopener">
                    {d.nome_arquivo}
                  </a>
                  <Pilula cor={s.cor}>{s.texto}</Pilula>
                </div>
                <p className="text-xs text-zinc-500">
                  {formatarDataHora(d.criado_em)} · {tamanhoLegivel(d.tamanho_bytes)} · enviado por {d.enviado_por_nome || "alguém"} ·{" "}
                  {d.armazenamento === "drive" ? "no Google Drive" : "no cofre do site"}
                </p>
                {d.descricao ? <p className="mt-1 text-sm text-zinc-700">{d.descricao}</p> : null}
                {d.resumo ? <p className="mt-1 text-sm text-zinc-600">{d.resumo}</p> : null}
                {d.status === "erro" && d.erro ? <p className="mt-1 text-sm text-red-700">{d.erro}</p> : null}
                <div className="mt-1 flex flex-wrap gap-3">
                  {d.status === "erro" ? (
                    <form action={relerDocumento}>
                      <input type="hidden" name="espaco" value={espaco.id} />
                      <input type="hidden" name="documento" value={d.id} />
                      <button type="submit" className="text-sm font-medium text-emerald-700 hover:underline">
                        Tentar ler de novo
                      </button>
                    </form>
                  ) : null}
                  {podeApagar ? (
                    <Abrir rotulo="Apagar">
                      <form action={apagarDocumento} className="space-y-2">
                        <input type="hidden" name="espaco" value={espaco.id} />
                        <input type="hidden" name="documento" value={d.id} />
                        <p className="text-sm text-zinc-700">
                          Apaga o arquivo e o que foi lido dele{d.armazenamento === "drive" ? " (no Drive, vai para a lixeira por 30 dias)" : ""}.
                        </p>
                        <BotaoEnviar variante="perigo" enviando="Apagando…">
                          Apagar documento
                        </BotaoEnviar>
                      </form>
                    </Abrir>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao
        titulo="Mensagens guardadas"
        descricao="As 100 mais recentes. Mensagens curtas como &quot;ok&quot; ou &quot;bom dia&quot; ficam guardadas mas não entram na busca. Você pode apagar as suas."
      >
        <ul className="divide-y divide-zinc-200">
          {(mensagens ?? []).length === 0 ? <li className="py-3 text-sm text-zinc-500">Nenhuma mensagem guardada ainda.</li> : null}
          {(mensagens ?? []).map((m) => (
            <li key={m.id} className="py-2">
              <p className="text-xs text-zinc-500">
                {formatarDataHora(m.criado_em)} · {m.do_robo ? `${m.autor_nome} (assistente)` : m.autor_nome}
                {m.tipo === "audio" ? " · áudio transcrito" : ""}
              </p>
              <p className="whitespace-pre-line text-sm text-zinc-900">{m.texto}</p>
              {m.autor_id === usuarioId ? (
                <form action={apagarMinhaMensagem}>
                  <input type="hidden" name="espaco" value={espaco.id} />
                  <input type="hidden" name="mensagem" value={m.id} />
                  <button type="submit" className="text-xs font-medium text-red-700 hover:underline">
                    Apagar esta mensagem guardada
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Secao>

      {souAdmin ? (
        <Secao titulo="Administração">
          <div className="space-y-6">
            <FormularioAcao acao={renomearEspaco} rotulo="Salvar nome" variante="secundario">
              <input type="hidden" name="espaco" value={espaco.id} />
              <Campo rotulo="Nome do espaço" name="nome" defaultValue={espaco.nome} maxLength={60} required />
            </FormularioAcao>
            <div className="border-t border-zinc-200 pt-4">
              <Abrir rotulo="Apagar o espaço">
                <FormularioAcao acao={apagarEspaco} rotulo="Apagar espaço para sempre" variante="perigo" enviando="Apagando…">
                  <input type="hidden" name="espaco" value={espaco.id} />
                  <p className="text-sm text-zinc-700">
                    Apaga a memória do grupo: mensagens guardadas, documentos do cofre e o que foi lido. Os arquivos que estão no Google Drive
                    continuam lá. Não dá para desfazer.
                  </p>
                  <Campo rotulo="Digite APAGAR para confirmar" name="confirmacao" required autoComplete="off" />
                </FormularioAcao>
              </Abrir>
            </div>
          </div>
        </Secao>
      ) : null}
    </div>
  );
}
