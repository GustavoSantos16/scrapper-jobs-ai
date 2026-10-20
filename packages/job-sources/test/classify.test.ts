import { describe, expect, it } from 'vitest';
import {
  detectContractTypes,
  detectCountry,
  detectLanguage,
  detectRemoteType,
  detectSeniority,
  detectTechnologies,
  geoFromLocation,
  geoFromText,
  mergeGeo,
  remoteTypeFromStructured,
  techFromTag,
} from '../src/index.ts';

describe('geoFromLocation (structured location fields)', () => {
  it.each([
    ['Worldwide', ['worldwide']],
    ['Anywhere in the World', ['worldwide']],
    ['Remote, Global', ['worldwide']],
    ['LATAM', ['latam']],
    ['Latin America', ['latam']],
    ['Americas', ['americas']],
    ['Brazil', ['brazil']],
    ['São Paulo, Brasil', ['brazil']],
    ['USA', ['us_only']],
    ['United States', ['us_only']],
    ['USA Only', ['us_only']],
    ['Canada', ['canada_only']],
    ['UK', ['uk_only']],
    ['Europe', ['eu_only']],
    ['Germany', ['eu_only']],
    ['Philippines', ['restricted_other']],
    ['Remote', []],
    ['', []],
  ])('%s → %j', (loc, tags) => {
    expect(geoFromLocation(loc).sort()).toEqual([...tags].sort());
  });

  it('lists with an eligible region are eligible even if they also name the US', () => {
    expect(geoFromLocation('USA, LATAM')).toEqual(['latam']);
  });
});

describe('geoFromText (explicit phrases only)', () => {
  it.each([
    ['This role is US only.', ['us_only']],
    ['Candidates must be located in the United States.', ['us_only']],
    ['You must be authorized to work in the US without sponsorship', ['us_only']],
    ['EU only, sorry', ['eu_only']],
    ['must be based in Europe', ['eu_only']],
    ['We hire from anywhere in the world', ['worldwide']],
    ['Remote (Worldwide)', ['worldwide']],
    ['Open to candidates in LATAM', ['latam']],
    ['Remote - LATAM', ['latam']],
    ['Senior Engineer (LATAM)', ['latam']],
    ['We hire engineers across Latin America', ['latam']],
    ['We are a leading LATAM nearshore company', []],
    ['Our clients in Latin America love us', []],
    ['Vaga remota para residentes no Brasil', ['brazil']],
    ['Remote Brazil', ['brazil']],
    ['Our office is in New York and we love tacos', []],
    ['We have customers in Brazil and the US', []],
  ])('%s → %j', (text, tags) => {
    expect(geoFromText(text).sort()).toEqual([...tags].sort());
  });
});

describe('mergeGeo', () => {
  it('drops restrictions when an eligible tag exists', () => {
    expect(mergeGeo(['us_only', 'eu_only'], ['brazil'])).toEqual(['brazil']);
    expect(mergeGeo(['us_only'], ['eu_only'])).toEqual(['us_only', 'eu_only']);
    expect(mergeGeo([], [])).toEqual([]);
  });
});

describe('detectRemoteType', () => {
  it.each([
    ['Senior React Engineer (Remote)', 'remote'],
    ['Desenvolvedor Frontend - 100% Remoto', 'remote'],
    ['Home office', 'remote'],
    ['Hybrid - 2 days in office', 'hybrid'],
    ['Híbrido em São Paulo', 'hybrid'],
    ['On-site in Berlin', 'onsite'],
    ['Presencial', 'onsite'],
    ['Frontend Engineer', 'unknown'],
  ])('%s → %s', (t, r) => expect(detectRemoteType(t)).toBe(r));

  it('maps structured workplace values', () => {
    expect(remoteTypeFromStructured('remote')).toBe('remote');
    expect(remoteTypeFromStructured('on-site')).toBe('onsite');
    expect(remoteTypeFromStructured('Homeoffice')).toBe('remote');
    expect(remoteTypeFromStructured('hybrid')).toBe('hybrid');
    expect(remoteTypeFromStructured(null)).toBe('unknown');
  });
});

