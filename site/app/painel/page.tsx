import type { Metadata } from "next";
import Link from "next/link";
import { FormularioAcao } from "@/components/FormularioAcao";
import { Abrir, Aviso, Campo, Secao } from "@/components/ui";
import { exigirAprovado } from "@/lib/auth/sessao";
import { situacaoDaConta } from "@/lib/contas";
import { formatarDataHora, hojeISO, inicioDoMes, somarDias } from "@/lib/datas";
import { formatarReais, valorParaCampo } from "@/lib/dinheiro";
import { classeLargura, situacaoDoOrcamento } from "@/lib/orcamento";
import { formatarCelular } from "@/lib/validacao";
import { definirLimite } from "./acoes";

export const metadata: Metadata = { title: "Painel" };

const CORES = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  vermelho: "bg-red-500",
} as const;

const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export default async function Painel({ searchParams }: PageProps<"/painel">) {
  const { supabase, perfil } = await exigirAprovado();
  const { aviso } = await searchParams;
  const hoje = hojeISO();
  const inicio = inicioDoMes(hoje);

  const [
    { data: categorias },
    { data: despesas },
    { data: orcamentos },
    { data: lembretes },
    { data: tarefas, count: totalTarefas },
    { data: contasProximas },
    contagemDocs,
  ] = await Promise.all([
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase.from("despesas").select("valor, categoria_id").gte("data", inicio).lte("data", hoje).limit(10000),
    supabase.from("orcamentos").select("categoria_id, limite_mensal"),
    supabase.from("lembretes").select("id, texto, quando").in("status", ["pendente", "enviando"]).order("quando").limit(5),
    supabase.from("tarefas").select("id, titulo", { count: "exact" }).eq("concluida", false).order("criado_em").limit(5),
    supabase
      .from("contas")
      .select("id, descricao, valor, vencimento, status")
      .eq("status", "a_pagar")
      .lte("vencimento", somarDias(hoje, 7))
      .order("vencimento")
      .limit(8),
    contarDocumentos(),
  ]);

  /** Contagens direto no banco (sem trazer as linhas). */
  async function contarDocumentos() {
    const contar = async (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await filtro(base())).count ?? 0;
    function base() {
      return supabase.from("documentos").select("id", { count: "exact", head: true });
    }
    const [total, site, whatsapp, lidos, lendo, erro] = await Promise.all([
      contar((q) => q),
      contar((q) => q.eq("origem", "site")),
      contar((q) => q.eq("origem", "whatsapp")),
      contar((q) => q.eq("status", "pronto")),
      contar((q) => q.in("status", ["pendente", "processando"])),
      contar((q) => q.eq("status", "erro")),
    ]);
    return { total, site, whatsapp, lidos, lendo, erro };
  }

  const gastos = new Map<string, number>();
  let totalMes = 0;
  for (const d of despesas ?? []) {
    const v = Number(d.valor);
    totalMes += v;
    gastos.set(d.categoria_id, Math.round(((gastos.get(d.categoria_id) ?? 0) + v) * 100) / 100);
  }
  totalMes = Math.round(totalMes * 100) / 100;
  const limites = new Map((orcamentos ?? []).map((o) => [o.categoria_id, Number(o.limite_mensal)]));

  // Categorias com gasto ou limite primeiro (maior gasto antes); as outras depois.
  const linhas = (categorias ?? [])
    .map((c) => ({
      ...c,
      gasto: gastos.get(c.id) ?? 0,
      limite: limites.get(c.id) ?? null,
    }))
    .sort((a, b) => b.gasto - a.gasto || Number(b.limite !== null) - Number(a.limite !== null) || a.nome.localeCompare(b.nome));
  const mes = NOMES_MES[Number(hoje.slice(5, 7)) - 1];

  return (
    <div className="space-y-6">
      {aviso === "senha-alterada" ? <Aviso tipo="sucesso">Senha alterada com sucesso.</Aviso> : null}

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Olá, {perfil.nome.split(" ")[0]}!</h1>
        <p className="mt-1 text-zinc-600">Seu assistente se chama {perfil.nome_assistente}.</p>
      </div>

      {!perfil.celular_verificado ? (
        <Aviso tipo="info">
          Seu celular {formatarCelular(perfil.celular)} ainda não foi verificado.{" "}
          <Link href="/painel/conta" className="font-semibold underline">
            Verificar agora
          </Link>{" "}
          para o assistente atender você no WhatsApp.
        </Aviso>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Secao titulo={`Gastos de ${mes}`} descricao={`Do dia 1 até hoje: ${formatarReais(totalMes)}`}>
            <ul className="space-y-4">
              {linhas.map((c) => {
                const situacao = c.limite ? situacaoDoOrcamento(c.gasto, c.limite, formatarReais) : null;
                return (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={c.gasto > 0 || c.limite ? "font-medium text-zinc-900" : "text-zinc-500"}>{c.nome}</span>
                      <span className="text-sm text-zinc-700">
                        <strong>{formatarReais(c.gasto)}</strong>
                        {c.limite ? <span className="text-zinc-500"> de {formatarReais(c.limite)}</span> : null}
                      </span>
                    </div>
                    {situacao ? (
                      <>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${CORES[situacao.cor]} ${classeLargura(situacao.percentual)}`} />
                        </div>
                        <p
                          className={`mt-0.5 text-xs ${situacao.cor === "vermelho" ? "text-red-700" : situacao.cor === "ambar" ? "text-amber-700" : "text-zinc-500"}`}
                        >
                          {Math.round(situacao.percentual)}% · {situacao.texto}
                        </p>
                      </>
                    ) : null}
                    <div className="mt-1">
                      <Abrir rotulo={c.limite ? "Mudar limite" : "Definir limite mensal"}>
                        <FormularioAcao acao={definirLimite} rotulo="Salvar limite" variante="secundario">
                          <input type="hidden" name="categoria" value={c.id} />
                          <Campo
                            rotulo={`Limite por mês para ${c.nome} (R$)`}
                            name="limite"
                            inputMode="decimal"
                            placeholder="Ex.: 500"
                            dica="Deixe vazio e salve para remover o limite."
                            defaultValue={c.limite ? valorParaCampo(c.limite) : ""}
                          />
                        </FormularioAcao>
                      </Abrir>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-zinc-500">
              A barra fica âmbar a partir de 80% do limite e vermelha a partir de 100%. O limite só avisa, nunca bloqueia.
            </p>
          </Secao>
        </div>

        <div className="space-y-6">
          <Secao titulo="Contas a pagar">
            <ul className="space-y-2">
              {(contasProximas ?? []).length === 0 ? <li className="text-sm text-zinc-500">Nada vencendo nos próximos 7 dias.</li> : null}
              {(contasProximas ?? []).map((c) => {
                const s = situacaoDaConta({ ...c, valor: c.valor == null ? null : Number(c.valor) }, hoje);
                return (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-zinc-900">
                      {c.descricao}{" "}
                      <span
                        className={s.situacao === "atrasada" ? "text-red-700" : s.situacao === "hoje" ? "text-amber-700" : "text-zinc-500"}
                      >
                        · {s.texto}
                      </span>
                    </span>
                    <span className="shrink-0 text-zinc-700">{c.valor == null ? "a definir" : formatarReais(Number(c.valor))}</span>
                  </li>
                );
              })}
            </ul>
            <Link href="/painel/contas" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
              Ver todas →
            </Link>
          </Secao>

          <Secao titulo={`Documentos (${contagemDocs.total})`}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-zinc-600">Pelo site</dt>
              <dd className="text-right font-medium text-zinc-900">{contagemDocs.site}</dd>
              <dt className="text-zinc-600">Pelo WhatsApp</dt>
              <dd className="text-right font-medium text-zinc-900">{contagemDocs.whatsapp}</dd>
              <dt className="text-zinc-600">Lidos</dt>
              <dd className="text-right font-medium text-emerald-700">{contagemDocs.lidos}</dd>
              {contagemDocs.lendo ? (
                <>
                  <dt className="text-zinc-600">Na fila para ler</dt>
                  <dd className="text-right font-medium text-amber-700">{contagemDocs.lendo}</dd>
                </>
              ) : null}
              {contagemDocs.erro ? (
                <>
                  <dt className="text-zinc-600">Não consegui ler</dt>
                  <dd className="text-right font-medium text-red-700">{contagemDocs.erro}</dd>
                </>
              ) : null}
            </dl>
            <Link href="/painel/cerebro" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
              Ver documentos →
            </Link>
          </Secao>

          <Secao titulo="Próximos lembretes">
            <ul className="space-y-2">
              {(lembretes ?? []).length === 0 ? <li className="text-sm text-zinc-500">Nenhum lembrete agendado.</li> : null}
              {(lembretes ?? []).map((l) => (
                <li key={l.id} className="text-sm">
                  <p className="text-zinc-900">{l.texto}</p>
                  <p className="text-zinc-500">{formatarDataHora(l.quando)}</p>
                </li>
              ))}
            </ul>
            <Link href="/painel/lembretes" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
              Ver todos →
            </Link>
          </Secao>

          <Secao titulo={`Tarefas pendentes (${totalTarefas ?? 0})`}>
            <ul className="space-y-2">
              {(tarefas ?? []).length === 0 ? <li className="text-sm text-zinc-500">Nada pendente.</li> : null}
              {(tarefas ?? []).map((t) => (
                <li key={t.id} className="text-sm text-zinc-900">
                  • {t.titulo}
                </li>
              ))}
            </ul>
            <Link href="/painel/tarefas" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
              Ver todas →
            </Link>
          </Secao>
        </div>
      </div>
    </div>
  );
}
