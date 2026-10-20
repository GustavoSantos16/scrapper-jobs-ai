import type { AnyConnector } from '../types.ts';
import { himalayas } from './himalayas.ts';
import { jobicy } from './jobicy.ts';
import { remoteok } from './remoteok.ts';

export const CONNECTORS: AnyConnector[] = [jobicy, remoteok, himalayas];

export function getConnector(id: string): AnyConnector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export { himalayas, jobicy, remoteok };
