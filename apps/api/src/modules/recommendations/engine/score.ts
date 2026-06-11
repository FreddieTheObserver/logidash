import type { RouteResult } from '../../maps/maps-provider.interface';
import {
  deadlineFit,
  priorityFit,
  remainingCapacity,
  routeProximity,
  workloadBalance,
  zoneFit,
} from './factors';
import type {
  DeliveryContext,
  DriverContext,
  FactorContribution,
  FactorName,
  FactorResult,
  ScoringWeights,
} from './types';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type ScoredCandidate = {
  driverId: string;
  score: number;
  explanation: FactorContribution[];
};

/**
 * Spec §7 stage 2. weighted = rawValue × weight × 100 (1 dp) so the UI's
 * per-factor table sums exactly to the stored score (2 dp, fits Decimal(5,2)).
 */
export function scoreCandidate(
  driver: DriverContext,
  delivery: DeliveryContext,
  route: RouteResult | null,
  now: Date,
  weights: ScoringWeights,
): ScoredCandidate {
  const results: Record<FactorName, FactorResult> = {
    zoneFit: zoneFit(driver, delivery),
    routeProximity: routeProximity(driver, delivery, route),
    remainingCapacity: remainingCapacity(driver, delivery),
    workloadBalance: workloadBalance(driver),
    deadlineFit: deadlineFit(driver, delivery, route, now),
    priorityFit: priorityFit(driver, delivery),
  };
  const explanation = (Object.keys(results) as FactorName[]).map(
    (factor): FactorContribution => {
      const { value, reason, degraded } = results[factor];
      return {
        factor,
        weight: weights[factor],
        rawValue: value,
        weighted: round1(value * weights[factor] * 100),
        reason,
        ...(degraded ? { degraded } : {}),
      };
    },
  );
  const score = round2(explanation.reduce((sum, f) => sum + f.weighted, 0));
  return { driverId: driver.driverId, score, explanation };
}

/** Score desc, then driverId asc — a total order keeps runs deterministic. */
export function rankCandidates(
  candidates: ScoredCandidate[],
): (ScoredCandidate & { rank: number })[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || a.driverId.localeCompare(b.driverId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
