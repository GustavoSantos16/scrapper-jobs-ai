import { CONTRACT_TYPES, DEFAULT_PROFILE, GEO_TAGS, REMOTE_TYPES, SENIORITIES, type Profile } from '@ajh/shared';
import { useState } from 'react';
import { useSaveSetting, useSettings } from '../api/settings.ts';
import { Card, ConfirmDialog, ErrorState, Loading, PageHeader } from '../components/ui.tsx';
import { CONTRACT_LABEL, GEO_LABEL, REMOTE_LABEL, SENIORITY_LABEL } from '../lib/labels.ts';
import s from './pages.module.css';

const WEIGHT_LABEL: Record<keyof Profile['weights'], string> = {
  title: 'Cargo',
  primaryTech: 'Tecnologias prioritárias',
  complementaryTech: 'Tecnologias complementares',
  remote: 'Modalidade',
  geo: 'Elegibilidade geográfica',
  contract: 'Tipo de contrato',
  seniority: 'Senioridade',
  recency: 'Recência',
  salary: 'Salário informado',
};

const toList = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

export function ProfilePage() {
  const settings = useSettings();
  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  return <ProfileForm key={JSON.stringify(settings.data.profile)} initial={settings.data.profile} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const save = useSaveSetting('profile');
  const [p, setP] = useState(initial);
  const [text, setText] = useState({
    roles: initial.roles.join(', '),
    primaryTech: initial.primaryTech.join(', '),
    complementaryTech: initial.complementaryTech.join(', '),
    searchTerms: initial.searchTerms.join(', '),
  });
  const [resetting, setResetting] = useState(false);
  const totalWeight = Object.values(p.weights).reduce((a, b) => a + b, 0);

  const toggle = <K extends 'remoteTypes' | 'acceptedGeo' | 'contractTypes' | 'seniorities'>(key: K, v: Profile[K][number]) =>
    setP((cur) => {
      const list = cur[key] as string[];
      return { ...cur, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  const submit = () =>
    save.mutate({
      ...p,
      roles: toList(text.roles),
      primaryTech: toList(text.primaryTech),
      complementaryTech: toList(text.complementaryTech),
      searchTerms: toList(text.searchTerms),
    });

  const listField = (key: keyof typeof text, label: string, hint: string) => (
    <div>
      <label className="label" htmlFor={`p-${key}`}>
        {label}
      </label>
      <textarea id={`p-${key}`} className="textarea" style={{ minHeight: 64 }} value={text[key]} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
      <div className="muted" style={{ fontSize: 12 }}>
        {hint}
      </div>
    </div>
  );

  const checks = <K extends 'remoteTypes' | 'acceptedGeo' | 'contractTypes' | 'seniorities'>(key: K, title: string, values: readonly Profile[K][number][], labels: Record<string, string>) => (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label">{title}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {values.map((v) => (
          <label key={v} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={(p[key] as string[]).includes(v)} onChange={() => toggle(key, v)} />
            {labels[v]}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <>
      <PageHeader
        title="Perfil e preferências"
        subtitle="Define a pontuação (0–100) de cada vaga. Salvar recalcula a pontuação de todo o acervo. Pontuação baixa nunca esconde nem apaga vagas."
        actions={
          <>
            <button className="btn" onClick={() => setResetting(true)}>
              Restaurar padrões
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar e recalcular'}
            </button>
          </>
        }
      />
      {save.isSuccess && <p style={{ color: 'var(--success)' }}>Perfil salvo; {(save.data as { rescored?: number }).rescored} vagas recalculadas.</p>}
      {save.error && <p style={{ color: 'var(--danger)' }}>{save.error.message}</p>}
      <div className={s.stack}>
        <Card title="Cargos e tecnologias">
          <div className={s.formGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
            {listField('roles', 'Cargos', 'Separados por vírgula. Termos genéricos (Software Engineer, Desenvolvedor) valem pontuação parcial.')}
            {listField('primaryTech', 'Tecnologias prioritárias', 'Duas ou mais na vaga = pontuação cheia.')}
            {listField('complementaryTech', 'Tecnologias complementares', 'Somam pontos extras.')}
            {listField('searchTerms', 'Termos de busca nas fontes', 'Usados por fontes com busca (Himalayas, Gupy, Adzuna, Jooble). Máx. 20.')}
          </div>
        </Card>
        <Card title="Preferências">
          <div className={s.stack}>
            {checks('remoteTypes', 'Modalidade desejada', REMOTE_TYPES.filter((r) => r !== 'unknown'), REMOTE_LABEL)}
            {checks('acceptedGeo', 'Regiões em que você pode trabalhar', GEO_TAGS, GEO_LABEL)}
            {checks('contractTypes', 'Contratos aceitos', CONTRACT_TYPES, CONTRACT_LABEL)}
            {checks('seniorities', 'Senioridade', SENIORITIES.filter((x) => x !== 'unknown'), SENIORITY_LABEL)}
          </div>
        </Card>
        <Card title={`Pesos da pontuação (soma ${totalWeight}; normalizada para 100)`}>
          <div className={s.formGrid}>
            {(Object.keys(WEIGHT_LABEL) as (keyof Profile['weights'])[]).map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`w-${k}`}>
                  {WEIGHT_LABEL[k]}: {p.weights[k]}
                </label>
                <input
                  id={`w-${k}`}
                  type="range"
                  min={0}
                  max={50}
                  value={p.weights[k]}
                  style={{ width: '100%' }}
                  onChange={(e) => setP({ ...p, weights: { ...p.weights, [k]: Number(e.target.value) } })}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={resetting}
        title="Restaurar o perfil padrão?"
        confirmLabel="Restaurar e salvar"
        danger
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          setResetting(false);
          save.mutate(DEFAULT_PROFILE);
        }}
      >
        Cargos, tecnologias, preferências e pesos voltam aos valores iniciais e a pontuação é recalculada.
      </ConfirmDialog>
    </>
  );
}
