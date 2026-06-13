import { describe, it, expect } from 'vitest';
import { DELIVERY_TONE, DELIVERY_LABEL, scoreTone, SLA_TONE } from './tone';

describe('tone maps', () => {
  it('maps delivery status to tone + label', () => {
    expect(DELIVERY_TONE.assigned).toBe('primary');
    expect(DELIVERY_TONE.delivered).toBe('success');
    expect(DELIVERY_LABEL.in_transit).toBe('In transit');
  });
  it('maps score to tone', () => {
    expect(scoreTone(85)).toBe('success');
    expect(scoreTone(60)).toBe('warning');
    expect(scoreTone(20)).toBe('neutral');
  });
  it('maps SLA state to tone', () => {
    expect(SLA_TONE.breached).toBe('danger');
  });
});
