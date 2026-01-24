interface NominatimResponse {
  display_name: string;
  name: string;
  address: {
    neighbourhood?: string,
    commercial?: string;
    suburb?: string;
    city_district?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    city?: string,
  };
}

export interface LocationData {
  city: string;
  location: string; // neighbourhood
  fullAddress: string;
}

export const reverseGeocode = async (latitude: number, longitude: number): Promise<LocationData> => {
  try {
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=en&zoom=18`,
      {
        headers: {
          'User-Agent': 'Neighbourly-App/1.0 seerijj00@gmail.com'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status}`);
    }

    const data = await response.json() as NominatimResponse;

    if (!data || !data.address) {
      throw new Error('Invalid geocoding response');
    }

    // Extract city name (try different fields)
    const city = data.address.city || data.address.city_district ||
      data.address.town ||
      data.address.village ||
      data.address.state ||
      'Unknown City';

    // Extract neighbourhood/location (try different fields)
    const location = data.address.neighbourhood || data.address.town ||
      data.name || data.address.commercial ||
      data.address.suburb ||
      city; // fallback to city if no neighbourhood

    return {
      city,
      location,
      fullAddress: data.display_name || `${latitude}, ${longitude}`
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);

    // Return fallback data if geocoding fails
    return {
      city: 'Unknown City',
      location: 'Unknown Location',
      fullAddress: `${latitude}, ${longitude}`
    };
  }
};