export type GridPin = {
  index: number;
  latitude: number;
  longitude: number;
};

/** Haversine distance in km between two WGS84 points. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Square grid centered on (centerLat, centerLng). Spacing is chosen so corner
 * pins sit roughly `radiusKm` from center along both axes.
 */
export function buildGridPins(input: {
  centerLatitude: number;
  centerLongitude: number;
  gridSize: number;
  radiusKm: number;
}): GridPin[] {
  const size = Math.max(3, Math.min(15, input.gridSize));
  if (size % 2 === 0) {
    throw new Error("gridSize must be odd (e.g. 5 for 25 pins)");
  }

  const half = (size - 1) / 2;
  const kmPerDegLat = 111.32;
  const kmPerDegLng =
    111.32 * Math.cos((input.centerLatitude * Math.PI) / 180);
  const stepLat = input.radiusKm / kmPerDegLat / half;
  const stepLng = input.radiusKm / kmPerDegLng / half;

  const pins: GridPin[] = [];
  let index = 0;
  for (let row = -half; row <= half; row++) {
    for (let col = -half; col <= half; col++) {
      const latitude = input.centerLatitude + row * stepLat;
      const longitude = input.centerLongitude + col * stepLng;
      pins.push({ index: index++, latitude, longitude });
    }
  }

  return pins;
}

export function formatLocationCoordinate(
  latitude: number,
  longitude: number,
  radiusMeters = 500,
): string {
  return `${latitude.toFixed(7)},${longitude.toFixed(7)},${radiusMeters}`;
}

export function pinCountForGridSize(gridSize: number): number {
  return gridSize * gridSize;
}

export function maxGridRadiusKm(
  centerLatitude: number,
  pin: GridPin,
): number {
  return haversineKm(
    centerLatitude,
    pin.longitude,
    pin.latitude,
    pin.longitude,
  );
}
