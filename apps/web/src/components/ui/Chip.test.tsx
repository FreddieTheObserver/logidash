import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreChip, StatusChip } from './Chip';

describe('chips', () => {
  it('shows Ineligible when not eligible', () => {
    render(<ScoreChip score={0} eligible={false} />);
    expect(screen.getByText('Ineligible')).toBeInTheDocument();
  });
  it('labels delivery status', () => {
    render(<StatusChip status="in_transit" />);
    expect(screen.getByText('In transit')).toBeInTheDocument();
  });
});
