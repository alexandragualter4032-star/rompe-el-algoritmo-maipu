import { ARTIST_ORIGINS } from '../data/artistOrigins.js';
import { CHILE_OUTLINE } from '../data/chileOutline.js';
import { WORLD_LAND_PATH } from '../data/worldOutline.js';

function worldPoint({ lat, lon }) {
  return { x: (lon + 180) / 360 * 960, y: (90 - lat) / 180 * 480 };
}

function chilePoint({ lat, lon }) {
  return {
    x: 37 + ((lon + 76) / 10) * 156,
    y: 15 + ((-16 - lat) / 40) * 382,
  };
}

export function OriginMap({ artist }) {
  const places = ARTIST_ORIGINS[artist.id] || [];
  const world = places.some((place) => place.country !== 'Chile');

  if (!places.length) return null;

  return <section className="origin-map-section" aria-labelledby="origin-map-title">
    <h3 id="origin-map-title">📍 Origen y vínculos de {artist.name}</h3>
    <p>{world
      ? 'Mapamundi con las localidades mencionadas en su origen o trayectoria.'
      : 'Mapa de Chile con una ubicación aproximada; no indica una dirección personal.'}</p>
    <div className={`origin-map-layout ${world ? 'world-layout' : 'chile-layout'}`}>
      {world ? <svg className="origin-map-svg world-map" viewBox="0 0 960 480" role="img"
        aria-label={`Mapamundi con localidades vinculadas a ${artist.name}`}>
        <title>Localidades vinculadas a {artist.name}</title>
        <rect width="960" height="480" rx="18" className="map-background" />
        <path d="M0 120H960 M0 240H960 M0 360H960 M240 0V480 M480 0V480 M720 0V480" className="map-grid" />
        <path d={WORLD_LAND_PATH} className="world-land" />
        {places.map((place) => {
          const { x, y } = worldPoint(place);
          return <g key={place.label}>
            <circle cx={x} cy={y} r="11" className="map-pin-halo" />
            <circle cx={x} cy={y} r="6" className="map-pin" />
          </g>;
        })}
      </svg> : <svg className="origin-map-svg chile-map" viewBox="0 0 230 420" role="img"
        aria-label={`Mapa esquemático de Chile con una ubicación aproximada para ${artist.name}`}>
        <title>Ubicación aproximada en Chile</title>
        <rect width="230" height="420" rx="18" className="map-background" />
        <path d={CHILE_OUTLINE} className="chile-outline" />
        {places.map((place) => {
          const { x, y } = chilePoint(place);
          return <g key={place.label}>
            <circle cx={x} cy={y} r="12" className="map-pin-halo" />
            <circle cx={x} cy={y} r="6" className="map-pin" />
          </g>;
        })}
      </svg>}
      <div className="origin-map-places" aria-label="Localidades">
        {places.map((place) => <div className="origin-place" key={place.label}>
          <span className="origin-place-dot" />
          <div><strong>{place.label}</strong><small>Ubicación aproximada</small></div>
        </div>)}
      </div>
    </div>
    <small className="map-credit">Mapas esquemáticos basados en datos de <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a> (dominio público). Las ubicaciones son aproximadas.</small>
  </section>;
}
