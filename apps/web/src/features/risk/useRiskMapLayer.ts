import { useEffect, useRef, type RefObject } from 'react';
import L from 'leaflet';
import type { RiskMapResponse } from '@avash/types';
import { RISK_LEVEL_BAND_STYLES } from './riskLevelBands';

/**
 * Adds the risk-map GeoJSON FeatureCollection as an overlay on top of the
 * OSM basemap (frontend.md's overlay/basemap split — this is "us", never
 * the tile concern). Replaces the previous layer whenever `data` changes
 * and removes it on unmount so stale regions never linger after a refetch.
 */
export function useRiskMapLayer(
  mapRef: RefObject<L.Map | null>,
  data: RiskMapResponse | undefined,
  onRegionClick: (regionId: string) => void,
) {
  const layerRef = useRef<L.GeoJSON | null>(null);
  const onRegionClickRef = useRef(onRegionClick);
  onRegionClickRef.current = onRegionClick;

  useEffect(() => {
    const map = mapRef?.current;
    if (!map) {
      return undefined;
    }

    layerRef.current?.remove();
    layerRef.current = null;

    const features = data?.features ?? [];
    if (features.length === 0) {
      return undefined;
    }

    const layer = L.geoJSON(
      { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
      {
        style: (feature) => {
          const riskLevel = feature?.properties?.riskLevel;
          const band = riskLevel ? RISK_LEVEL_BAND_STYLES[riskLevel as keyof typeof RISK_LEVEL_BAND_STYLES] : undefined;
          return {
            color: '#0b1220',
            weight: band?.weight ?? 1,
            dashArray: band?.dashArray ?? undefined,
            fillColor: band?.fillColor ?? '#666666',
            fillOpacity: 0.6,
          };
        },
        onEachFeature: (feature, featureLayer) => {
          const regionId = feature?.properties?.regionId;
          const regionName = feature?.properties?.regionName ?? 'Unknown region';
          featureLayer.bindTooltip(regionName);
          featureLayer.on('click', () => {
            if (regionId) {
              onRegionClickRef.current?.(regionId);
            }
          });
        },
      },
    );

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [mapRef, data]);
}
