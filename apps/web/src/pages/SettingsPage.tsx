import { useState } from 'react';
import { useConfigureScheduler, useReprocess, useScheduler } from '../api/scheduler.ts';
import { useSaveSetting, useSettings, type PipelineSettings, type SchedulerSettings } from '../api/settings.ts';
import { Badge, Card, ConfirmDialog, ErrorState, Loading, PageHeader } from '../components/ui.tsx';
import { formatDateTime, formatRelative } from '../lib/format.ts';
import s from './pages.module.css';

const INTERVALS: { value: SchedulerSettings['interval']; label: string }[] = [
  { value: 'manual', label: 'Manual (só quando eu pedir)' },
  { value: '30m', label: 'A cada 30 minutos' },
  { value: '1h', label: 'A cada 1 hora' },
  { value: '3h', label: 'A cada 3 horas' },
  { value: '6h', label: 'A cada 6 horas' },
  { value: '24h', label: 'Diariamente' },
];

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife', 'America/Fortaleza', 'America/Noronha', 'America/Rio_Branco', 'UTC', 'America/New_York', 'Europe/Lisbon'];

export function SettingsPage() {
  const settings = useSettings();
  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  return (
    <>
      <PageHeader title="Configurações" />
      <div className={s.stack}>
        <SchedulerCard />
        <PipelineCard key={JSON.stringify(settings.data.pipeline)} initial={settings.data.pipeline} />
        <DisplayCard initial={settings.data.display.timezone} />
        <MaintenanceCard />
      </div>
    </>
  );
}

function SchedulerCard() {
  const status = useScheduler();
  const configure = useConfigureScheduler();
  if (!status.data) return <Card title="Agendador">{status.isError ? <ErrorState error={status.error} /> : <Loading />}</Card>;
  const st = status.data;
  return (
    <Card title="Agendador de capturas" actions={st.paused ? <Badge tone="warning">Pausado</Badge> : st.interval === 'manual' ? <Badge>Manual</Badge> : <Badge tone="success">Ativo</Badge>}>
      <div className={s.formGrid}>
        <div>
          <label className="label" htmlFor="s-int">
            Frequência
          </label>
          <select id="s-int" className="select" value={st.interval} disabled={configure.isPending} onChange={(e) => configure.mutate({ interval: e.target.value as SchedulerSettings['interval'], paused: st.paused })}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          {st.interval !== 'manual' && (
            <button className="btn" disabled={configure.isPending} onClick={() => configure.mutate({ interval: st.interval, paused: !st.paused })}>
              {st.paused ? 'Retomar' : 'Pausar'}
            </button>
          )}
        </div>
      </div>
      <dl className={s.dl} style={{ marginTop: 12 }}>
        <dt>Próxima execução</dt>
        <dd>{st.nextRunAt ? `${formatDateTime(st.nextRunAt)} (${formatRelative(st.nextRunAt)})` : '—'}</dd>
        <dt>Captura em andamento</dt>
        <dd>{st.running ? `sim (#${st.currentRunId})` : 'não'}</dd>
        {st.lastSkipReason && (
          <>
            <dt>Último aviso</dt>
            <dd>{st.lastSkipReason}</dd>
          </>
        )}
      </dl>
      <p className="muted" style={{ marginBottom: 0 }}>
        O agendador roda dentro da API local: com o Mac desligado, dormindo ou a API parada, nada é executado. Execuções nunca se sobrepõem, e cada fonte ainda respeita o próprio intervalo mínimo (uma fonte de 12 h é pulada nas execuções de 30 min até o intervalo dela vencer).
      </p>
      {configure.error && <p style={{ color: 'var(--danger)' }}>{configure.error.message}</p>}
    </Card>
  );
}

