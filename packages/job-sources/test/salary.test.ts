import { describe, expect, it } from 'vitest';
import { normalizeCurrency, normalizePeriod, parseAmount, parseSalaryText, structuredSalary } from '../src/index.ts';

describe('parseAmount', () => {
  it.each([
    ['120,000', 120000],
    ['120.000', 120000],
    ['120k', 120000],
    ['1.5k', 1500],
    ['8.500,50', 8500.5],
    ['8,500.50', 8500.5],
    ['1,234,567', 1234567],
    ['95', 95],
    ['12.5', 12.5],
  ])('%s → %s', (raw, n) => expect(parseAmount(raw)).toBe(n));

  it.each(['', 'abc', '0', '1,2,3'])('rejects %s', (raw) => expect(parseAmount(raw)).toBeNull());
});

describe('normalizeCurrency / normalizePeriod', () => {
  it.each([
    ['R$ 8.000', 'BRL'],
    ['US$ 5,000', 'USD'],
    ['$120k', 'USD'],
    ['€60,000', 'EUR'],
    ['£50k', 'GBP'],
    ['usd', 'USD'],
    ['CAD 90000', 'CAD'],
    ['8000 reais', 'BRL'],
  ])('%s → %s', (raw, code) => expect(normalizeCurrency(raw)).toBe(code));

  it('has no currency for plain numbers', () => expect(normalizeCurrency('8000')).toBeNull());

  it.each([
    ['yearly', 'year'],
    ['annual', 'year'],
    ['/ year', 'year'],
    ['per month', 'month'],
    ['por mês', 'month'],
    ['por mes', 'month'],
    ['mensal', 'month'],
    ['hourly', 'hour'],
    ['per task', 'task'],
  ])('%s → %s', (raw, p) => expect(normalizePeriod(raw)).toBe(p));
});

describe('parseSalaryText', () => {
  it('parses ranges with symbols and k', () => {
    expect(parseSalaryText('$120k - $150k/year')).toEqual({ min: 120000, max: 150000, currency: 'USD', period: 'year' });
  });
  it('parses Brazilian format', () => {
    expect(parseSalaryText('R$ 8.000 a 12.000 por mes')).toEqual({ min: 8000, max: 12000, currency: 'BRL', period: 'month' });
  });
  it('parses euro ranges with en dash', () => {
    expect(parseSalaryText('€60,000–€80,000')).toEqual({ min: 60000, max: 80000, currency: 'EUR', period: 'year' });
  });
  it('parses per-task pay (real Remotive sample)', () => {
    expect(parseSalaryText('$1000 per task')).toEqual({ min: 1000, max: null, currency: 'USD', period: 'task' });
  });
  it('returns nulls when there is no currency or number', () => {
    expect(parseSalaryText('Competitive')).toEqual({ min: null, max: null, currency: null, period: null });
    expect(parseSalaryText('100000')).toEqual({ min: null, max: null, currency: null, period: null });
    expect(parseSalaryText(null).min).toBeNull();
  });
  it('uses a fallback currency only when given', () => {
    expect(parseSalaryText('100000 - 120000', 'USD').currency).toBe('USD');
  });
});

describe('structuredSalary', () => {
  it('treats 0 as not provided (Remote OK)', () => {
    expect(structuredSalary(0, 0, 'USD', null)).toEqual({ min: null, max: null, currency: null, period: null });
  });
  it('maps structured values', () => {
    expect(structuredSalary(190000, 230000, 'USD', 'yearly')).toEqual({ min: 190000, max: 230000, currency: 'USD', period: 'year' });
  });
  it('drops an inverted max', () => {
    expect(structuredSalary(100, 50, 'usd', 'hourly')).toEqual({ min: 100, max: null, currency: 'USD', period: 'hour' });
  });
  it('uses max alone as min when min is missing', () => {
    expect(structuredSalary(null, 5000, 'BRL', 'monthly').min).toBe(5000);
  });
});
