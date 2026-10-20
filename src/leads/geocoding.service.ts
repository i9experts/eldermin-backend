import { Injectable, Logger } from '@nestjs/common';

export interface ReverseGeocodeResult {
  country?: string;
  city?: string;
  district?: string;
}

// Free, no-API-key reverse geocoding for parent-app signups (low/moderate
// volume - one lookup per registration, not bulk). If this volume grows into
// the hundreds/day, Nominatim's usage policy (max 1 req/s, no heavy use)
// means swapping to a paid provider (Google Geocoding, Mapbox) becomes the
// right call - not needed yet.
//
// Geocoding is a nice-to-have on top of the account, never a gate: any
// failure (network, rate limit, malformed response) returns an empty result
// so registration still succeeds with no location rather than failing the
// whole signup over a third-party service being down.
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger('GeocodingService');

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
      const res = await fetch(url, {
        headers: {
          // Nominatim's usage policy requires a descriptive User-Agent
          // identifying the application, not a generic/browser one.
          'User-Agent': 'Eldermin-ParentApp/1.0 (contact: support@eldermin.app)',
          'Accept-Language': 'en',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Reverse geocode failed (${res.status} ${res.statusText}) for ${lat},${lng}`);
        return {};
      }
      const data: any = await res.json();
      const addr = data?.address || {};
      return {
        country: addr.country || undefined,
        city: addr.city || addr.town || addr.village || addr.municipality || undefined,
        district: addr.state_district || addr.county || addr.district || addr.state || undefined,
      };
    } catch (err: any) {
      this.logger.warn(`Reverse geocode error for ${lat},${lng}: ${err?.message}`);
      return {};
    }
  }
}
