import { describe, it, expect } from 'vitest';
import { fromNow, deadlineState, initials } from './format';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();
const at = (minFromNow: number) =>
  new Date(NOW + minFromNow * 60_000).toISOString();

describe('fromNow', () => {
  it('formats past and future', () => {
    expect(fromNow(at(0), NOW)).toBe('now');
    expect(fromNow(at(-5), NOW)).toBe('5m ago');
    expect(fromNow(at(-150), NOW)).toBe('2h 30m ago');
    expect(fromNow(at(90), NOW)).toBe('in 1h 30m');
    expect(fromNow(at(60 * 24 * 2), NOW)).toBe('in 2d');
  });
});

describe('deadlineState', () => {
  it('classifies breached / at-risk / on-track', () => {
    expect(deadlineState(at(-1), NOW)).toBe('breached');
    expect(deadlineState(at(30), NOW)).toBe('at-risk');
    expect(deadlineState(at(200), NOW)).toBe('on-track');
  });
});

describe('initials', () => {
  it('derives up to two uppercase initials', () => {
    expect(initials('Priya Kumar')).toBe('PK');
    expect(initials('Cher')).toBe('C');
    expect(initials('Ana Maria Silva')).toBe('AM');
    expect(initials('  ')).toBe('?');
  });
});
