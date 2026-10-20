import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '@ajh/database';
import type { CompanyConfig } from '@ajh/job-sources';
import { z } from 'zod';

export const Company = z.object({
  name: z.string().trim().min(1).max(120),
  ats: z.enum(['greenhouse', 'lever', 'ashby']),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, 'slug must contain only letters, numbers, ".", "_" or "-"'),
  enabled: z.boolean().default(true),
});
const CompaniesFile = z.object({ $comment: z.string().optional(), companies: z.array(Company) });

export function companiesPath(): string {
  return process.env.COMPANIES_PATH ?? join(findRepoRoot(), 'config', 'companies.json');
}

export function readCompanies(path = companiesPath()): CompanyConfig[] {
  try {
    return CompaniesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).companies;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`Invalid ${path}: ${(err as Error).message}`, { cause: err });
  }
}

/** Atomic write (temp file + rename) so a crash never leaves a half-written config. */
export function writeCompanies(companies: CompanyConfig[], path = companiesPath()): CompanyConfig[] {
  const parsed = z.array(Company).parse(companies);
  let comment: string | undefined;
  try {
    comment = (JSON.parse(readFileSync(path, 'utf8')) as { $comment?: string }).$comment;
  } catch {
    /* new file */
  }
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...(comment && { $comment: comment }), companies: parsed }, null, 2)}\n`);
  renameSync(tmp, path);
  return parsed;
}
