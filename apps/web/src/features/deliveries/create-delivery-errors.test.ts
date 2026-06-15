import { describe, it, expect } from 'vitest';
import { mapDetailMessages } from './create-delivery-errors';

describe('mapDetailMessages', () => {
  it('routes each flat validation message to its field by leading token', () => {
    const { fields, rest } = mapDetailMessages([
      'reference should not be empty',
      'packageWeight must be a positive number',
    ]);
    expect(fields).toEqual({
      reference: 'reference should not be empty',
      packageWeight: 'packageWeight must be a positive number',
    });
    expect(rest).toEqual([]);
  });

  it('keeps the first message per field and sends unmatched ones to rest', () => {
    const { fields, rest } = mapDetailMessages([
      'reference should not be empty',
      'reference must be longer than 3 characters',
      'something global went wrong',
    ]);
    expect(fields.reference).toBe('reference should not be empty');
    expect(rest).toEqual(['something global went wrong']);
  });
});
