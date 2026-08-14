import { scaleSparklinePoints, type SparklinePoint } from './sparklineMath';

interface SparklineProps {
  points: SparklinePoint[];
  label: string;
}

const VIEW_BOX = '0 0 200 50';

/**
 * Hand-rolled inline-SVG sparkline — no charting library (scope decision:
 * "minimal frontend" excludes any charting library).
 */
export function Sparkline({ points, label }: SparklineProps) {
  const scaled = scaleSparklinePoints(points ?? []);

  if (scaled.points.length === 0) {
    return (
      <figure className="sparkline" data-testid="weather-sparkline">
        <figcaption className="sparkline__caption">
          {label}: {scaled.trendSummary}
        </figcaption>
      </figure>
    );
  }

  const ariaLabel = `${label}: ${scaled.trendSummary}`;

  return (
    <figure className="sparkline" data-testid="weather-sparkline">
      <svg
        className="sparkline__svg"
        viewBox={VIEW_BOX}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {scaled.points.length === 1 ? (
          <circle
            cx={scaled.points[0]?.x ?? 0}
            cy={scaled.points[0]?.y ?? 0}
            r={2.5}
            className="sparkline__dot"
          />
        ) : (
          <polyline
            className="sparkline__line"
            points={scaled.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
          />
        )}
      </svg>
      <figcaption className="sparkline__caption">{label}</figcaption>
    </figure>
  );
}
