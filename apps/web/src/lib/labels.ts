import type { ApplicationState, ContractType, GeoTag, RemoteType, Seniority, SourceKind, SourceStatus } from '@ajh/shared';

export const REMOTE_LABEL: Record<RemoteType, string> = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial', unknown: 'Não informado' };
export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: 'Estágio',
  junior: 'Júnior',
  mid: 'Pleno',
  senior: 'Sênior',
  staff: 'Staff',
  lead: 'Lead',
  principal: 'Principal',
  unknown: 'Não informada',
};
export const CONTRACT_LABEL: Record<ContractType, string> = {
  clt: 'CLT',
  pj: 'PJ',
  contractor: 'Contractor',
  full_time: 'Tempo integral',
  part_time: 'Meio período',
  freelance: 'Freelance',
  internship: 'Estágio',
  temporary: 'Temporário',
};
export const GEO_LABEL: Record<GeoTag, string> = {
  worldwide: 'Mundial',
  americas: 'Américas',
  latam: 'LATAM',
  brazil: 'Brasil',
  us_only: 'Só EUA',
  canada_only: 'Só Canadá',
  uk_only: 'Só Reino Unido',
  eu_only: 'Só Europa',
  restricted_other: 'Restrita (outro país)',
};
export const STATE_LABEL: Record<ApplicationState, string> = {
  new: 'Nova',
  reviewed: 'Revisada',
  want_to_apply: 'Quero me candidatar',
  applied: 'Candidatura enviada',
  interview: 'Entrevista',
  closed: 'Encerrada',
  rejected: 'Rejeitada',
  offer: 'Oferta',
};
export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  working: 'Funcionando',
  no_jobs: 'Sem vagas na última execução',
  failing: 'Com falha',
  never_run: 'Nunca executada',
  disabled: 'Desativada',
  requires_credential: 'Requer credencial',
  manual_link: 'Link manual',
  unavailable: 'Indisponível',
};
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  official_api: 'API oficial',
  public_feed: 'Feed público',
  public_page: 'Página pública',
  ats: 'ATS por empresa',
  requires_credential: 'API com chave',
  manual_link: 'Link manual',
  unavailable: 'Indisponível',
};
export const RUN_STATUS_LABEL: Record<string, string> = {
  running: 'Em andamento',
  success: 'Sucesso',
  partial: 'Parcial',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  skipped: 'Nada a executar',
  pending: 'Na fila',
};
export const LANGUAGE_LABEL: Record<string, string> = { pt: 'Português', en: 'Inglês', es: 'Espanhol', de: 'Alemão' };
