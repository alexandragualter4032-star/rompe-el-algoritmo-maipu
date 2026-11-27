import { soundEngine } from '../audio/soundEngine.js';
import { createArtistImage, getPhotoFallbackSvg } from './placeholders.js';

const LANES = [
  { key: 'a', label: 'A', hand: 'Izq' },
  { key: 's', label: 'S', hand: 'Izq' },
  { key: 'k', label: 'K', hand: 'Der' },
  { key: 'l', label: 'L', hand: 'Der' },
];

export class Phase2Controller {
  constructor({ container, artist, isPausedFn, onSuccess, onRetryNeeded }) {
    this.container = container;
    this.artist = artist;
    this.isPausedFn = isPausedFn;
    this.onSuccess = onSuccess;
    this.onRetryNeeded = onRetryNeeded;

    this.trackHeight = 420;
    this.hitLineY = 355;
    this.hitWindowPx = 52; // Margen generoso para 12-13 años

    this.notes = [];
    this.nextNoteId = 1;
    this.hits = 0;
    this.misses = 0;
    this.falsePresses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;

    this.countdownSec = 3;
    this.songElapsedMs = 0;
    this.songDurationMs = artist.rhythm.durationSec * 1000;
    this.spawnAccumMs = 0;
    this.rafId = null;
    this.lastTime = null;
    this.finished = false;
    this.countdownTimer = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  start() {
    this.render();
    window.addEventListener('keydown', this.handleKeyDown);
    this.startCountdown();
  }

  render() {
    const minPct = this.artist.rhythm.minApprovalPct;
    const musicTitle = this.artist.featuredSingle || this.artist.video?.title
      || this.artist.featuredAlbum || this.artist.albumTitle;
    this.container.innerHTML = `
      <div class="phase2-layout">
        <div class="rhythm-sidebar">
          <div id="rhythm-art" class="rhythm-art-box"></div>
          <h3>${this.artist.name}</h3>
          <p class="rhythm-song-tag">🎵 ${musicTitle}</p>
          <div class="rhythm-stats">
            <div class="stat-box"><span>Combo</span><strong id="r-combo">0</strong></div>
            <div class="stat-box"><span>Aciertos</span><strong id="r-hits">0</strong></div>
            <div class="stat-box"><span>Errores</span><strong id="r-errors">0</strong></div>
          </div>
          <div class="approval-box">
            <div class="approval-labels">
              <span>Aprobación</span>
              <span id="r-approval-text">100% (Meta: ${minPct}%)</span>
            </div>
            <div class="approval-bar">
              <div id="r-approval-fill" class="approval-fill" style="width: 100%"></div>
              <div class="approval-target-line" style="left: ${minPct}%"></div>
            </div>
          </div>
          <div class="song-time-wrap">
            <span>⏱️ Tiempo restante: <strong id="r-time-left">${this.artist.rhythm.durationSec}s</strong></span>
          </div>
          <div id="r-feedback-banner" class="r-feedback-banner" role="status" aria-live="polite">Prepárate…</div>
        </div>

        <div class="rhythm-board-wrap">
          <p class="rhythm-controls-help" id="rhythm-instructions">Pulsa A, S, K o L en el teclado, o activa el botón de cada carril cuando la nota llegue a la línea.</p>
          <div id="rhythm-countdown" class="rhythm-countdown">3</div>
          <div id="rhythm-track" class="rhythm-track" style="height: ${this.trackHeight}px">
            <div class="hit-zone-bar" style="top: ${this.hitLineY - 22}px"></div>
            <div class="lanes-grid">
              ${LANES.map(
                (lane, i) => `
                <div class="lane" data-lane="${i}">
                  <div class="lane-notes" id="lane-notes-${i}"></div>
                  <button type="button" class="lane-receptor" data-lane="${i}"
                    aria-label="Carril ${lane.label}, lado ${lane.hand.toLowerCase()}; activar al llegar la nota"
                    aria-describedby="rhythm-instructions" aria-keyshortcuts="${lane.label}">
                    <span class="key-cap">${lane.label}</span>
                    <small>${lane.hand}</small>
                  </button>
                </div>`
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    const artBox = this.container.querySelector('#rhythm-art');
    artBox.appendChild(
      createArtistImage(
        this.artist.files.singleCover || this.artist.files.albumCover || this.artist.files.photo,
        getPhotoFallbackSvg(this.artist),
        this.artist.files.singleCover || this.artist.files.albumCover
          ? `Portada de ${this.artist.featuredSingle || this.artist.featuredAlbum || this.artist.albumTitle}` : this.artist.name,
        'rhythm-art-img'
      )
    );

    this.container.querySelectorAll('.lane-receptor').forEach((btn) => {
      btn.addEventListener('click', () => {
        const laneIdx = Number(btn.dataset.lane);
        this.triggerLane(laneIdx);
      });
    });
  }

  startCountdown() {
    const cdEl = this.container.querySelector('#rhythm-countdown');
    soundEngine.playSfx('tick');

    this.countdownTimer = setInterval(() => {
      if (this.isPausedFn() || this.finished) return;
      this.countdownSec -= 1;
      if (this.countdownSec > 0) {
        cdEl.textContent = String(this.countdownSec);
        soundEngine.playSfx('tick');
      } else if (this.countdownSec === 0) {
        cdEl.textContent = '¡SUENA!';
        soundEngine.playSfx('win');
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        cdEl.classList.add('hidden');
        this.setFeedback('¡Toca A - S - K - L al ritmo!', 'neutral');
        this.startLoop();
      }
    }, 850);
  }

  startLoop() {
    this.lastTime = performance.now();
    const loop = (now) => {
      if (this.finished) return;
      const dtMs = Math.min(50, now - this.lastTime);
      this.lastTime = now;

      if (!this.isPausedFn()) {
        this.update(dtMs);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  update(dtMs) {
    const dtSec = dtMs / 1000;
    this.songElapsedMs += dtMs;

    // Dejar de spawnear notas en los últimos 2.2 segundos para que terminen de caer
    if (this.songElapsedMs < this.songDurationMs - 2200) {
      this.spawnAccumMs += dtMs;
      if (this.spawnAccumMs >= this.artist.rhythm.spawnIntervalMs) {
        this.spawnAccumMs -= this.artist.rhythm.spawnIntervalMs;
        this.spawnNote();
      }
    }

    const speed = this.artist.rhythm.speedPxPerSec;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const note = this.notes[i];
      note.y += speed * dtSec;
      note.el.style.transform = `translateY(${Math.round(note.y)}px)`;

      if (note.y > this.hitLineY + this.hitWindowPx + 18) {
        note.el.remove();
        this.notes.splice(i, 1);
        this.misses += 1;
        this.combo = 0;
        this.setFeedback('Nota perdida', 'bad');
        this.updateHud();
      }
    }

    const timeLeft = Math.max(0, Math.ceil((this.songDurationMs - this.songElapsedMs) / 1000));
    const timeEl = this.container.querySelector('#r-time-left');
    if (timeEl) timeEl.textContent = `${timeLeft}s`;

    if (this.songElapsedMs >= this.songDurationMs && this.notes.length === 0) {
      this.finishSong();
    }
  }

  spawnNote() {
    const laneIdx = Math.floor(Math.random() * LANES.length);
    const laneContainer = this.container.querySelector(`#lane-notes-${laneIdx}`);
    if (!laneContainer) return;

    const el = document.createElement('div');
    el.className = `rhythm-note lane-color-${laneIdx}`;
    el.textContent = LANES[laneIdx].label;
    laneContainer.appendChild(el);

    this.notes.push({
      id: this.nextNoteId++,
      lane: laneIdx,
      y: -36,
      el,
    });
  }

  handleKeyDown(e) {
    if (this.isPausedFn() || this.finished || this.countdownSec >= 0) return;
    const key = e.key.toLowerCase();
    const laneIdx = LANES.findIndex((l) => l.key === key);
    if (laneIdx !== -1) {
      e.preventDefault();
      this.triggerLane(laneIdx);
    }
  }

  triggerLane(laneIdx) {
    if (this.isPausedFn() || this.finished || this.countdownSec >= 0) return;

    const laneEl = this.container.querySelector(`.lane[data-lane="${laneIdx}"]`);
    const receptor = laneEl?.querySelector('.lane-receptor');

    // Buscar nota más cercana dentro de la zona de acierto en este carril
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.lane !== laneIdx) continue;
      const dist = Math.abs(n.y - this.hitLineY);
      if (dist <= this.hitWindowPx && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      const hitNote = this.notes[bestIdx];
      hitNote.el.remove();
      this.notes.splice(bestIdx, 1);

      this.hits += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += 100 + this.combo * 10;

      soundEngine.playSfx('hit');
      receptor?.classList.add('hit-flash');
      setTimeout(() => receptor?.classList.remove('hit-flash'), 140);

      this.setFeedback(bestDist < 22 ? '🔥 ¡PERFECTO!' : '✨ ¡BIEN!', 'good');
      this.updateHud();
    } else {
      // Penalización anti-machaqueo por tocar a destiempo
      this.falsePresses += 1;
      this.combo = 0;
      this.score = Math.max(0, this.score - 30);

      soundEngine.playSfx('miss');
      laneEl?.classList.add('error-flash');
      receptor?.classList.add('error-flash');
      setTimeout(() => {
        laneEl?.classList.remove('error-flash');
        receptor?.classList.remove('error-flash');
      }, 220);

      this.setFeedback('❌ ¡A destiempo! Solo toca cuando haya nota', 'bad');
      this.updateHud();
    }
  }