describe('detectSeniority', () => {
  it.each([
    ['Senior Frontend Engineer', 'senior'],
    ['Sr. React Developer', 'senior'],
    ['Desenvolvedor Pleno Angular', 'mid'],
    ['Desenvolvedor Júnior', 'junior'],
    ['Jr Frontend', 'junior'],
    ['Staff Software Engineer', 'staff'],
    ['Senior Staff Engineer', 'staff'],
    ['Principal Engineer', 'principal'],
    ['Tech Lead Frontend', 'lead'],
    ['Estágio em Desenvolvimento', 'intern'],
    ['Software Engineer II', 'mid'],
    ['Software Engineer III', 'senior'],
    ['Software Engineer I', 'junior'],
    ['Software Engineer II - Payments (Remote)', 'mid'],
    ['Frontend Engineer', 'unknown'],
    ['Desenvolvedor Especialista Frontend React Native', 'senior'],
  ])('%s → %s', (title, s) => expect(detectSeniority(title)).toBe(s));

  it('falls back to structured hints', () => {
    expect(detectSeniority('Frontend Engineer', 'Senior')).toBe('senior');
    expect(detectSeniority('Frontend Engineer', 'Mid-Level')).toBe('mid');
  });

  it('does not read roman numerals from hint text', () => {
    expect(detectSeniority('Frontend Engineer', 'Team i')).toBe('unknown');
  });
});

describe('detectContractTypes', () => {
  it('detects Brazilian contract terms', () => {
    expect(detectContractTypes('Contratação CLT ou PJ').sort()).toEqual(['clt', 'pj']);
  });
  it('detects contractor and full-time', () => {
    expect(detectContractTypes('Full-Time').sort()).toEqual(['full_time']);
    expect(detectContractTypes('contract').sort()).toEqual(['contractor']);
    expect(detectContractTypes('Independent contractor, paid in USD')).toContain('contractor');
  });
  it('handles German permanent contracts', () => {
    expect(detectContractTypes('Unbefristeter arbeitsvertrag')).not.toContain('temporary');
  });
  it('returns [] when nothing is stated', () => {
    expect(detectContractTypes('Frontend Engineer')).toEqual([]);
  });
});

describe('detectTechnologies', () => {
  it('distinguishes React from React Native', () => {
    expect(detectTechnologies('React Native developer')).toEqual(['React Native']);
    expect(detectTechnologies('React and React Native')).toEqual(expect.arrayContaining(['React', 'React Native']));
    expect(detectTechnologies('ReactJS')).toContain('React');
  });
  it('does not confuse Java with JavaScript', () => {
    expect(detectTechnologies('JavaScript')).not.toContain('Java');
    expect(detectTechnologies('Java and Spring')).toContain('Java');
  });
  it('does not detect "go" in prose', () => {
    expect(detectTechnologies('we go to great lengths')).not.toContain('Go');
    expect(detectTechnologies('Golang microservices')).toContain('Go');
  });
  it('finds common frontend stack', () => {
    expect(detectTechnologies('TypeScript, Angular, Ionic, HTML5, CSS3, Node.js, REST APIs, Firebase')).toEqual(
      expect.arrayContaining(['TypeScript', 'Angular', 'Ionic', 'HTML', 'CSS', 'Node.js', 'REST', 'Firebase']),
    );
  });
  it('maps exact tags', () => {
    expect(techFromTag('go')).toBe('Go');
    expect(techFromTag('Typescript ')).toBe('TypeScript');
    expect(techFromTag('security')).toBeNull();
  });
});

describe('detectLanguage', () => {
  it('detects Portuguese, English and German', () => {
    expect(detectLanguage('Estamos procurando uma pessoa desenvolvedora para fazer parte do nosso time de tecnologia com experiência em React e que goste de desafios')).toBe('pt');
    expect(detectLanguage('We are looking for a senior engineer to join our team and you will work with the best people in the world')).toBe('en');
    expect(detectLanguage('Wir suchen eine erfahrene Person für unser Team und die Arbeit mit der neuen Plattform ist spannend')).toBe('de');
  });
  it('returns null for short text', () => expect(detectLanguage('React dev')).toBeNull());
});

describe('detectCountry', () => {
  it.each([
    ['Brazil', 'BR'],
    ['Rio de Janeiro, Rio de Janeiro', 'BR'],
    ['Dortmund', null],
    ['Berlin', 'DE'],
    ['BR', 'BR'],
    ['uk', 'GB'],
    ['New York or London', null], // ambiguous → null
  ])('%s → %s', (loc, code) => expect(detectCountry(loc)).toBe(code));
});
