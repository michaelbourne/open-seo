export type GridPin = {
  index: number;
  latitude: number;
  longitude: number;
};

/**
 * Square grid centered on (centerLat, centerLng). Spacing is chosen so corner
 * pins sit roughly `radiusKm` from center along both axes. `gridSize` is odd.
 */
export function buildGridPins(input: {
  centerLatitude: number;
  centerLongitude: number;
  gridSize: number;
  radiusKm: number;
}): GridPin[] {
  const size = input.gridSize;
  if (size % 2 === 0 || size < 3) {
    throw new Error("gridSize must be an odd number of at least 3");
  }

  const half = (size - 1) / 2;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((input.centerLatitude * Math.PI) / 180);
  const stepLat = input.radiusKm / kmPerDegLat / half;
  const stepLng = input.radiusKm / Math.max(kmPerDegLng, 0.01) / half;

  const pins: GridPin[] = [];
  let index = 0;
  // Row 0 is the north edge so a rendered grid reads like a map.
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      pins.push({
        index: index++,
        latitude: input.centerLatitude - row * stepLat,
        longitude: input.centerLongitude + col * stepLng,
      });
    }
  }
  return pins;
}

/** DataForSEO `location_coordinate`: `lat,lng,radiusMeters`. */
export function formatLocationCoordinate(
  latitude: number,
  longitude: number,
  radiusMeters = 200,
): string {
  return `${latitude.toFixed(7)},${longitude.toFixed(7)},${radiusMeters}`;
}
