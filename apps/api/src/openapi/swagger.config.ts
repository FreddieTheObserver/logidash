import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Stable operationIds drive the generated client's hook names:
 * ZonesController.list -> "zonesList" -> useZonesList(). Nest's default id
 * (ZonesController_list) works but produces useZonesControllerList.
 */
function operationIdFactory(controllerKey: string, methodKey: string): string {
  const resource = controllerKey.replace(/Controller$/, '');
  return (
    resource.charAt(0).toLowerCase() +
    resource.slice(1) +
    methodKey.charAt(0).toUpperCase() +
    methodKey.slice(1)
  );
}

/**
 * Single source of truth for the OpenAPI document — used by main.ts (/docs)
 * and the gen:openapi script, so the served and emitted contracts can't drift.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('logidash API')
    .setDescription(
      'Logistics dispatch API — contract-first OpenAPI surface. ' +
        'All business routes are versioned under /v1.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, { operationIdFactory });
}