  getApprovalPct() {
    const totalAttempts = this.hits + this.misses + this.falsePresses;
    if (totalAttempts === 0) return 100;
    return Math.round((this.hits / totalAttempts) * 100);
  }

  updateHud() {
    const comboEl = this.container.querySelector('#r-combo');
    const hitsEl = this.container.querySelector('#r-hits');
    const errEl = this.container.querySelector('#r-errors');
    const appText = this.container.querySelector('#r-approval-text');
    const appFill = this.container.querySelector('#r-approval-fill');

    const pct = this.getApprovalPct();
    const minPct = this.artist.rhythm.minApprovalPct;

    if (comboEl) comboEl.textContent = String(this.combo);
    if (hitsEl) hitsEl.textContent = String(this.hits);
    if (errEl) errEl.textContent = String(this.misses + this.falsePresses);
    if (appText) appText.textContent = `${pct}% (Meta: ${minPct}%)`;
    if (appFill) {
      appFill.style.width = `${pct}%`;
      appFill.classList.toggle('passing', pct >= minPct);
      appFill.classList.toggle('failing', pct < minPct);
    }
  }

  setFeedback(text, kind) {
    const el = this.container.querySelector('#r-feedback-banner');
    if (!el) return;
    el.textContent = text;
    el.className = `r-feedback-banner ${kind}`;
  }

  finishSong() {
    this.finished = true;
    this.cleanupListeners();

    const pct = this.getApprovalPct();
    const minPct = this.artist.rhythm.minApprovalPct;
    const totalAttempts = this.hits + this.misses + this.falsePresses;

    if (pct >= minPct) {
      soundEngine.playSfx('win');
      this.onSuccess({
        approvalPct: pct,
        hits: this.hits,
        maxCombo: this.maxCombo,
        score: this.score,
      });
    } else {
      soundEngine.playSfx('wrong');
      const neededHits = Math.max(1, Math.ceil((minPct / 100) * totalAttempts) - this.hits);
      this.onRetryNeeded({
        approvalPct: pct,
        minPct,
        neededHits,
        hits: this.hits,
        errors: this.misses + this.falsePresses,
      });
    }
  }

  cleanupListeners() {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.finished = true;
    this.cleanupListeners();
  }
}
