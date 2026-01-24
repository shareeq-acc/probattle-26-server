import { latLngToCell, gridDisk, cellToBoundary } from 'h3-js';

export const calculateH3Index = (latitude: number, longitude: number): string => {
  const resolution = parseInt(process.env.H3_RESOLUTION || '9');
  return latLngToCell(latitude, longitude, resolution);
};

export const getH3CellsInRadius = (latitude: number, longitude: number, radiusKm: number): string[] => {
  const resolution = parseInt(process.env.H3_RESOLUTION || '9');
  const centerCell = latLngToCell(latitude, longitude, resolution);
  
  // Approximate ring size based on radius
  // H3 resolution 9 has ~174m edge length, so we calculate rings needed
  const ringSize = Math.ceil(radiusKm * 1000 / 174);
  
  return gridDisk(centerCell, ringSize);
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};