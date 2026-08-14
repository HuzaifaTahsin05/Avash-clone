import { describe, test, expect } from 'vitest';
import { scaleSparklinePoints } from './sparklineMath';

describe('scaleSparklinePoints', () => {
  test('empty array yields no points and a "no data" summary', () => {
    const result = scaleSparklinePoints([]);
    expect(result.points).toEqual([]);
    expect(result.trendSummary).toBe('No data available');
  });

  test('a single point yields exactly one scaled point', () => {
    const result = scaleSparklinePoints([{ x: 0, y: 10 }]);
    expect(result.points).toHaveLength(1);
    expect(Number.isFinite(result.points[0]?.x)).toBe(true);
    expect(Number.isFinite(result.points[0]?.y)).toBe(true);
  });

  test('an all-null series yields no points and a "no data" summary', () => {
    const result = scaleSparklinePoints([
      { x: 0, y: null },
      { x: 1, y: null },
    ]);
    expect(result.points).toEqual([]);
    expect(result.trendSummary).toBe('No data available');
  });

  test('a flat series (min === max) does not divide by zero', () => {
    const result = scaleSparklinePoints([
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ]);
    expect(result.points).toHaveLength(3);
    for (const point of result.points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(result.trendSummary).toContain('Flat trend');
  });

  test('a rising series is described as trending up', () => {
    const result = scaleSparklinePoints([
      { x: 0, y: 1 },
      { x: 1, y: 5 },
    ]);
    expect(result.trendSummary).toContain('up');
  });

  test('a falling series is described as trending down', () => {
    const result = scaleSparklinePoints([
      { x: 0, y: 5 },
      { x: 1, y: 1 },
    ]);
    expect(result.trendSummary).toContain('down');
  });

  test('null values are filtered out of a mixed series', () => {
    const result = scaleSparklinePoints([
      { x: 0, y: 1 },
      { x: 1, y: null },
      { x: 2, y: 3 },
    ]);
    expect(result.points).toHaveLength(2);
  });
});
