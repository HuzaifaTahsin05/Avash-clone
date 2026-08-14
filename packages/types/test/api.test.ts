import { describe, test, expect } from 'vitest';
import {
  healthResponseSchema,
  healthDbResponseSchema,
  weatherObservationDtoSchema,
  latestWeatherResponseSchema,
  weatherHistoryResponseSchema,
  riskMapResponseSchema,
  riskDetailResponseSchema,
} from '../api';

describe('healthResponseSchema — round-trip', () => {
  const valid = {
    status: 'ok',
    version: '1.0.0',
    environment: 'development',
    timestamp: new Date().toISOString(),
    requestId: 'req-123',
  };

  test('accepts a well-formed payload', () => {
    expect(() => healthResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects a wrong-literal status', () => {
    expect(() => healthResponseSchema.parse({ ...valid, status: 'degraded' })).toThrow();
  });

  test('rejects a missing requestId', () => {
    const { requestId: _requestId, ...withoutRequestId } = valid;
    expect(() => healthResponseSchema.parse(withoutRequestId)).toThrow();
  });

  test('rejects a non-string version', () => {
    expect(() => healthResponseSchema.parse({ ...valid, version: 1 })).toThrow();
  });

  test('rejects a completely malformed payload rather than silently coercing it', () => {
    expect(() => healthResponseSchema.parse({ garbage: true })).toThrow();
    expect(() => healthResponseSchema.parse(null)).toThrow();
    expect(() => healthResponseSchema.parse('not an object')).toThrow();
  });
});

describe('healthDbResponseSchema — round-trip', () => {
  test('accepts a ready:true payload', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: true, reason: null, requestId: 'req-1' })
    ).not.toThrow();
  });

  test('accepts a ready:false payload with a reason', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: false, reason: 'database unreachable', requestId: 'req-2' })
    ).not.toThrow();
  });

  test('rejects a non-boolean ready field', () => {
    expect(() =>
      healthDbResponseSchema.parse({ ready: 'true', reason: null, requestId: 'req-3' })
    ).toThrow();
  });

  test('rejects a missing requestId', () => {
    expect(() => healthDbResponseSchema.parse({ ready: true, reason: null })).toThrow();
  });
});

describe('weatherObservationDtoSchema — round-trip', () => {
  const valid = {
    regionId: '11111111-1111-4111-8111-111111111111',
    regionCode: 'dhaka',
    regionName: 'Dhaka',
    observedAt: new Date().toISOString(),
    tempMeanC: 27.4,
    tempMinC: 24.1,
    tempMaxC: 31.0,
    humidityPct: 78,
    precipitationMm: null,
    source: 'openweathermap',
  };

  test('accepts a well-formed payload with nullable numerics', () => {
    expect(() => weatherObservationDtoSchema.parse(valid)).not.toThrow();
  });

  test('rejects a non-uuid regionId', () => {
    expect(() => weatherObservationDtoSchema.parse({ ...valid, regionId: 'not-a-uuid' })).toThrow();
  });
});

describe('latestWeatherResponseSchema — round-trip', () => {
  const valid = {
    observations: [],
    generatedAt: new Date().toISOString(),
    requestId: 'req-1',
  };

  test('accepts an empty observations array', () => {
    expect(() => latestWeatherResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects observations: null', () => {
    expect(() => latestWeatherResponseSchema.parse({ ...valid, observations: null })).toThrow();
  });
});

describe('weatherHistoryResponseSchema — round-trip', () => {
  const valid = {
    regionCode: 'dhaka',
    regionName: 'Dhaka',
    windowDays: 14,
    points: [{ observedAt: new Date().toISOString(), tempMeanC: 27, humidityPct: 80, precipitationMm: 0 }],
    generatedAt: new Date().toISOString(),
    requestId: 'req-2',
  };

  test('accepts a well-formed history payload', () => {
    expect(() => weatherHistoryResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects a missing regionCode', () => {
    const { regionCode: _regionCode, ...withoutRegionCode } = valid;
    expect(() => weatherHistoryResponseSchema.parse(withoutRegionCode)).toThrow();
  });
});

describe('riskMapResponseSchema — round-trip', () => {
  const valid = {
    type: 'FeatureCollection',
    features: [],
    horizonWeeks: 2,
    generatedAt: null,
    requestId: 'req-3',
  };

  test('accepts an empty FeatureCollection with null generatedAt', () => {
    expect(() => riskMapResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects a horizonWeeks outside {2, 4}', () => {
    expect(() => riskMapResponseSchema.parse({ ...valid, horizonWeeks: 3 })).toThrow();
  });
});

describe('riskDetailResponseSchema — round-trip', () => {
  const valid = {
    regionId: '11111111-1111-4111-8111-111111111111',
    regionCode: 'dhaka',
    regionName: 'Dhaka',
    predictions: [
      {
        horizonWeeks: 2,
        predictionDate: '2026-08-14',
        riskScore: 0.42,
        riskLevel: 'moderate',
        modelVersion: 'stub-0.0.0',
        isStub: true,
        topFactors: [],
        generatedAt: new Date().toISOString(),
      },
    ],
    latestWeather: null,
    requestId: 'req-4',
  };

  test('accepts predictions with null latestWeather', () => {
    expect(() => riskDetailResponseSchema.parse(valid)).not.toThrow();
  });

  test('rejects a riskScore outside [0, 1]', () => {
    const invalid = {
      ...valid,
      predictions: [{ ...valid.predictions[0], riskScore: 1.5 }],
    };
    expect(() => riskDetailResponseSchema.parse(invalid)).toThrow();
  });
});
