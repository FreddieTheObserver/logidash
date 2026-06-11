import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DriverAvailability,
  VehicleStatus,
  VehicleType,
} from '../../../generated/prisma/enums';

export class FactorContributionDto {
  @ApiProperty({
    enum: [
      'zoneFit',
      'routeProximity',
      'remainingCapacity',
      'workloadBalance',
      'deadlineFit',
      'priorityFit',
    ],
  })
  factor!: string;

  @ApiProperty() weight!: number;
  @ApiProperty({ description: 'Normalized 0-1 factor value' })
  rawValue!: number;
  @ApiProperty({ description: 'rawValue * weight * 100 (1 dp)' })
  weighted!: number;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional({
    description: 'True when route data was estimated/unavailable',
  })
  degraded?: boolean;
}

export class CandidateVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: VehicleType }) type!: VehicleType;
  @ApiProperty({ enum: VehicleStatus }) status!: VehicleStatus;
  @ApiProperty() capacityWeight!: number;
}

export class CandidateDriverDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DriverAvailability })
  availability!: DriverAvailability;
  @ApiProperty() baseZoneId!: string;
  @ApiProperty() activeJobCount!: number;
  @ApiProperty() maxConcurrentJobs!: number;
  @ApiPropertyOptional({ type: CandidateVehicleDto, nullable: true })
  vehicle!: CandidateVehicleDto | null;
}

export class RecommendationCandidateDto {
  @ApiProperty() id!: string;
  @ApiProperty() driverId!: string;
  @ApiProperty({ type: CandidateDriverDto }) driver!: CandidateDriverDto;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ description: '0–100 weighted score (0 when ineligible)' })
  score!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) rank!: number | null;
  @ApiProperty({ type: [FactorContributionDto] })
  explanation!: FactorContributionDto[];
  @ApiPropertyOptional({ type: [String], nullable: true })
  ineligibleReasons!: string[] | null;
}

export class ScoringWeightsDto {
  @ApiProperty() zoneFit!: number;
  @ApiProperty() routeProximity!: number;
  @ApiProperty() remainingCapacity!: number;
  @ApiProperty() workloadBalance!: number;
  @ApiProperty() deadlineFit!: number;
  @ApiProperty() priorityFit!: number;
}

export class RecommendationRunDto {
  @ApiProperty() id!: string;
  @ApiProperty() deliveryId!: string;
  @ApiProperty() requestedByUserId!: string;
  @ApiProperty({ type: ScoringWeightsDto }) weights!: ScoringWeightsDto;
  @ApiProperty({
    type: [RecommendationCandidateDto],
    description: 'Eligible first (by rank asc), then ineligible',
  })
  candidates!: RecommendationCandidateDto[];
  @ApiProperty() createdAt!: Date;
}
