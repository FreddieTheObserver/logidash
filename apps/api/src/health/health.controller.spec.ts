import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports an ok status', () => {
    expect(controller.check().status).toBe('ok');
  });

  it('includes an ISO timestamp', () => {
    const { timestamp } = controller.check();
    expect(typeof timestamp).toBe('string');
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
