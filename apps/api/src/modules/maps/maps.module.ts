import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveMapsProvider, type Env } from '../../config/env.validation';
import { MAPS_PROVIDER, type MapsProvider } from './maps-provider.interface';
import { MapsService } from './maps.service';
import { MockMapsProvider } from './providers/mock-maps.provider';
import { OrsMapsProvider } from './providers/ors-maps.provider';

@Module({
  providers: [
    {
      provide: MAPS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MapsProvider => {
        const selected = resolveMapsProvider({
          MAPS_PROVIDER: config.get('MAPS_PROVIDER', { infer: true }),
          ORS_API_KEY: config.get('ORS_API_KEY', { infer: true }),
        });
        if (selected === 'ors') {
          return new OrsMapsProvider({
            // resolveMapsProvider only selects 'ors' when a key exists (the
            // env schema also fails fast on an explicit ors without a key).
            apiKey: config.get('ORS_API_KEY', { infer: true }),
            baseUrl: config.get('ORS_BASE_URL', { infer: true }),
            timeoutMs: config.get('ORS_TIMEOUT_MS', { infer: true }),
          });
        }
        return new MockMapsProvider();
      },
    },
    MapsService,
  ],
  exports: [MapsService],
})
export class MapsModule {}
