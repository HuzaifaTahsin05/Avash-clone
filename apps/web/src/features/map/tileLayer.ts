// OSM tile layer constants (ADR-013). Values match docs/constants-registry.md
// exactly — no tile URL literal may appear anywhere else under apps/web/src.

/** registry row: MAP_TILE_URL_TEMPLATE */
export const MAP_TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** registry row: MAP_TILE_ATTRIBUTION */
export const MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors';

/** registry row: MAP_TILE_MAX_ZOOM */
export const MAP_TILE_MAX_ZOOM = 19;

/** registry row: MAP_DEFAULT_CENTER (Dhaka) */
export const MAP_DEFAULT_CENTER: [number, number] = [23.78, 90.4];

/** registry row: MAP_DEFAULT_ZOOM */
export const MAP_DEFAULT_ZOOM = 7;
