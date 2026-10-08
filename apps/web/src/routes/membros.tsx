// Seção Membros: pessoas dos times sincronizados do Azure DevOps (time_membro), com
// skills (skill_tag) e tags de função (funcao_tag) geridas pelo gestor no Supabase.
// Duas visões: todos os membros (uma pessoa = um card) e por squads (membros-squads.tsx).

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  FolderKanban,
  Grid3x3,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Tag,
  Trash2,
  UserRoundX,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import {

  useAdicionarSkill,
  useAssociarFuncaoTag,
  useCriarFuncaoTag,
  useDesassociarFuncaoTag,
  useExcluirFuncaoTag,
  useFuncaoTags,
  useMembros,
  useRemoverSkill,
  useRenomearFuncaoTag,
  useRevisarSkills,
  useSkillsCatalogo,
} from "@/lib/queries";
import { cn, hashTexto } from "@/lib/utils";
import { agruparMembros, type FuncaoTag, type Membro } from "@/lib/membros";
import type { SkillsPessoa } from "@/lib/skills";

export type { FuncaoTag, Membro };
import { VisaoSquads } from "./membros-squads";
import { OcupacaoMembro } from "@/components/ocupacao-membro";
import { OcupacaoEquipe } from "./equipe-ocupacao";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

interface Filtros {
  busca: string;
  projeto: string;
  skill: string;
  tag: string;
}

const SEM_FILTRO: Filtros = { busca: "", projeto: "", skill: "", tag: "" };

function filtrar(membros: Membro[], f: Filtros): Membro[] {
  const q = f.busca.trim().toLowerCase();
  return membros.filter((m) => {
    if (f.projeto && !m.projetos.some((p) => p.id === f.projeto)) return false;
    if (f.skill && !m.skills.includes(f.skill)) return false;
    if (f.tag && !m.tags.some((t) => String(t.id) === f.tag)) return false;
    if (!q) return true;
    const alvo = [m.nome, m.uniqueName, ...m.skills, ...m.tags.map((t) => t.nome)].join(" ").toLowerCase();
    return alvo.includes(q);
  });
}

function contar(valores: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

const TONS_TAG = ["teal", "blue", "amber", "green", "red", "violet"] as const;
const tonePorTexto = (texto: string) => TONS_TAG[hashTexto(texto) % TONS_TAG.length]!;

function mensagemErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("duplicate key")) return "Isso já está cadastrado.";
  return msg;
}

