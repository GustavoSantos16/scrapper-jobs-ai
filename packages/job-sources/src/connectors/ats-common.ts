import type { CompanyConfig, ConnectorContext } from '../types.ts';

export interface WithCompany<T> {
  company: CompanyConfig;
  job: T;
}

/**
 * Iterates the enabled companies of one ATS. A broken slug (404, bad payload) is logged and
 * skipped; the source fails only if every company failed.
 */
export async function* perCompany<T>(
  ctx: ConnectorContext,
  ats: CompanyConfig['ats'],
  fetchCompany: (company: CompanyConfig) => Promise<T[]>,
): AsyncGenerator<WithCompany<T>> {
  const companies = ctx.companies.filter((c) => c.ats === ats && c.enabled !== false);
  const errors: string[] = [];
  for (const company of companies) {
    ctx.signal.throwIfAborted();
    let jobs: T[];
    try {
      jobs = await fetchCompany(company);
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      const msg = `${company.name} (${company.slug}): ${(err as Error).message}`;
      errors.push(msg);
      ctx.log.warn({ ats, company: company.slug, err: (err as Error).message }, 'company board failed');
      continue;
    }
    for (const job of jobs) yield { company, job };
  }
  if (companies.length && errors.length === companies.length) {
    throw new Error(`All ${ats} boards failed: ${errors.slice(0, 3).join('; ')}`);
  }
}
