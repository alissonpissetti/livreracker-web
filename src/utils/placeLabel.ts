const labelCache = new Map<string, string>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function getCachedPlaceLabel(lat: number, lng: number): string | undefined {
  return labelCache.get(cacheKey(lat, lng));
}

function pickComponent(
  components: google.maps.GeocoderAddressComponent[],
  ...types: string[]
): string | undefined {
  for (const type of types) {
    const match = components.find((entry) => entry.types.includes(type));
    if (match?.long_name) {
      return match.long_name;
    }
  }
  return undefined;
}

/** Endereço curto e amigável para paradas na timeline. */
export function formatFriendlyPlaceLabel(
  result: google.maps.GeocoderResult,
): string {
  const components = result.address_components ?? [];
  const route = pickComponent(components, 'route');
  const number = pickComponent(components, 'street_number');

  if (route) {
    const street = route.trim().toLowerCase();
    const hasStreetType = /^(rua|avenida|av\.|travessa|alameda|estrada|rodovia|praça)\b/.test(
      street,
    );
    const streetLabel = hasStreetType ? street : `rua ${street}`;
    if (number) {
      return `nas proximidades da ${streetLabel} número ${number}`;
    }
    return `nas proximidades da ${streetLabel}`;
  }

  const area = pickComponent(
    components,
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_2',
  );
  if (area) {
    return `nas proximidades de ${area.trim().toLowerCase()}`;
  }

  const firstPart = result.formatted_address?.split(',')[0]?.trim();
  if (firstPart) {
    return `nas proximidades de ${firstPart.toLowerCase()}`;
  }

  return 'local não identificado';
}

export async function resolvePlaceLabel(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  const key = cacheKey(lat, lng);
  const cached = labelCache.get(key);
  if (cached) {
    return cached;
  }

  if (typeof google === 'undefined' || !google.maps?.Geocoder) {
    return undefined;
  }

  const geocoder = new google.maps.Geocoder();

  try {
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const best = results?.[0];
    if (!best) {
      return undefined;
    }
    const friendly = formatFriendlyPlaceLabel(best);
    labelCache.set(key, friendly);
    return friendly;
  } catch {
    return undefined;
  }
}
