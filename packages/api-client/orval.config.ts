import { defineConfig } from 'orval';

export default defineConfig({
  logidash: {
    input: {
      target: '../../apps/api/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: {
          path: './src/http/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
