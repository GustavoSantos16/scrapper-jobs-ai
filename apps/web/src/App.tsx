import { useEffect, useState } from 'react';
import { APP_NAME } from '@ajh/shared';

interface Row {
  id: number;
  title: string;
  company: string | null;
  url: string;
  published_at: string | null;
  score: number;
  sources: string;
}

export function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/jobs?pageSize=50')
      .then((r) => r.json())
      .then((b: { items: Row[]; total: number }) => {
        setRows(b.items);
        setTotal(b.total);
      })
      .catch(() => setError('API offline'));
  }, []);
  return (
    <main>
      <h1>{APP_NAME}</h1>
      {error && <p>{error}</p>}
      {total === 0 && <p>Nenhuma vaga capturada ainda.</p>}
      {total !== null && total > 0 && <p>{total} vagas</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.score}</strong> · <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> · {r.company ?? '—'} ·{' '}
            {r.published_at ? new Date(r.published_at).toLocaleDateString('pt-BR') : 'data desconhecida'} · {r.sources}
          </li>
        ))}
      </ul>
    </main>
  );
}
