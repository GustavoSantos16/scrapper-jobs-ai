import { APPLICATION_STATES, CONTRACT_TYPES, REMOTE_TYPES, SENIORITIES, SORTS } from '@ajh/shared';
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useFacets } from '../api/hooks.ts';
import { CONTRACT_LABEL, LANGUAGE_LABEL, REMOTE_LABEL, SENIORITY_LABEL, STATE_LABEL } from '../lib/labels.ts';
import { PERIODS, QUICK_SEARCHES } from '../lib/jobQuery.ts';
import s from './Filters.module.css';

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  relevance: 'Relevância',
  score: 'Pontuação',
  published: 'Data de publicação',
  captured: 'Data de captura',
  company: 'Empresa',
  title: 'Cargo',
};

function Field({ label, children, id }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** All job filters, kept in the URL so searches are shareable and survive reloads. */
export function Filters({ hide = [], extra }: { hide?: string[]; extra?: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const facets = useFacets();
  const [expanded, setExpanded] = useState(() => [...params.keys()].some((k) => !['q', 'sort', 'order', 'page'].includes(k)));

  const get = (k: string) => params.get(k) ?? '';
  const getList = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    setParams(next, { replace: true });
  };
  const toggleIn = (k: string, value: string) => {
    const cur = new Set(getList(k));
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    update({ [k]: [...cur].join(',') || null });
  };
  const applyQuick = (p: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const k of hide) if (params.get(k)) next.set(k, params.get(k)!);
    for (const [k, v] of Object.entries(p)) next.set(k, v);
    setParams(next, { replace: true });
  };
  const quickActive = (p: Record<string, string>) => Object.entries(p).every(([k, v]) => params.get(k) === v);
  const show = (k: string) => !hide.includes(k);
  const activeCount = [...params.keys()].filter((k) => !['sort', 'order', 'page'].includes(k) && !hide.includes(k)).length;

  return (
    <div className={s.panel}>
      <div className={s.quick} aria-label="Buscas rápidas">
        <span className="muted">Buscas rápidas:</span>
        {QUICK_SEARCHES.map((qs) => (
          <button key={qs.label} className={`${s.chip} ${quickActive(qs.params) ? s.chipOn : ''}`} onClick={() => applyQuick(qs.params)}>
            {qs.label}
          </button>
        ))}
      </div>
      <div className={s.row}>
        <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 240 }}>
          <input
            className="input"
            type="search"
            aria-label="Texto da busca"
            placeholder="Texto livre (cargo, empresa, tecnologia, descrição)"
            defaultValue={get('q')}
            key={get('q')}
            onKeyDown={(e) => e.key === 'Enter' && update({ q: (e.target as HTMLInputElement).value.trim() || null })}
            onBlur={(e) => e.target.value.trim() !== get('q') && update({ q: e.target.value.trim() || null })}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="visually-hidden" htmlFor="f-sort">
            Ordenar por
          </label>
          <select id="f-sort" className="select" style={{ width: 'auto' }} value={get('sort') || 'relevance'} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((x) => (
              <option key={x} value={x}>
                Ordenar: {SORT_LABEL[x]}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            onClick={() => update({ order: get('order') === 'asc' ? 'desc' : 'asc' })}
            title="Inverter ordem"
            aria-label={`Ordem ${get('order') === 'asc' ? 'crescente' : 'decrescente'}`}
          >
            {get('order') === 'asc' ? '↑ Crescente' : '↓ Decrescente'}
          </button>
          <button className={`btn btn-sm ${s.toggle}`} onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            Filtros{activeCount ? ` (${activeCount})` : ''}
          </button>
          {activeCount > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const next = new URLSearchParams();
                for (const k of hide) if (params.get(k)) next.set(k, params.get(k)!);
                setParams(next, { replace: true });
              }}
            >
              Limpar
            </button>
          )}
          {extra}
        </div>
      </div>

      {expanded && (
        <>
          <div className={s.grid}>
            <Field label="Cargo contém" id="f-title">
              <input id="f-title" className="input" defaultValue={get('title')} key={`t${get('title')}`} onBlur={(e) => update({ title: e.target.value.trim() || null })} />
            </Field>
            <Field label="Empresa contém" id="f-company">
              <input id="f-company" className="input" defaultValue={get('company')} key={`c${get('company')}`} onBlur={(e) => update({ company: e.target.value.trim() || null })} />
            </Field>
            <Field label="Cidade / local" id="f-city">
              <input id="f-city" className="input" defaultValue={get('city')} key={`ci${get('city')}`} onBlur={(e) => update({ city: e.target.value.trim() || null })} />
            </Field>
            <Field label="Publicação" id="f-period">
              <select id="f-period" className="select" value={get('period')} onChange={(e) => update({ period: e.target.value || null })}>
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {get('period') === 'custom' && (
              <>
                <Field label="De" id="f-from">
                  <input id="f-from" type="date" className="input" value={get('from')} onChange={(e) => update({ from: e.target.value || null })} />
                </Field>
                <Field label="Até" id="f-to">
                  <input id="f-to" type="date" className="input" value={get('to')} onChange={(e) => update({ to: e.target.value || null })} />
                </Field>
              </>
            )}
            <Field label="País" id="f-country">
              <select id="f-country" className="select" value={get('country')} onChange={(e) => update({ country: e.target.value || null })}>
                <option value="">Todos</option>
                {facets.data?.countries.map((c) => (
                  <option key={c.key} value={c.key ?? ''}>
                    {c.key} ({c.n})
                  </option>
                ))}
              </select>
            </Field>
            {show('source') && (
              <Field label="Fonte" id="f-source">
                <select id="f-source" className="select" value={get('source')} onChange={(e) => update({ source: e.target.value || null })}>
                  <option value="">Todas</option>
                  {facets.data?.sources.map((c) => (
                    <option key={c.key} value={c.key ?? ''}>
                      {c.key} ({c.n})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Idioma" id="f-lang">
              <select id="f-lang" className="select" value={get('language')} onChange={(e) => update({ language: e.target.value || null })}>
                <option value="">Todos</option>
                {facets.data?.languages.map((c) => (
                  <option key={c.key} value={c.key ?? ''}>
                    {LANGUAGE_LABEL[c.key ?? ''] ?? c.key} ({c.n})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Salário a partir de" id="f-smin">
              <input id="f-smin" type="number" min={0} className="input" defaultValue={get('salaryMin')} key={`s${get('salaryMin')}`} onBlur={(e) => update({ salaryMin: e.target.value || null })} />
            </Field>
            <Field label="Salário até" id="f-smax">
              <input id="f-smax" type="number" min={0} className="input" defaultValue={get('salaryMax')} key={`sx${get('salaryMax')}`} onBlur={(e) => update({ salaryMax: e.target.value || null })} />
            </Field>
            <Field label="Moeda" id="f-cur">
              <select id="f-cur" className="select" value={get('salaryCurrency')} onChange={(e) => update({ salaryCurrency: e.target.value || null })}>
                <option value="">Qualquer</option>
                {facets.data?.currencies.map((c) => (
                  <option key={c.key} value={c.key ?? ''}>
                    {c.key} ({c.n})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pontuação mínima" id="f-score">
              <input id="f-score" type="number" min={0} max={100} className="input" defaultValue={get('minScore')} key={`m${get('minScore')}`} onBlur={(e) => update({ minScore: e.target.value || null })} />
            </Field>
            {show('state') && (
              <Field label="Estado da candidatura" id="f-state">
                <select id="f-state" className="select" value={get('state')} onChange={(e) => update({ state: e.target.value || null })}>
                  <option value="">Todos</option>
                  {APPLICATION_STATES.map((x) => (
                    <option key={x} value={x}>
                      {STATE_LABEL[x]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Situação da vaga" id="f-status">
              <select id="f-status" className="select" value={get('status') || 'active'} onChange={(e) => update({ status: e.target.value === 'active' ? null : e.target.value })}>
                <option value="active">Ativas</option>
                <option value="possibly_closed">Possivelmente encerradas</option>
                <option value="all">Todas</option>
              </select>
            </Field>
            <Field label="Ignoradas" id="f-ign">
              <select id="f-ign" className="select" value={get('ignored') || 'hide'} onChange={(e) => update({ ignored: e.target.value === 'hide' ? null : e.target.value })}>
                <option value="hide">Ocultar</option>
                <option value="include">Mostrar junto</option>
                <option value="only">Só ignoradas</option>
              </select>
            </Field>
          </div>

          <div>
            <span className="label">Tecnologias</span>
            <div className={s.quick}>
              {(facets.data?.technologies ?? []).slice(0, 30).map((t) => (
                <button key={t.key} className={`${s.chip} ${getList('tech').includes(t.key ?? '') ? s.chipOn : ''}`} onClick={() => toggleIn('tech', t.key ?? '')}>
                  {t.key} <span className="muted">{t.n}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={s.grid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            <CheckGroup label="Modalidade" values={REMOTE_TYPES} labels={REMOTE_LABEL} selected={getList('remote')} onToggle={(v) => toggleIn('remote', v)} />
            <CheckGroup label="Contrato" values={CONTRACT_TYPES} labels={CONTRACT_LABEL} selected={getList('contract')} onToggle={(v) => toggleIn('contract', v)} />
            <CheckGroup label="Senioridade" values={SENIORITIES} labels={SENIORITY_LABEL} selected={getList('seniority')} onToggle={(v) => toggleIn('seniority', v)} />
            <div>
              <span className="label">Outros</span>
              <div className={s.checks}>
                <Check label="Aceita candidatos no Brasil" checked={get('eligibleBrazil') === 'true'} onChange={(c) => update({ eligibleBrazil: c ? 'true' : null })} />
                <Check label="Internacional (fora do BR)" checked={get('international') === 'true'} onChange={(c) => update({ international: c ? 'true' : null })} />
                <Check label="Com salário informado" checked={get('hasSalary') === 'true'} onChange={(c) => update({ hasSalary: c ? 'true' : null })} />
                {show('favorite') && <Check label="Só favoritas" checked={get('favorite') === 'true'} onChange={(c) => update({ favorite: c ? 'true' : null })} />}
                <Check label="Só não revisadas" checked={get('reviewed') === 'false'} onChange={(c) => update({ reviewed: c ? 'false' : null })} />
                <Check label="Só revisadas" checked={get('reviewed') === 'true'} onChange={(c) => update({ reviewed: c ? 'true' : null })} />
                <Check label="Publicação desconhecida" checked={get('publishedUnknown') === 'true'} onChange={(c) => update({ publishedUnknown: c ? 'true' : null })} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className={s.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function CheckGroup<T extends string>({ label, values, labels, selected, onToggle }: { label: string; values: readonly T[]; labels: Record<T, string>; selected: string[]; onToggle: (v: T) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className={s.checks}>
        {values.map((v) => (
          <Check key={v} label={labels[v]} checked={selected.includes(v)} onChange={() => onToggle(v)} />
        ))}
      </div>
    </div>
  );
}
