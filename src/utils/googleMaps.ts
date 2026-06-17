import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export type GoogleMapsApi = {
  Map: typeof google.maps.Map;
  Polyline: typeof google.maps.Polyline;
  LatLngBounds: typeof google.maps.LatLngBounds;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  Route: typeof google.maps.routes.Route;
  DirectionsService: typeof google.maps.DirectionsService;
  InfoWindow: typeof google.maps.InfoWindow;
};

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

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

    libraries = (async () => {
      const [, markerLib, routesLib] = await Promise.all([
        importLibrary('maps'),
        importLibrary('marker'),
        importLibrary('routes'),
      ]);

      const { AdvancedMarkerElement } = markerLib as google.maps.MarkerLibrary;
      const { Route } = routesLib as google.maps.RoutesLibrary;

      return {
        Map: google.maps.Map,
        Polyline: google.maps.Polyline,
        LatLngBounds: google.maps.LatLngBounds,
        AdvancedMarkerElement,
        Route,
        DirectionsService: google.maps.DirectionsService,
        InfoWindow: google.maps.InfoWindow,
      };
    })();
  }

  return libraries;
}

export function getGoogleMapId(): string {
  return MAP_ID;
}
