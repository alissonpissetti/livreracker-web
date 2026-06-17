import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export type GoogleMapsApi = {
  Map: typeof google.maps.Map;
  Polyline: typeof google.maps.Polyline;
  LatLngBounds: typeof google.maps.LatLngBounds;
  Marker: typeof google.maps.Marker;
  DirectionsService: typeof google.maps.DirectionsService;
  InfoWindow: typeof google.maps.InfoWindow;
  SymbolPath: typeof google.maps.SymbolPath;
};

let configuredKey = '';
let libraries: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (!apiKey) {
    return Promise.reject(
      new Error(
        'Chave do Google Maps não configurada. Defina VITE_GOOGLE_MAPS_API_KEY no .env da raiz do projeto e reinicie o Vite.',
      ),
    );
  }

  if (configuredKey && configuredKey !== apiKey) {
    libraries = null;
  }
  configuredKey = apiKey;

  if (!libraries) {
    setOptions({ key: apiKey, v: 'weekly' });

    libraries = Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
      importLibrary('routes'),
    ]).then(() => ({
      Map: google.maps.Map,
      Polyline: google.maps.Polyline,
      LatLngBounds: google.maps.LatLngBounds,
      Marker: google.maps.Marker,
      DirectionsService: google.maps.DirectionsService,
      InfoWindow: google.maps.InfoWindow,
      SymbolPath: google.maps.SymbolPath,
    }));
  }

  return libraries;
}