function PipelineCard({ initial }: { initial: PipelineSettings }) {
  const save = useSaveSetting('pipeline');
  const [p, setP] = useState(initial);
  const [confirmRetention, setConfirmRetention] = useState(false);
  const enablingRetention = initial.retentionDays === null && p.retentionDays !== null;
  const num = (k: keyof PipelineSettings, label: string, min: number, max: number) => (
    <div>
      <label className="label" htmlFor={`pl-${k}`}>
        {label}
      </label>
      <input id={`pl-${k}`} className="input" type="number" min={min} max={max} value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <Card title="Captura">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (enablingRetention) setConfirmRetention(true);
          else save.mutate(p);
        }}
      >
        <div className={s.formGrid}>
          {num('concurrency', 'Fontes em paralelo (1–8)', 1, 8)}
          {num('sourceTimeoutSeconds', 'Timeout por fonte (s)', 10, 1800)}
          {num('missedRunsThreshold', 'Execuções sem a vaga até "possivelmente encerrada"', 1, 50)}
          <div>
            <label className="label" htmlFor="pl-ret">
              Retenção de vagas encerradas
            </label>
            <select id="pl-ret" className="select" value={p.retentionDays ?? ''} onChange={(e) => setP({ ...p, retentionDays: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Desligada (nunca apagar)</option>
              <option value="30">Apagar após 30 dias</option>
              <option value="90">Apagar após 90 dias</option>
              <option value="180">Apagar após 180 dias</option>
              <option value="365">Apagar após 1 ano</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={save.isPending}>
            Salvar
          </button>
          {save.isSuccess && <span style={{ color: 'var(--success)' }}>Salvo.</span>}
          {save.error && <span style={{ color: 'var(--danger)' }}>{save.error.message}</span>}
        </div>
      </form>
      <ConfirmDialog
        open={confirmRetention}
        title="Ativar a retenção?"
        confirmLabel="Ativar retenção"
        danger
        onCancel={() => setConfirmRetention(false)}
        onConfirm={() => {
          setConfirmRetention(false);
          save.mutate(p);
        }}
      >
        Vagas “possivelmente encerradas” não vistas há mais de {p.retentionDays} dias serão apagadas após cada captura. Vagas favoritas, com notas ou com estado de candidatura nunca são apagadas.
      </ConfirmDialog>
    </Card>
  );
}

function DisplayCard({ initial }: { initial: string }) {
  const save = useSaveSetting('display');
  const [tz, setTz] = useState(initial);
  return (
    <Card title="Exibição">
      <form
        className={s.formGrid}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ timezone: tz });
        }}
      >
        <div>
          <label className="label" htmlFor="d-tz">
            Fuso horário de exibição
          </label>
          <input id="d-tz" className="input" list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)} />
          <datalist id="tz-list">
            {TIMEZONES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <div className="muted" style={{ fontSize: 12 }}>
            Datas são armazenadas em UTC; isto muda só a exibição e o que conta como “hoje”.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'start', paddingTop: 22, gap: 8 }}>
          <button className="btn btn-primary" disabled={save.isPending || tz === initial}>
            Salvar
          </button>
          {save.error && <span style={{ color: 'var(--danger)' }}>{save.error.message}</span>}
        </div>
      </form>
    </Card>
  );
}

function MaintenanceCard() {
  const reprocess = useReprocess();
  return (
    <Card title="Manutenção">
      <p className="muted" style={{ marginTop: 0 }}>
        Reaplica as regras de normalização, elegibilidade e dedup às vagas já capturadas, usando o conteúdo guardado. Não faz nenhuma requisição às fontes.
      </p>
      <button className="btn" disabled={reprocess.isPending} onClick={() => reprocess.mutate()}>
        {reprocess.isPending ? 'Reprocessando…' : 'Reprocessar vagas'}
      </button>
      {reprocess.data && (
        <span className="muted" style={{ marginLeft: 8 }}>
          {reprocess.data.listings} registros, {reprocess.data.updated} atualizados, {reprocess.data.pendingReviews} pares para revisar.
        </span>
      )}
      {reprocess.error && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{reprocess.error.message}</span>}
    </Card>
  );
}