async function tentar(acao: () => Promise<unknown>, sucesso?: string) {
  try {
    await acao();
    if (sucesso) toast.success(sucesso);
    return true;
  } catch (e) {
    toast.error(mensagemErro(e));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function MembrosPage() {
  const { visao } = useSearch({ from: "/app/membros" });
  const porSquad = visao === "squads";
  const porSkills = visao === "skills";
  const ocupacao = !porSquad && !porSkills;

  const membrosQ = useMembros();
  const funcaoTags = useFuncaoTags();
  const skillsCatalogo = useSkillsCatalogo();

  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const [aberto, setAberto] = useState<string | null>(null);
  const [gerenciarTags, setGerenciarTags] = useState(false);

  const membros = useMemo(() => agruparMembros(membrosQ.data ?? []), [membrosQ.data]);
  const projetos = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of membros) for (const p of x.projetos) m.set(p.id, p.nome);
    return [...m].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [membros]);
  const filtrados = useMemo(() => filtrar(membros, filtros), [membros, filtros]);
  const rankingSkills = useMemo(() => contar(membros.flatMap((m) => m.skills)), [membros]);
  const usosTag = useMemo(() => new Map(contar(membros.flatMap((m) => m.tags.map((t) => String(t.id))))), [membros]);
  const sugestoesPendentes = useMemo(() => {
    const com = membros.filter((m) => m.skillsInfo.sugeridas.length > 0);
    return { pessoas: com.length, skills: com.reduce((n, m) => n + m.skillsInfo.sugeridas.length, 0) };
  }, [membros]);

  const selecionado = membros.find((m) => m.pessoaId === aberto) ?? null;
  const carregando = membrosQ.isLoading;
  const erro = membrosQ.error;
  const temFiltro = Object.values(filtros).some(Boolean);

  const setFiltro = (k: keyof Filtros) => (v: string) => setFiltros((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight dark:text-slate-100">Equipe</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
            {ocupacao
              ? "Quem está ocupado, em quais semanas e por causa de qual projeto."
              : porSquad
                ? "Os squads de cada projeto (times do Azure DevOps) e a carga de cada um."
                : "Skills e funções de cada pessoa. As sugeridas vêm sozinhas das tasks; você confirma."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlternarVisao aba={ocupacao ? "ocupacao" : porSquad ? "squads" : "skills"} />
          {porSkills && (
            <Button variant="outline" onClick={() => setGerenciarTags(true)}>
              <Settings2 className="size-4" /> Gerenciar tags
            </Button>
          )}
        </div>
      </header>

      {porSkills && (
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icone={Users} rotulo="Membros" valor={membros.length} />
        <Kpi
          icone={FolderKanban}
          rotulo="Projetos com equipe"
          valor={new Set(membros.flatMap((m) => m.projetos.map((p) => p.id))).size}
        />
        <Kpi icone={Sparkles} rotulo="Skills diferentes" valor={rankingSkills.length} />
        <Kpi
          icone={UserRoundX}
          rotulo="Sem skills nem tags"
          valor={membros.filter((m) => m.skills.length === 0 && m.tags.length === 0).length}
          alerta
        />
      </div>
      )}

      {porSkills && sugestoesPendentes.pessoas > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-brand-400/60 bg-brand-50/60 px-4 py-3 text-sm dark:border-brand-400/40 dark:bg-brand-900/20">
          <Sparkles className="size-4 shrink-0 text-brand-600 dark:text-brand-300" />
          <span className="text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{sugestoesPendentes.skills} skills</span>{" "}
            foram sugeridas automaticamente a partir das tasks de {sugestoesPendentes.pessoas}{" "}
            {sugestoesPendentes.pessoas === 1 ? "pessoa" : "pessoas"}. Abra o perfil para confirmar ou descartar.
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Novas tasks atualizam as sugestões sozinhas.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={filtros.busca}
            onChange={(e) => setFiltro("busca")(e.target.value)}
            placeholder="Buscar nome, e-mail, skill ou tag"
            className="pl-8"
          />
        </div>
        {!porSquad && (
          <Select value={filtros.projeto} onChange={setFiltro("projeto")} placeholder="Todos os projetos">
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        )}
        <Select value={filtros.skill} onChange={setFiltro("skill")} placeholder="Todas as skills">
          {rankingSkills.map(([s]) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={filtros.tag} onChange={setFiltro("tag")} placeholder="Todas as tags">
          {(funcaoTags.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </Select>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={() => setFiltros(SEM_FILTRO)}>
            <X className="size-3.5" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {filtrados.length} de {membros.length} {membros.length === 1 ? "membro" : "membros"}
        </span>
      </div>

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Erro ao carregar: {erro.message}
        </p>
      )}

      {carregando ? (
        <Esqueleto />
      ) : ocupacao ? (
        <OcupacaoEquipe membros={filtrados} onAbrir={setAberto} />
      ) : porSquad ? (
        <VisaoSquads projetos={projetos} membros={filtrados} temFiltro={temFiltro} onAbrir={setAberto} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
          <div>
            {filtrados.length === 0 ? (
              <Vazio temFiltro={temFiltro} />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filtrados.map((m) => (
                  <MembroCard key={m.pessoaId} membro={m} onClick={() => setAberto(m.pessoaId)} />
                ))}
              </div>
            )}
          </div>
          <Resumo
            skills={rankingSkills}
            tags={funcaoTags.data ?? []}
            usosTag={usosTag}
            filtros={filtros}
            onSkill={(s) => setFiltro("skill")(filtros.skill === s ? "" : s)}
            onTag={(t) => setFiltro("tag")(filtros.tag === t ? "" : t)}
          />
        </div>
      )}

      {selecionado && (
        <PainelMembro
          membro={selecionado}
          funcaoTags={funcaoTags.data ?? []}
          skillsCatalogo={skillsCatalogo.data ?? []}
          onClose={() => setAberto(null)}
        />
      )}
      {gerenciarTags && (
        <ModalGerenciarTags tags={funcaoTags.data ?? []} usos={usosTag} onClose={() => setGerenciarTags(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho, KPIs, filtros
// ---------------------------------------------------------------------------

function AlternarVisao({ aba }: { aba: "ocupacao" | "skills" | "squads" }) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const ativo = "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white";
  const inativo = "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800/60">
      <Link to="/membros" search={{}} className={cn(base, aba === "ocupacao" ? ativo : inativo)}>
        <Grid3x3 className="size-4" /> Ocupação
      </Link>
      <Link to="/membros" search={{ visao: "skills" }} className={cn(base, aba === "skills" ? ativo : inativo)}>
        <LayoutGrid className="size-4" /> Skills e tags
      </Link>
      <Link to="/membros" search={{ visao: "squads" }} className={cn(base, aba === "squads" ? ativo : inativo)}>
        <UsersRound className="size-4" /> Squads
      </Link>
    </div>
  );
}

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  alerta,
}: {
  icone: typeof Users;
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  const emAlerta = alerta && valor > 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          emAlerta
            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
            : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
        )}
      >
        <Icone className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl leading-tight font-semibold tabular-nums dark:text-slate-100">{valor}</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{rotulo}</div>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 cursor-pointer rounded-md border bg-white px-2.5 text-sm shadow-xs focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none dark:bg-slate-900",
        value
          ? "border-brand-500 font-medium text-brand-800 dark:border-brand-500 dark:text-brand-200"
          : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
      )}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

/** Chip de skill sugerida pela inferência das tasks (ainda não confirmada pelo gestor). */
export function ChipSugerida({ texto, evidencias }: { texto: string; evidencias?: number }) {
  return (
    <span
      title={`Sugerida automaticamente${evidencias ? `: aparece em ${evidencias} tasks` : ""} — confirme no perfil`}
      className="inline-flex items-center gap-1 rounded border border-dashed border-brand-400/70 px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap text-brand-800 dark:border-brand-400/50 dark:text-brand-200"
    >
      <Sparkles className="size-3 opacity-70" />
      {texto}
    </span>
  );
}

function Chips({
  skills,
  sugeridas,
  info,
  tags,
  vazio = "—",
}: {
  skills?: string[];
  sugeridas?: string[];
  info?: SkillsPessoa["info"];
  tags?: FuncaoTag[];
  vazio?: string;
}) {
  if (!skills?.length && !tags?.length) return <span className="text-xs text-slate-400 dark:text-slate-500">{vazio}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills?.map((s) =>
        sugeridas?.includes(s) ? (
          <ChipSugerida key={s} texto={s} evidencias={info?.[s]?.evidencias} />
        ) : (
          <Badge key={s} tone="slate" className="font-normal">
            {s}
          </Badge>
        ),
      )}
      {tags?.map((t) => (
        <Badge key={t.id} tone={tonePorTexto(t.nome)}>
          {t.nome}
        </Badge>
      ))}
    </div>
  );
}

function MembroCard({ membro, onClick }: { membro: Membro; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500/60"
    >
      <div className="flex items-center gap-3">
        <Avatar nome={membro.nome} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-900 dark:text-slate-100">{membro.nome}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{membro.uniqueName ?? "Sem e-mail"}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600 dark:group-hover:text-brand-300" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {membro.projetos.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 ring-inset dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700"
          >
            <FolderKanban className="size-3 opacity-60" /> {p.nome}
          </span>
        ))}
      </div>

      <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        <LinhaCard rotulo="Skills">
          <Chips
            skills={membro.skills.slice(0, 5)}
            sugeridas={membro.skillsInfo.sugeridas}
            info={membro.skillsInfo.info}
            vazio="Nenhuma skill"
          />
          {membro.skills.length > 5 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">+{membro.skills.length - 5}</span>
          )}
        </LinhaCard>
        <LinhaCard rotulo="Tags">
          <Chips tags={membro.tags} vazio="Nenhuma tag" />
        </LinhaCard>
      </div>
    </button>
  );
}

