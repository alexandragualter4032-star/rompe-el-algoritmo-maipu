// Genera respaldos SVG estilizados para portadas/fotos (*_foto.jpg)
// y rostros recortados (*_cara.png) mientras no existan los archivos reales.

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getPhotoFallbackSvg(artist) {
  const { primary, secondary, bg } = artist.colors;
  const symbol = artist.symbols[0] || '🎵';
  const maipuTag = artist.isMaipuLocal
    ? `<rect x="24" y="22" width="160" height="28" rx="14" fill="${secondary}" />
       <text x="104" y="41" font-family="sans-serif" font-size="13" font-weight="800" fill="#111" text-anchor="middle">ORGULLO MAIPÚ</text>`
    : '';

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="g-${artist.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}" />
        <stop offset="60%" stop-color="${primary}44" />
        <stop offset="100%" stop-color="${secondary}55" />
      </linearGradient>
    </defs>
    <rect width="400" height="400" rx="28" fill="url(#g-${artist.id})" />
    <circle cx="310" cy="95" r="75" fill="${primary}33" />
    <circle cx="90" cy="310" r="95" fill="${secondary}22" />
    <rect x="20" y="20" width="360" height="360" rx="22" fill="none" stroke="${primary}" stroke-width="3" stroke-opacity="0.6" />
    ${maipuTag}
    <circle cx="200" cy="175" r="74" fill="${bg}" stroke="${secondary}" stroke-width="5" />
    <text x="200" y="195" font-size="64" text-anchor="middle">${symbol}</text>
    <text x="200" y="295" font-family="sans-serif" font-size="32" font-weight="900" fill="#ffffff" text-anchor="middle">${artist.name}</text>
    <text x="200" y="328" font-family="sans-serif" font-size="15" font-weight="700" fill="${secondary}" text-anchor="middle">${(artist.featuredSingle || artist.featuredAlbum || artist.albumTitle).toUpperCase()}</text>
    <text x="200" y="356" font-family="sans-serif" font-size="12" fill="#ffffffaa" text-anchor="middle">${artist.genre}</text>
  </svg>`;
  return encodeSvg(svg);
}

export function getFaceFallbackSvg(artist) {
  const { primary, secondary, bg } = artist.colors;
  const initials = artist.name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
    <defs>
      <radialGradient id="f-${artist.id}" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="${primary}" />
        <stop offset="100%" stop-color="${bg}" />
      </radialGradient>
    </defs>
    <circle cx="90" cy="90" r="82" fill="url(#f-${artist.id})" stroke="${secondary}" stroke-width="6" />
    <circle cx="90" cy="76" r="32" fill="#ffe5d9" />
    <path d="M44 146 C44 114, 136 114, 136 146" fill="${secondary}" />
    <path d="M56 72 C56 40, 124 40, 124 72" fill="#1b1024" />
    <circle cx="78" cy="76" r="4" fill="#111" />
    <circle cx="102" cy="76" r="4" fill="#111" />
    <path d="M80 90 Q90 98 100 90" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round" />
    <rect x="46" y="132" width="88" height="24" rx="12" fill="#000000aa" />
    <text x="90" y="149" font-family="sans-serif" font-size="13" font-weight="800" fill="#fff" text-anchor="middle">${initials} • ${artist.symbols[0]}</text>
  </svg>`;
  return encodeSvg(svg);
}

export function createArtistImage(src, fallbackSvg, alt, className = '') {
  const img = document.createElement('img');
  img.alt = alt;
  if (className) img.className = className;
  img.src = src;
  img.onerror = () => {
    if (img.src !== fallbackSvg) {
      img.src = fallbackSvg;
    }
  };
  return img;
}
