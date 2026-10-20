export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/** Every network call of the UI goes to the local API (never to job sources directly). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined && { 'content-type': 'application/json' }), ...rest.headers },
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `Erro ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

/** Serializes a filter object to a querystring (arrays as comma lists, empty values dropped). */
export function toQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