function LinhaCard({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-11 shrink-0 pt-0.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
        {rotulo}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function Resumo({
  skills,
  tags,
  usosTag,
  filtros,
  onSkill,
  onTag,
}: {
  skills: [string, number][];
  tags: FuncaoTag[];
  usosTag: Map<string, number>;
  filtros: Filtros;
  onSkill: (s: string) => void;
  onTag: (t: string) => void;
}) {
  const max = skills[0]?.[1] ?? 1;
  return (
    <aside className="space-y-4">
      <Painel icone={Sparkles} titulo="Skills da equipe">
        {skills.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Nenhuma skill cadastrada ainda.</p>
        ) : (
          <ul className="space-y-1">
            {skills.slice(0, 10).map(([s, n]) => (
              <li key={s}>
                <button
                  onClick={() => onSkill(s)}
                  className={cn(
                    "w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60",
                    filtros.skill === s && "bg-brand-50 dark:bg-brand-900/30",
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{s}</span>
                    <span className="tabular-nums text-slate-400">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      <Painel icone={Tag} titulo="Tags de função">
        {tags.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Crie tags em "Gerenciar tags" ou no perfil de um membro.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => onTag(String(t.id))}
                className={cn(
                  "cursor-pointer rounded transition-opacity",
                  filtros.tag && filtros.tag !== String(t.id) && "opacity-40 hover:opacity-80",
                )}
              >
                <Badge tone={tonePorTexto(t.nome)}>
                  {t.nome}
                  <span className="opacity-60">{usosTag.get(String(t.id)) ?? 0}</span>
                </Badge>
              </button>
            ))}
          </div>
        )}
      </Painel>
    </aside>
  );
}

function Painel({ icone: Icone, titulo, children }: { icone: typeof Users; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Icone className="size-4 text-brand-600 dark:text-brand-300" /> {titulo}
      </h2>
      {children}
    </section>
  );
}

function Vazio({ temFiltro }: { temFiltro: boolean }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
      <Users className="mb-3 size-8 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {temFiltro ? "Ninguém encontrado com esses filtros" : "Nenhum membro sincronizado ainda"}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {temFiltro
          ? "Tente limpar ou trocar os filtros."
          : "Os membros vêm dos times dos projetos no Azure DevOps, na próxima sincronização."}
      </p>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perfil do membro (painel lateral)
// ---------------------------------------------------------------------------

function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function PainelMembro({
  membro,
  funcaoTags,
  skillsCatalogo,
  onClose,
  nomeProjeto,
}: {
  membro: Membro;
  funcaoTags: FuncaoTag[];
  skillsCatalogo: string[];
  onClose: () => void;
  /** Nome de qualquer projeto (a carga pode vir de projetos fora de membro.projetos). */
  nomeProjeto?: (id: string) => string;
}) {
  useEsc(onClose);
  const adicionarSkill = useAdicionarSkill();
  const removerSkill = useRemoverSkill();
  const associarTag = useAssociarFuncaoTag();
  const desassociarTag = useDesassociarFuncaoTag();
  const criarTag = useCriarFuncaoTag();
  const [novaSkill, setNovaSkill] = useState("");
  const [novaTag, setNovaTag] = useState("");

  const revisarSkills = useRevisarSkills();
  const { sugeridas, descartadas, info } = membro.skillsInfo;
  const confirmadas = membro.skills.filter((s) => !sugeridas.includes(s));

  const disponiveis = funcaoTags.filter((t) => !membro.tags.some((mt) => mt.id === t.id));
  const sugestoesSkill = skillsCatalogo.filter((s) => !membro.skills.includes(s));

  /** Inferida das tasks → descarta (não volta); cadastrada pelo gestor → apaga. */
  const remover = (skill: string) =>
    tentar(() =>
      removerSkill.mutateAsync({
        pessoaId: membro.pessoaId,
        skill,
        inferida: info[skill]?.origem === "tasks" || info[skill]?.origem === "ia",
      }),
    );
  const revisar = (skills: string[], acao: "confirmar" | "restaurar", sucesso?: string) =>
    tentar(() => revisarSkills.mutateAsync({ pessoaId: membro.pessoaId, skills, acao }), sucesso);

  async function onAdicionarSkill(e: FormEvent) {
    e.preventDefault();
    const skill = novaSkill.trim();
    if (!skill) return;
    const jaTem = membro.skills.find((s) => s.toLowerCase() === skill.toLowerCase());
    if (jaTem && sugeridas.includes(jaTem)) {
      if (await revisar([jaTem], "confirmar", `${jaTem} confirmada.`)) setNovaSkill("");
      return;
    }
    if (jaTem) {
      toast.info(`${membro.nome} já tem ${skill}.`);
      return;
    }
    if (await tentar(() => adicionarSkill.mutateAsync({ pessoaId: membro.pessoaId, skill }))) setNovaSkill("");
  }

  async function onCriarTag(e: FormEvent) {
    e.preventDefault();
    const nome = novaTag.trim();
    if (!nome) return;
    const existente = funcaoTags.find((t) => t.nome.toLowerCase() === nome.toLowerCase());
    const ok = await tentar(async () => {
      const tag = existente ?? (await criarTag.mutateAsync(nome));
      if (membro.tags.some((t) => t.id === tag.id)) return;
      await associarTag.mutateAsync({ pessoaId: membro.pessoaId, funcaoTagId: tag.id });
    });
    if (ok) setNovaTag("");
  }

  return (
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="anim-drawer flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-brand-900 px-6 pt-5 pb-6 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{ background: "radial-gradient(circle at 85% 0%, var(--color-brand-500), transparent 60%)" }}
          />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 cursor-pointer rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
          <div className="relative flex items-center gap-4">
            <Avatar nome={membro.nome} tamanho="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{membro.nome}</h2>
              <p className="truncate text-sm text-white/70">{membro.uniqueName ?? "Sem e-mail"}</p>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-1.5">
            {membro.projetos.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white/90 ring-1 ring-white/15 ring-inset"
                title={p.times.join(", ")}
              >
                <FolderKanban className="size-3" /> {p.nome}
                {p.times.length > 0 && <span className="text-white/50">· {p.times.join(", ")}</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <OcupacaoMembro
            pessoaId={membro.pessoaId}
            nomeProjeto={nomeProjeto ?? ((id) => membro.projetos.find((p) => p.id === id)?.nome ?? "Outro projeto")}
            onNavegar={onClose}
          />
          <Bloco
            icone={Sparkles}
            titulo="Skills"
            descricao="Tecnologias e conhecimentos. As sugeridas vêm sozinhas das tasks da pessoa (tags da task e da Feature)."
          >
            <div className="mb-3 flex min-h-7 flex-wrap gap-1.5">
              {confirmadas.length === 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">Nenhuma skill confirmada.</span>
              )}
              {confirmadas.map((s) => (
                <ChipRemovivel key={s} tone="slate" texto={s} onRemover={() => void remover(s)} />
              ))}
            </div>

            {sugeridas.length > 0 && (
              <div className="mb-3 rounded-lg border border-dashed border-brand-400/60 bg-brand-50/60 p-3 dark:border-brand-400/40 dark:bg-brand-900/20">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-900 dark:text-brand-100">
                    <Sparkles className="size-3.5" /> Sugeridas pelas tasks ({sugeridas.length})
                  </span>
                  <button
                    onClick={() => void revisar(sugeridas, "confirmar", "Skills confirmadas.")}
                    disabled={revisarSkills.isPending}
                    className="cursor-pointer text-xs font-medium text-brand-700 hover:underline disabled:opacity-50 dark:text-brand-300"
                  >
                    Confirmar todas
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {sugeridas.map((s) => (
                    <li key={s} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/70 dark:hover:bg-slate-800/50">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">{s}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {info[s]?.evidencias ?? 0} tasks
                      </span>
                      <button
                        onClick={() => void revisar([s], "confirmar")}
                        title="Confirmar"
                        aria-label={`Confirmar ${s}`}
                        className="cursor-pointer rounded p-1 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      >
                        <Check className="size-3.5" />
                      </button>
                      <button
                        onClick={() => void remover(s)}
                        title="Descartar (não será sugerida de novo)"
                        aria-label={`Descartar ${s}`}
                        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={onAdicionarSkill} className="flex gap-2">
              <Input
                list="skills-catalogo"
                value={novaSkill}
                onChange={(e) => setNovaSkill(e.target.value)}
                placeholder="Ex.: Java, Power BI, React"
              />
              <datalist id="skills-catalogo">
                {sugestoesSkill.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Button type="submit" disabled={!novaSkill.trim() || adicionarSkill.isPending}>
                <Plus className="size-4" /> Adicionar
              </Button>
            </form>

            {descartadas.length > 0 && (
              <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">
                  Descartadas ({descartadas.length}) — não voltam a ser sugeridas
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {descartadas.map((s) => (
                    <button
                      key={s}
                      onClick={() => void revisar([s], "restaurar")}
                      title="Restaurar como sugestão"
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 line-through decoration-slate-400 hover:border-brand-400 hover:text-brand-700 hover:no-underline dark:border-slate-700 dark:hover:text-brand-300"
                    >
                      <RotateCcw className="size-3" /> {s}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </Bloco>

          <Bloco icone={Tag} titulo="Tags de função" descricao="Papel da pessoa no time (ex.: Tech Lead, QA).">
            <div className="mb-3 flex min-h-7 flex-wrap gap-1.5">
              {membro.tags.length === 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">Nenhuma tag atribuída.</span>
              )}
              {membro.tags.map((t) => (
                <ChipRemovivel
                  key={t.id}
                  tone={tonePorTexto(t.nome)}
                  texto={t.nome}
                  onRemover={() =>
                    void tentar(() => desassociarTag.mutateAsync({ pessoaId: membro.pessoaId, funcaoTagId: t.id }))
                  }
                />
              ))}
            </div>

            {disponiveis.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
                  Clique para atribuir
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {disponiveis.map((t) => (
                    <button
                      key={t.id}
                      disabled={associarTag.isPending}
                      onClick={() =>
                        void tentar(() => associarTag.mutateAsync({ pessoaId: membro.pessoaId, funcaoTagId: t.id }))
                      }
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800 dark:border-slate-600 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:bg-brand-900/30 dark:hover:text-brand-200"
                    >
                      <Plus className="size-3" /> {t.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={onCriarTag} className="flex gap-2">
              <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova tag (ex.: Tech Lead)" />
              <Button type="submit" variant="outline" disabled={!novaTag.trim() || criarTag.isPending}>
                <Plus className="size-4" /> Criar
              </Button>
            </form>
          </Bloco>
        </div>
      </div>
    </div>
  );
}

function Bloco({
  icone: Icone,
  titulo,
  descricao,
  children,
}: {
  icone: typeof Users;
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Icone className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{titulo}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChipRemovivel({
  texto,
  tone,
  onRemover,
}: {
  texto: string;
  tone: "slate" | (typeof TONS_TAG)[number];
  onRemover: () => void;
}) {
  return (
    <Badge tone={tone} className="gap-1 py-1 pr-1 pl-2 text-xs">
      {texto}
      <button
        onClick={onRemover}
        className="cursor-pointer rounded p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
        title={`Remover ${texto}`}
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Catálogo de tags (renomear / excluir afeta todos os membros)
// ---------------------------------------------------------------------------

function ModalGerenciarTags({
  tags,
  usos,
  onClose,
}: {
  tags: FuncaoTag[];
  usos: Map<string, number>;
  onClose: () => void;
}) {
  useEsc(onClose);
  const renomear = useRenomearFuncaoTag();
  const excluir = useExcluirFuncaoTag();
  const criar = useCriarFuncaoTag();
  const [editando, setEditando] = useState<number | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<number | null>(null);
  const [novaTag, setNovaTag] = useState("");

  async function salvar(e: FormEvent, id: number) {
    e.preventDefault();
    const nome = nomeEdicao.trim();
    if (nome && (await tentar(() => renomear.mutateAsync({ id, nome }), "Tag renomeada"))) setEditando(null);
  }

  async function onCriar(e: FormEvent) {
    e.preventDefault();
    const nome = novaTag.trim();
    if (nome && (await tentar(() => criar.mutateAsync(nome), "Tag criada"))) setNovaTag("");
  }

  return (
    <div
      className="anim-fade fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="anim-pop w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Gerenciar tags de função</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Renomear ou excluir aqui vale para todos os membros que usam a tag.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>

        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {tags.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma tag criada ainda.</li>
          )}
          {tags.map((t) => {
            const n = usos.get(String(t.id)) ?? 0;
            return (
              <li key={t.id} className="flex items-center gap-2 px-5 py-2.5">
                {editando === t.id ? (
                  <form onSubmit={(e) => void salvar(e, t.id)} className="flex flex-1 gap-2">
                    <Input value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} className="h-8" autoFocus />
                    <Button type="submit" size="sm" disabled={renomear.isPending}>
                      Salvar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : confirmandoExclusao === t.id ? (
                  <>
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                      Excluir <strong>{t.nome}</strong>
                      {n > 0 && ` (remove de ${n} ${n === 1 ? "membro" : "membros"})`}?
                    </span>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500"
                      onClick={() => void tentar(() => excluir.mutateAsync(t.id), "Tag excluída")}
                    >
                      Excluir
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmandoExclusao(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge tone={tonePorTexto(t.nome)}>{t.nome}</Badge>
                    <span className="flex-1 text-xs text-slate-400 dark:text-slate-500">
                      {n} {n === 1 ? "membro" : "membros"}
                    </span>
                    <button
                      onClick={() => {
                        setEditando(t.id);
                        setNomeEdicao(t.nome);
                      }}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      title="Renomear"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmandoExclusao(t.id)}
                      className="cursor-pointer rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <form
          onSubmit={onCriar}
          className="flex gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60"
        >
          <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="Nova tag (ex.: Scrum Master)" />
          <Button type="submit" disabled={!novaTag.trim() || criar.isPending}>
            <Plus className="size-4" /> Criar
          </Button>
        </form>
      </div>
    </div>
  );
}
