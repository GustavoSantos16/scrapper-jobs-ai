import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, extractAtsKey, findAtsKeyInHtml } from '../src/index.ts';

describe('canonicalizeUrl', () => {
  it('removes utm and tracking params, fragments and trailing slashes', () => {
    expect(
      canonicalizeUrl('https://himalayas.app/companies/acme/jobs/react-dev/?utm_source=api&utm_medium=x#apply'),
    ).toBe('https://himalayas.app/companies/acme/jobs/react-dev');
    expect(canonicalizeUrl('https://boards.greenhouse.io/acme/jobs/123?gh_src=abc&ref=hn')).toBe(
      'https://boards.greenhouse.io/acme/jobs/123',
    );
  });

  it('lowercases the host, drops www and forces https', () => {
    expect(canonicalizeUrl('http://WWW.RemoteOK.com/remote-jobs/x-1')).toBe('https://remoteok.com/remote-jobs/x-1');
  });

  it('keeps meaningful params, sorted', () => {
    expect(canonicalizeUrl('https://x.test/jobs?b=2&a=1&utm_campaign=z')).toBe('https://x.test/jobs?a=1&b=2');
  });

  it('keeps the path case (ids can be case-sensitive)', () => {
    expect(canonicalizeUrl('https://ycombinator.com/companies/hazel-2/jobs/PpNKYBS-x')).toBe(
      'https://ycombinator.com/companies/hazel-2/jobs/PpNKYBS-x',
    );
  });

  it.each(['', null, 'not a url', 'javascript:alert(1)', 'ftp://x.test/a', 'mailto:a@b.c'])('rejects %s', (u) => {
    expect(canonicalizeUrl(u)).toBeNull();
  });

  it('treats equivalent URLs as equal', () => {
    const a = canonicalizeUrl('https://www.example.com/job/1/?utm_source=a');
    const b = canonicalizeUrl('http://example.com/job/1#top');
    expect(a).toBe(b);
  });
});

describe('extractAtsKey', () => {
  it.each([
    ['https://job-boards.greenhouse.io/vtex/jobs/6218060004', 'greenhouse:6218060004'],
    ['https://boards.greenhouse.io/gitlab/jobs/8123456002?gh_src=x', 'greenhouse:8123456002'],
    ['https://about.gitlab.com/jobs/apply/?gh_jid=8123456002', 'greenhouse:8123456002'],
    ['https://jobs.lever.co/ciandt/201a7aec-f1e0-4e46-af6a-18a9eaf3769c', 'lever:201a7aec-f1e0-4e46-af6a-18a9eaf3769c'],
    ['https://jobs.lever.co/ciandt/201A7AEC-F1E0-4E46-AF6A-18A9EAF3769C/apply', 'lever:201a7aec-f1e0-4e46-af6a-18a9eaf3769c'],
    ['https://jobs.ashbyhq.com/supabase/3b5d54ca-741b-45ac-bd3f-31605a0d3541/application', 'ashby:3b5d54ca-741b-45ac-bd3f-31605a0d3541'],
    ['https://apply.workable.com/acme/j/A1B2C3D4E5/', 'workable:A1B2C3D4E5'],
    ['https://acme.gupy.io/jobs/12756219?jobBoardSource=gupy_portal', 'gupy:12756219'],
    [
      'https://supergasbras.gupy.io/job/eyJqb2JJZCI6MTI3NTYyMTksInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0=?jobBoardSource=gupy_portal',
      'gupy:12756219',
    ],
  ])('%s → %s', (url, key) => {
    expect(extractAtsKey(url)).toBe(key);
  });

  it('returns null for job boards that are not ATSs', () => {
    expect(extractAtsKey('https://remotive.com/remote-jobs/software-development/x-2091158')).toBeNull();
    expect(extractAtsKey('nope')).toBeNull();
  });

  it('finds an ATS apply link inside description HTML', () => {
    const html = '<p>Apply <a href="https://example.com">here</a> or <a href="https://jobs.lever.co/acme/201a7aec-f1e0-4e46-af6a-18a9eaf3769c?lever-source=x">Lever</a></p>';
    expect(findAtsKeyInHtml(html)).toBe('lever:201a7aec-f1e0-4e46-af6a-18a9eaf3769c');
    expect(findAtsKeyInHtml('<p>no links</p>')).toBeNull();
  });
});
