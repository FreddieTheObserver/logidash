import { describe, it, expect } from 'vitest';
import { allowedTransitions } from './delivery-transitions';

describe('allowedTransitions', () => {
  it('omits ->assigned for dispatchers (assign flow only)', () => {
    const t = allowedTransitions('ready', 'dispatcher', false);
    expect(t).toContain('cancelled');
    expect(t).not.toContain('assigned');
  });
  it('gives drivers only their own operational path', () => {
    expect(allowedTransitions('assigned', 'driver', true)).toEqual([
      'picked_up',
    ]);
    expect(allowedTransitions('assigned', 'driver', false)).toEqual([]);
  });
  it('gives viewers nothing', () => {
    expect(allowedTransitions('ready', 'viewer', false)).toEqual([]);
  });
});
