import { ApiProperty } from '@nestjs/swagger';

export class DeliveryStatsDto {
  @ApiProperty() draft!: number;
  @ApiProperty() ready!: number;
  /** assigned + picked_up + in_transit */
  @ApiProperty() active!: number;
  /** non-terminal, deadline within the at-risk window */
  @ApiProperty() atRisk!: number;
  /** non-terminal, deadline in the past */
  @ApiProperty() breached!: number;
  /** draft + ready + active */
  @ApiProperty() open!: number;
}

export class DriverStatsDto {
  @ApiProperty() available!: number;
  @ApiProperty() busy!: number;
  @ApiProperty() offline!: number;
  @ApiProperty() total!: number;
}

export class DashboardStatsDto {
  @ApiProperty({ type: DeliveryStatsDto }) deliveries!: DeliveryStatsDto;
  @ApiProperty({ type: DriverStatsDto }) drivers!: DriverStatsDto;
}
