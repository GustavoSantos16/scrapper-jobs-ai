import { fileURLToPath } from 'node:url';

export const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
