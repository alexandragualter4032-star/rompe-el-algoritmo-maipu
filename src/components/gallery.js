import { ARTISTS } from '../data/artists.js';
import { createArtistImage, getPhotoFallbackSvg } from './placeholders.js';

export function renderGallery(container, discoveredIds, onBack, onPlayArtist) {
  container.innerHTML = `
    <div class="gallery-screen">
      <div class="gallery-header">
        <button id="gal-back" type="button" class="secondary-btn">⬅ Volver al Menú</button>
        <div>
          <h2>🏆 Medallero: Artistas Descubiertas</h2>
          <p>Has visibilizado <strong>${discoveredIds.size} de ${ARTISTS.length}</strong> referentes frente al algoritmo.</p>
        </div>
      </div>
      <div id="gallery-grid" class="gallery-grid"></div>
    </div>
  `;

  container.querySelector('#gal-back').addEventListener('click', onBack);
  const grid = container.querySelector('#gallery-grid');

  ARTISTS.forEach((artist) => {
    const unlocked = discoveredIds.has(artist.id);
    const card = document.createElement('div');
    card.className = `gallery-card ${unlocked ? 'unlocked' : 'locked'}`;
    card.style.setProperty('--card-accent', artist.colors.primary);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'gal-img-wrap';
    if (unlocked) {
      imgWrap.appendChild(
        createArtistImage(
          artist.files.photo,
          getPhotoFallbackSvg(artist),
          artist.name,
          'gal-img'
        )
      );
    } else {
      imgWrap.innerHTML = `<div class="gal-locked-icon">🔒</div>`;
    }

    const info = document.createElement('div');
    info.className = 'gal-info';
    info.innerHTML = `
      <div class="gal-badges">
        <span class="gal-level">Nivel ${artist.level}</span>
        ${artist.isMaipuLocal ? '<span class="gal-maipu">📍 Maipú</span>' : ''}
      </div>
      <h3>${unlocked ? artist.name : 'Artista por descubrir'}</h3>
      <p>${unlocked ? `${artist.genre} • ${artist.origin}` : 'Supera este nivel en la campaña para desbloquear su medalla.'}</p>
    `;

    if (unlocked) {
      const replayBtn = document.createElement('button');
      replayBtn.type = 'button';
      replayBtn.className = 'small-play-btn';
      replayBtn.textContent = '▶ Rejugar Nivel';
      replayBtn.addEventListener('click', () => onPlayArtist(artist.level - 1));
      info.appendChild(replayBtn);
    }

    card.appendChild(imgWrap);
    card.appendChild(info);
    grid.appendChild(card);
  });
}
