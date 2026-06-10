import { MapsProviderError } from '../maps-provider.interface';
import { OrsMapsProvider } from './ors-maps.provider';

const OPTIONS = {
  apiKey: 'test-key',
  baseUrl: 'https://ors.example.com',
  timeoutMs: 5000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

async function expectMapsError(
  promise: Promise<unknown>,
  kind: MapsProviderError['kind'],
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MapsProviderError);
  expect((error as MapsProviderError).kind).toBe(kind);
}

describe('OrsMapsProvider', () => {
  const provider = new OrsMapsProvider(OPTIONS);
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('geocode', () => {
    const geocodeBody = {
      features: [
        { geometry: { type: 'Point', coordinates: [100.5018, 13.7563] } },
      ],
    };

    it('calls the geocode endpoint with the address, size=1, and the API key', async () => {
      fetchMock.mockResolvedValue(jsonResponse(geocodeBody));
      await provider.geocode('123 Main Street');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.origin).toBe('https://ors.example.com');
      expect(url.pathname).toBe('/geocode/search');
      expect(url.searchParams.get('text')).toBe('123 Main Street');
      expect(url.searchParams.get('size')).toBe('1');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'test-key',
      );
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('flips GeoJSON [lng, lat] into a GeoPoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse(geocodeBody));
      await expect(provider.geocode('123 Main Street')).resolves.toEqual({
        lat: 13.7563,
        lng: 100.5018,
      });
    });

    it('resolves null when the provider finds no match', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
      await expect(provider.geocode('nowhere')).resolves.toBeNull();
    });

    it('throws an http error on a malformed body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
      await expectMapsError(provider.geocode('123 Main Street'), 'http');
    });
  });

  describe('route', () => {
    const origin = { lat: 13.7563, lng: 100.5018 };
    const dest = { lat: 13.81, lng: 100.55 };
    const directionsBody = {
      routes: [{ summary: { distance: 8123.4, duration: 1042.6 } }],
    };

    it('posts GeoJSON-ordered coordinates to the directions endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse(directionsBody));
      await provider.route(origin, dest);

      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe('/v2/directions/driving-car');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        coordinates: [
          [100.5018, 13.7563],
          [100.55, 13.81],
        ],
      });
    });

    it('rounds distance and duration to integers', async () => {
      fetchMock.mockResolvedValue(jsonResponse(directionsBody));
      await expect(provider.route(origin, dest)).resolves.toEqual({
        distanceMeters: 8123,
        durationSeconds: 1043,
      });
    });

    it('throws an http error on a malformed body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ routes: [{}] }));
      await expectMapsError(provider.route(origin, dest), 'http');
    });
  });

  describe('error mapping', () => {
    it('maps a non-2xx response to an http error', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 401));
      await expectMapsError(provider.geocode('123 Main Street'), 'http');
    });

    it('maps an aborted request to a timeout error', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      fetchMock.mockRejectedValue(timeoutError);
      await expectMapsError(provider.geocode('123 Main Street'), 'timeout');
    });

    it('maps a connection failure to a network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expectMapsError(provider.geocode('123 Main Street'), 'network');
    });

    it('maps a non-JSON body to an http error', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });
      await expectMapsError(provider.geocode('123 Main Street'), 'http');
    });

    it('never leaks the API key in error messages', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      const error = await provider.geocode('123 Main Street').then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(error?.message).not.toContain('test-key');
    });
  });
});
