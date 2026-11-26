import { ARTISTS } from '../data/artists.js';
import { CHILE_OUTLINE } from '../data/chileOutline.js';

const GROUPS = [
  { label: 'Maipú', ids: ['akrilla'], color: '#ff2e63' },
  { label: 'Santiago (comuna sin precisar)', ids: ['princesaalba', 'soulfia', 'javieramena', 'rubio', 'chinipng'], color: '#08d9d6' },
  { label: 'Viña del Mar', ids: ['monlaferte'], color: '#ffe66d' },
];

const OTHER_IDS = ['anatijoux', 'franciscavalenzuela', 'snailmail', 'paramore', 'tricot'];

export function OriginMap({ discovered, revealAll = false }) {
  const visible = (id) => revealAll || discovered.has(id);
  const names = (ids) => ids.filter(visible).map((id) => ARTISTS.find((artist) => artist.id === id)?.name).filter(Boolean);

  return <section className="origin-map-section" aria-labelledby="origin-map-title">
    <h3 id="origin-map-title">📍 ¿De dónde vienen?</h3>
    <p>Mapa de Chile con las ciudades conocidas. Maipú tiene pin propio; cuando solo se conoce «Santiago», no se inventa una comuna.</p>
    <div className="origin-map-layout">
      <svg className="origin-map-svg" viewBox="0 0 520 420" role="img"
        aria-label="Mapa de Chile. Ampliación de la zona central con pines en Viña del Mar, Maipú y Santiago.">
        <rect x="1" y="1" width="518" height="418" rx="18" className="map-background" />
        <path d={CHILE_OUTLINE} className="chile-outline" />
        <circle cx="122" cy="174" r="7" className="map-zone-dot" />
        <path d="M 130 174 L 230 174" className="map-connector" />
        <rect x="230" y="72" width="278" height="245" rx="16" className="map-inset" />
        <text x="245" y="100" className="map-title">ZONA CENTRAL AMPLIADA</text>
        <path d="M 245 150 H 492 M 245 205 H 492 M 335 115 V 302 M 425 115 V 302" className="map-grid" />
        <circle cx="310" cy="128" r="7" fill="#ffe66d" />
        <path d="M 317 128 L 329 128" className="map-leader" />
        <text x="335" y="133" className="map-label">Viña del Mar</text>
        <circle cx="437" cy="200" r="7" fill="#08d9d6" />
        <path d="M 444 200 L 456 185" className="map-leader" />
        <text x="458" y="180" className="map-label">Santiago</text>
        <circle cx="424" cy="211" r="7" fill="#ff2e63" />
        <path d="M 420 217 L 395 245" className="map-leader" />
        <text x="345" y="258" className="map-label">Maipú</text>
        <text x="40" y="32" className="map-title">CHILE</text>
      </svg>
      <div className="origin-map-places">
        {GROUPS.map((group) => {
          const found = names(group.ids);
          return <div className="origin-place" key={group.label}>
            <span className="origin-place-dot" style={{ background: group.color }} />
            <div><strong>{group.label}</strong>
              <small>{found.length ? found.join(', ') : 'Artista por descubrir'}
                {found.length < group.ids.length && ` · ${group.ids.length - found.length} pendiente(s)`}</small></div>
          </div>;
        })}
        <div className="origin-place origin-place-other"><span className="origin-place-dot" />
          <div><strong>Fuera de este mapa</strong><small>{names(OTHER_IDS).join(', ') || 'Artistas por descubrir'}</small></div>
        </div>
      </div>
    </div>
    <small className="map-credit">Contorno: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Natural Earth</a> (dominio público). Pines de la zona central ampliados para que se puedan distinguir.</small>
  </section>;
}
