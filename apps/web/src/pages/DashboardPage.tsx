import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router';
import { useStats } from '../api/hooks.ts';
import type { Bucket, Stats } from '../api/types.ts';
import { Badge, Card, EmptyState, ErrorState, Kpi, Loading, PageHeader } from '../components/ui.tsx';
import { formatDateTime, formatDuration, formatRelative, startOfDayIso } from '../lib/format.ts';
import { REMOTE_LABEL, RUN_STATUS_LABEL, SENIORITY_LABEL } from '../lib/labels.ts';
import { useCssVars } from '../lib/useCssVar.ts';
import s from './pages.module.css';

const n = (v: number) => v.toLocaleString('pt-BR');

export function DashboardPage() {
  const stats = useStats();
  if (stats.isPending) return <Loading label="Carregando dashboard…" />;
  if (stats.isError) return <ErrorState error={stats.error} retry={() => void stats.refetch()} />;
  const { kpis } = stats.data;

  if (kpis.total === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState title="Nenhuma vaga no acervo ainda">
            Clique em <strong>Capturar agora</strong> (no topo) para buscar vagas reais nas fontes ativas. Nada aqui é inventado: o dashboard só mostra o que foi capturado.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={kpis.lastUpdate ? `Última atualização ${formatRelative(kpis.lastUpdate)} (${formatDateTime(kpis.lastUpdate)})` : 'Nenhuma captura concluída ainda'}
      />
      <div className={s.kpis}>
        <Kpi label="Vagas no acervo" value={n(kpis.total)} hint={`${n(kpis.active)} ativas`} to="/vagas?status=all" />
        <Kpi label="Novas hoje" value={n(kpis.newToday)} hint="capturadas hoje" to={`/vagas?seenFrom=${encodeURIComponent(startOfDayIso(0))}&sort=captured`} />
        <Kpi label="Publicadas em 24 h" value={n(kpis.publishedLast24h)} hint="pela data da fonte" to="/hoje?period=24h" />
        <Kpi label="Remotas" value={n(kpis.remote)} to="/vagas?remote=remote" />
        <Kpi label="Aceitam Brasil" value={n(kpis.eligibleBrazil)} hint="mundial, Américas, LATAM, Brasil" to="/vagas?eligibleBrazil=true" />
        <Kpi label="Internacionais" value={n(kpis.international)} hint="não sediadas no BR" to="/vagas?international=true" />
        <Kpi label="Não revisadas" value={n(kpis.unreviewed)} to="/vagas?reviewed=false" />
        <Kpi label="Favoritas" value={n(kpis.favorites)} to="/favoritas" />
        <Kpi label="Candidaturas" value={n(kpis.applications)} hint="enviadas, entrevista, oferta" to="/candidaturas" />
        <Kpi
          label="Fontes ativas"
          value={`${kpis.sourcesWorking}/${kpis.sourcesEnabled}`}
          hint={kpis.sourcesFailing ? <span style={{ color: 'var(--danger)' }}>{kpis.sourcesFailing} com falha</span> : 'nenhuma com falha'}
          to="/fontes"
        />
        {kpis.pendingReviews > 0 && <Kpi label="Duplicatas p/ revisar" value={n(kpis.pendingReviews)} to="/duplicatas" />}
        {kpis.possiblyClosed > 0 && <Kpi label="Possivelmente encerradas" value={n(kpis.possiblyClosed)} to="/vagas?status=possibly_closed" />}
      </div>
      <Charts stats={stats.data} />
      <div style={{ marginTop: 16 }}>
        <Card title="Capturas recentes" actions={<Link to="/capturas">Ver histórico</Link>} bodyClass={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Início</th>
                <th>Status</th>
                <th className={s.num}>Fontes</th>
                <th className={s.num}>Encontradas</th>
                <th className={s.num}>Novas</th>
                <th className={s.num}>Duração</th>
              </tr>
            </thead>
            <tbody>
              {stats.data.recentRuns.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/capturas?run=${r.id}`}>{r.id}</Link>
                  </td>
                  <td>{formatDateTime(r.started_at)}</td>
                  <td>
                    <Badge tone={r.status === 'success' ? 'success' : r.status === 'failed' ? 'danger' : r.status === 'partial' ? 'warning' : 'neutral'}>
                      {RUN_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className={s.num}>
                    {r.sources_done}/{r.sources_total}
                    {r.sources_failed ? <span style={{ color: 'var(--danger)' }}> ({r.sources_failed} falha)</span> : null}
                  </td>
                  <td className={s.num}>{n(r.jobs_found)}</td>
                  <td className={s.num}>{n(r.jobs_new)}</td>
                  <td className={s.num}>{formatDuration(r.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function Charts({ stats }: { stats: Stats }) {
  const c = useCssVars(['accent', 'success', 'text-3', 'border', 'surface', 'text'] as const);
  const days = mergeDays(stats.publishedPerDay, stats.capturedPerDay);
  const tooltip = { contentStyle: { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text } };
  const axis = { stroke: c['text-3'], fontSize: 12, tickLine: false };

  const hbar = (data: Bucket[], label: (k: string) => string = (k) => k) => (
    <div style={{ height: Math.max(140, data.length * 26 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data.map((d) => ({ name: label(d.key ?? '—'), n: d.n }))} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke={c.border} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} interval={0} {...axis} />
          <Tooltip {...tooltip} cursor={{ fill: c.border }} formatter={(v) => [v, 'Vagas']} />
          <Bar dataKey="n" fill={c.accent} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className={s.charts}>
      <Card title="Vagas por dia (30 dias)">
        <div className={s.chartBox}>
          <ResponsiveContainer>
            <LineChart data={days} margin={{ left: -16, right: 8 }}>
              <CartesianGrid vertical={false} stroke={c.border} />
              <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)} minTickGap={16} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="published" name="Publicadas" stroke={c.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="captured" name="Capturadas" stroke={c.success} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card title="Por fonte (vagas ativas)">{hbar(stats.bySource)}</Card>
      <Card title="Tecnologias mais pedidas">{hbar(stats.byTech)}</Card>
      <Card title="Por país">{hbar(stats.byCountry, (k) => (k === '??' ? 'Não informado' : k))}</Card>
      <Card title="Modalidade">{hbar(stats.byRemote, (k) => REMOTE_LABEL[k as keyof typeof REMOTE_LABEL] ?? k)}</Card>
      <Card title="Senioridade">{hbar(stats.bySeniority, (k) => SENIORITY_LABEL[k as keyof typeof SENIORITY_LABEL] ?? k)}</Card>
    </div>
  );
}

function mergeDays(published: { day: string; n: number }[], captured: { day: string; n: number }[]) {
  const map = new Map<string, { day: string; published: number; captured: number }>();
  for (const p of published) map.set(p.day, { day: p.day, published: p.n, captured: 0 });
  for (const x of captured) map.set(x.day, { ...(map.get(x.day) ?? { day: x.day, published: 0 }), captured: x.n });
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}
