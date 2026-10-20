import { useEffect, useState } from 'react';
import { APP_NAME } from '@ajh/shared';

export function App() {
  const [health, setHealth] = useState<string>('…');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((b: { status: string }) => setHealth(b.status))
      .catch(() => setHealth('API offline'));
  }, []);
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>API: {health}</p>
    </main>
  );
}
