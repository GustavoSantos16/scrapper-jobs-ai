import { z } from 'zod';
import { ContractType, GeoTag, RemoteType, Seniority } from './domain.ts';

export const ScoringWeights = z.object({
  title: z.number().min(0).max(100),
  primaryTech: z.number().min(0).max(100),
  complementaryTech: z.number().min(0).max(100),
  remote: z.number().min(0).max(100),
  geo: z.number().min(0).max(100),
  contract: z.number().min(0).max(100),
  seniority: z.number().min(0).max(100),
  recency: z.number().min(0).max(100),
  salary: z.number().min(0).max(100),
});
export type ScoringWeights = z.infer<typeof ScoringWeights>;

export const Profile = z.object({
  roles: z.array(z.string().min(1)).max(50),
  primaryTech: z.array(z.string().min(1)).max(50),
  complementaryTech: z.array(z.string().min(1)).max(50),
  /** Keywords the connectors use when a source supports search. */
  searchTerms: z.array(z.string().min(1)).max(20),
  remoteTypes: z.array(RemoteType),
  acceptedGeo: z.array(GeoTag),
  contractTypes: z.array(ContractType),
  seniorities: z.array(Seniority),
  languages: z.array(z.string()),
  preferredCurrencies: z.array(z.string().length(3)),
  weights: ScoringWeights,
});
export type Profile = z.infer<typeof Profile>;

export const DEFAULT_WEIGHTS: ScoringWeights = {
  title: 20,
  primaryTech: 25,
  complementaryTech: 5,
  remote: 15,
  geo: 15,
  contract: 5,
  seniority: 7,
  recency: 5,
  salary: 3,
};

export const DEFAULT_PROFILE: Profile = {
  roles: [
    'Frontend',
    'Front-end',
    'React',
    'Angular',
    'React Native',
    'Mobile',
    'Ionic',
    'JavaScript',
    'TypeScript',
    'Full Stack',
    'Fullstack',
    'Software Engineer',
    'Desenvolvedor',
  ],
  primaryTech: ['React', 'Angular', 'React Native', 'Ionic', 'JavaScript', 'TypeScript', 'Expo'],
  complementaryTech: ['Node.js', 'REST', 'Firebase', 'PostgreSQL', 'MySQL', 'HTML', 'CSS'],
  searchTerms: ['react', 'angular', 'frontend', 'react native', 'typescript', 'ionic'],
  remoteTypes: ['remote'],
  acceptedGeo: ['worldwide', 'americas', 'latam', 'brazil'],
  contractTypes: ['clt', 'pj', 'contractor', 'full_time', 'freelance'],
  seniorities: ['mid', 'senior'],
  languages: ['pt', 'en'],
  preferredCurrencies: ['USD', 'BRL'],
  weights: DEFAULT_WEIGHTS,
};
