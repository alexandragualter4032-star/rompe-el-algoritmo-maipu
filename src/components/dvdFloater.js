import { FACTS } from '../data/facts.js';
import { createArtistImage, getFaceFallbackSvg } from './placeholders.js';
import { soundEngine } from '../audio/soundEngine.js';

const AURA_COLORS = ['#ff2e63', '#08d9d6', '#ffe66d', '#b565ff', '#00f5d4', '#ff9f1c'];

export class DvdFloater {
  constructor({ layerEl, artist, isPausedFn, onShowFactModal }) {
    this.layerEl = layerEl;
    this.artist = artist;
    this.isPausedFn = isPausedFn;
    this.onShowFactModal = onShowFactModal;

    this.x = 40 + Math.random() * 160;
    this.y = 90 + Math.random() * 140;
    this.vx = (Math.random() > 0.5 ? 1 : -1) * 235;
    this.vy = (Math.random() > 0.5 ? 1 : -1) * 190;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.vx = 0;
      this.vy = 0;
    }
    this.size = 88;
    this.colorIdx = 0;

    this.active = false;
    this.respawnRemainingMs = 0;
    this.rafId = null;
    this.lastTime = null;
    this.usedFactIndices = new Set();
    this.el = null;
  }

  start() {
    this.layerEl.classList.remove('hidden');
    this.spawn();
    this.lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.tick(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  spawn() {
    this.layerEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dvd-face-btn';
    btn.title = `¡Atrapa a ${this.artist.name} para descubrir un Dato Curioso!`;

    const img = createArtistImage(
      this.artist.files.face,
      getFaceFallbackSvg(this.artist),
      `Rostro de ${this.artist.name}`,
      'dvd-face-img'
    );
    if (this.artist.files.faceCrop) {
      btn.classList.add('has-face-crop');
      img.style.transform = `scale(${this.artist.files.faceCrop.scale})`;
      img.style.transformOrigin = this.artist.files.faceCrop.origin;
    }

    const badge = document.createElement('span');
    badge.className = 'dvd-badge';
    badge.textContent = '✨ ¡Dato!';

    btn.appendChild(img);
    btn.appendChild(badge);
    this.applyAuraColor(btn);

    btn.addEventListener('click', () => this.handleCatch());

    this.el = btn;
    this.layerEl.appendChild(btn);
    this.active = true;
    this.updatePosition();
  }

  applyAuraColor(el) {
    const color = AURA_COLORS[this.colorIdx % AURA_COLORS.length];
    el.style.setProperty('--dvd-aura', color);
  }

  tick(dt) {
    if (this.isPausedFn()) return;

    if (!this.active) {
      if (this.respawnRemainingMs > 0) {
        this.respawnRemainingMs -= dt * 1000;
        if (this.respawnRemainingMs <= 0) {
          this.respawnRemainingMs = 0;
          this.spawn();
        }
      }
      return;
    }

    if (!this.el) return;
    const maxW = window.innerWidth - this.size - 12;
    const minY = 74;
    const maxH = window.innerHeight - this.size - 12;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    let bounced = false;
    if (this.x <= 12) {
      this.x = 12;
      this.vx = Math.abs(this.vx);
      bounced = true;
    } else if (this.x >= maxW) {
      this.x = maxW;
      this.vx = -Math.abs(this.vx);
      bounced = true;
    }

    if (this.y <= minY) {
      this.y = minY;
      this.vy = Math.abs(this.vy);
      bounced = true;
    } else if (this.y >= maxH) {
      this.y = maxH;
      this.vy = -Math.abs(this.vy);
      bounced = true;
    }

    if (bounced) {
      this.colorIdx = (this.colorIdx + 1) % AURA_COLORS.length;
      this.applyAuraColor(this.el);
    }

    this.updatePosition();
  }

  updatePosition() {
    if (this.el) {
      this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;
    }
  }

  getNextFact() {
    const list = FACTS[this.artist.id] || [];
    if (list.length === 0) return 'Artista destacada por romper barreras en la industria musical.';
    if (this.usedFactIndices.size >= list.length) {
      this.usedFactIndices.clear();
    }
    const available = list.map((_, idx) => idx).filter((idx) => !this.usedFactIndices.has(idx));
    const chosenIdx = available[Math.floor(Math.random() * available.length)];
    this.usedFactIndices.add(chosenIdx);
    return list[chosenIdx];
  }

  handleCatch() {
    if (!this.active || this.isPausedFn()) return;
    this.active = false;
    this.layerEl.innerHTML = '';
    this.el = null;
    soundEngine.playSfx('dvd');

    const fact = this.getNextFact();
    this.onShowFactModal(fact, () => {
      // Al cerrar el modal, inicia contador interno de 10 segundos para reaparecer
      this.respawnRemainingMs = 10000;
    });
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.active = false;
    this.layerEl.innerHTML = '';
    this.layerEl.classList.add('hidden');
  }
}
