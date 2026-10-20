import type { SourceInfo, SourceStatus } from '@ajh/shared';
import { useState } from 'react';
import { useCompanies, usePatchSource, useSaveCompanies, useSources, useStartRun, useValidateCompany } from '../api/hooks.ts';
import type { Company } from '../api/types.ts';
import { Icon } from '../components/Icon.tsx';
import { Badge, Card, ConfirmDialog, ErrorState, Loading, PageHeader, type Tone } from '../components/ui.tsx';
import { formatDateTime, formatDuration, formatRelative } from '../lib/format.ts';
import { SOURCE_KIND_LABEL, SOURCE_STATUS_LABEL } from '../lib/labels.ts';
import s from './pages.module.css';

const STATUS_TONE: Record<SourceStatus, Tone> = {
  working: 'success',
  no_jobs: 'warning',
  failing: 'danger',
  never_run: 'neutral',
  disabled: 'neutral',
  requires_credential: 'info',
  manual_link: 'neutral',
  unavailable: 'neutral',
};

export function SourcesPage() {
  const sources = useSources();
  if (sources.isPending) return <Loading />;
  if (sources.isError) return <ErrorState error={sources.error} retry={() => void sources.refetch()} />;
  const automated = sources.data.items.filter((x) => x.automated);
  const manual = sources.data.items.filter((x) => !x.automated);
  const working = automated.filter((x) => x.status === 'working').length;

  return (
    <>
      <PageHeader
        title="Fontes"
        subtitle={`${working} de ${automated.length} conectores capturaram vagas na última execução. "Funcionando" só aparece quando a última execução trouxe vagas de verdade.`}
      />
      <Card title="Captura automatizada" bodyClass="">
        {automated.map((src) => (
          <SourceRow key={src.id} src={src} />
        ))}
      </Card>
      <div style={{ marginTop: 16 }}>
        <CompaniesCard />
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Sem captura automatizada (link manual)" bodyClass="">
          {manual.map((m) => (
            <div key={m.id} className={s.sourceRow}>
              <div>
                <strong>{m.name}</strong> <Badge tone={STATUS_TONE[m.status]}>{SOURCE_STATUS_LABEL[m.status]}</Badge>
                <p className="muted" style={{ margin: '4px 0 6px' }}>
                  {m.statusReason}
                </p>
                <div className={s.metaLine} style={{ fontSize: 13 }}>
                  {m.searchLinks.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function SourceRow({ src }: { src: SourceInfo }) {
  const patch = usePatchSource();
  const run = useStartRun();
  const [editing, setEditing] = useState(false);
  const [interval, setIntervalValue] = useState(String(src.overrides.minIntervalMinutes ?? ''));
  const [maxReq, setMaxReq] = useState(String(src.overrides.maxRequests ?? ''));
  const canRun = src.enabled && !src.missingEnv.length && !src.nextAllowedAt;

  return (
    <div className={s.sourceRow}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>{src.name}</strong>
          <Badge tone={STATUS_TONE[src.status]}>{SOURCE_STATUS_LABEL[src.status]}</Badge>
          <Badge>{SOURCE_KIND_LABEL[src.kind]}</Badge>
        </div>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {src.description}
        </p>
        <div className={s.metaLine}>
          <span>Última execução: {src.lastRunAt ? `${formatRelative(src.lastRunAt)}` : 'nunca'}</span>
          <span>Última captura com vagas: {src.lastSuccessAt ? formatDateTime(src.lastSuccessAt) : '—'}</span>
          <span>
            Achadas/novas: {src.lastFound ?? '—'}/{src.lastNew ?? '—'}
          </span>
          <span>Duração: {formatDuration(src.lastDurationMs)}</span>
          <span>Ativas no acervo: {src.activeJobs}</span>
          <span>
            Intervalo mínimo: {src.effectiveIntervalMinutes} min · até {src.overrides.maxRequests ?? src.rateLimit?.maxRequestsPerRun} req/execução
          </span>
          {src.nextAllowedAt && <span>Próxima permitida: {formatDateTime(src.nextAllowedAt)}</span>}
          {src.usesCompanies && <span>Empresas: {src.companiesCount}</span>}
          <a href={src.docsUrl} target="_blank" rel="noopener noreferrer">
            Documentação ↗
          </a>
        </div>
        {(src.status === 'failing' || src.status === 'requires_credential' || src.status === 'no_jobs') && <div className={s.error}>{src.statusReason}</div>}
        {editing && (
          <form
            className={s.formGrid}
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              patch.mutate(
                { id: src.id, minIntervalMinutes: interval ? Number(interval) : null, maxRequests: maxReq ? Number(maxReq) : null },
                { onSuccess: () => setEditing(false) },
              );
            }}
          >
            <div>
              <label className="label" htmlFor={`i-${src.id}`}>
                Intervalo mínimo (min) — mínimo da fonte: {src.rateLimit?.minIntervalMinutes}
              </label>
              <input id={`i-${src.id}`} className="input" type="number" min={src.rateLimit?.minIntervalMinutes} value={interval} placeholder={String(src.rateLimit?.minIntervalMinutes)} onChange={(e) => setIntervalValue(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`r-${src.id}`}>
                Máx. requisições/execução — limite da fonte: {src.rateLimit?.maxRequestsPerRun}
              </label>
              <input id={`r-${src.id}`} className="input" type="number" min={1} max={src.rateLimit?.maxRequestsPerRun} value={maxReq} placeholder={String(src.rateLimit?.maxRequestsPerRun)} onChange={(e) => setMaxReq(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <button className="btn btn-primary btn-sm" disabled={patch.isPending}>
                Salvar limites
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
            {patch.error && <div className={s.error}>{patch.error.message}</div>}
          </form>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={src.enabled} disabled={patch.isPending} onChange={(e) => patch.mutate({ id: src.id, enabled: e.target.checked })} />
          Ativa
        </label>
        <button className="btn btn-sm" onClick={() => setEditing((v) => !v)}>
          Limites
        </button>
        <button className="btn btn-sm" disabled={!canRun || run.isPending} onClick={() => run.mutate([src.id])} title={canRun ? 'Capturar só esta fonte' : 'Desativada, sem credencial ou dentro do intervalo mínimo'}>
          <Icon name="refresh" size={14} /> Capturar
        </button>
        {run.error && <span className={s.error}>{run.error.message}</span>}
      </div>
    </div>
  );
}

const EMPTY: Company = { name: '', ats: 'greenhouse', slug: '', enabled: true };

function CompaniesCard() {
  const companies = useCompanies();
  const save = useSaveCompanies();
  const validate = useValidateCompany();
  const [draft, setDraft] = useState<Company>(EMPTY);
  const [removing, setRemoving] = useState<Company | null>(null);
  const list = companies.data?.items ?? [];

  const add = () => {
    validate.mutate(
      { ats: draft.ats, slug: draft.slug.trim() },
      {
        onSuccess: (r) => {
          if (r.ok) save.mutate([...list, { ...draft, name: draft.name.trim(), slug: draft.slug.trim() }], { onSuccess: () => setDraft(EMPTY) });
        },
      },
    );
  };

  return (
    <Card title="Empresas monitoradas (Greenhouse, Lever, Ashby)">
      <p className="muted" style={{ marginTop: 0 }}>
        O slug é o identificador do board público. Exemplos: <span className="mono">boards.greenhouse.io/vtex</span> → <span className="mono">vtex</span>;{' '}
        <span className="mono">jobs.lever.co/ciandt</span> → <span className="mono">ciandt</span>; <span className="mono">jobs.ashbyhq.com/supabase</span> →{' '}
        <span className="mono">supabase</span>. Ao adicionar, o board é validado com uma requisição real. Arquivo: <span className="mono">config/companies.json</span>.
      </p>
      {companies.isPending ? (
        <Loading />
      ) : companies.isError ? (
        <ErrorState error={companies.error} />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>ATS</th>
                <th>Slug</th>
                <th>Ativa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={`${c.ats}:${c.slug}`}>
                  <td>{c.name}</td>
                  <td>{c.ats}</td>
                  <td className="mono">{c.slug}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Ativar ${c.name}`}
                      checked={c.enabled}
                      onChange={(e) => save.mutate(list.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-danger" onClick={() => setRemoving(c)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className={s.formGrid}
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div>
          <label className="label" htmlFor="c-name">
            Nome
          </label>
          <input id="c-name" className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="c-ats">
            ATS
          </label>
          <select id="c-ats" className="select" value={draft.ats} onChange={(e) => setDraft({ ...draft, ats: e.target.value as Company['ats'] })}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c-slug">
            Slug
          </label>
          <input id="c-slug" className="input" required pattern="[A-Za-z0-9_.\-]+" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn btn-primary" disabled={validate.isPending || save.isPending}>
            {validate.isPending ? 'Validando…' : 'Validar e adicionar'}
          </button>
        </div>
      </form>
      {validate.data && !validate.data.ok && <div className={s.error}>Não adicionada: {validate.data.message}</div>}
      {validate.data?.ok && <div className="muted">Board válido ({validate.data.jobs} vagas).</div>}
      {save.error && <div className={s.error}>{save.error.message}</div>}
      <ConfirmDialog
        open={removing !== null}
        title={`Remover ${removing?.name}?`}
        confirmLabel="Remover"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          save.mutate(list.filter((c) => c !== removing));
          setRemoving(null);
        }}
      >
        A empresa deixa de ser consultada. As vagas já capturadas continuam no acervo.
      </ConfirmDialog>
    </Card>
  );
}
