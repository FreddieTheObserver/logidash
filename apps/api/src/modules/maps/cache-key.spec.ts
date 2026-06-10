import { buildCacheKey, roundCoord } from './cache-key';

describe('roundCoord', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundCoord(13.75634999)).toBe(13.7563);
    expect(roundCoord(13.75635001)).toBe(13.7564);
    expect(roundCoord(-100.50185)).toBe(-100.5018);
  });

  it('keeps already-rounded values intact', () => {
    expect(roundCoord(13.7563)).toBe(13.7563);
    expect(roundCoord(0)).toBe(0);
  });
});

describe('buildCacheKey', () => {
  const origin = { lat: 13.7563, lng: 100.5018 };
  const dest = { lat: 13.746, lng: 100.5347 };

  it('formats both endpoints at fixed 4-decimal precision', () => {
    expect(buildCacheKey(origin, dest)).toBe(
      '13.7563,100.5018->13.7460,100.5347',
    );
  });

  it('collapses near-identical coordinates onto the same key', () => {
    const jittered = {
      origin: { lat: 13.75631, lng: 100.50179 },
      dest: { lat: 13.74601, lng: 100.53471 },
    };
    expect(buildCacheKey(jittered.origin, jittered.dest)).toBe(
      buildCacheKey(origin, dest),
    );
  });

  it('is direction-sensitive: A->B differs from B->A', () => {
    expect(buildCacheKey(origin, dest)).not.toBe(buildCacheKey(dest, origin));
  });
});
