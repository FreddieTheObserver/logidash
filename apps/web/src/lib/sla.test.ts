import { describe, it, expect } from 'vitest';
import { deriveSla } from './sla';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const at = (min: number) => new Date(NOW + min * 60_000).toISOString();

describe('deriveSla', () => {
  it('returns null for terminal statuses', () => {
    expect(deriveSla('delivered', at(-10), NOW)).toBeNull();
    expect(deriveSla('cancelled', at(-10), NOW)).toBeNull();
    expect(deriveSla('failed', at(10), NOW)).toBeNull();
  });
  it('classifies non-terminal deliveries', () => {
    expect(deriveSla('ready', at(-1), NOW)).toBe('breached');
    expect(deriveSla('assigned', at(30), NOW)).toBe('at-risk');
    expect(deriveSla('in_transit', at(200), NOW)).toBe('on-track');
  });
});
