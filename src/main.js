import { ARTISTS } from './data/artists.js';
import { soundEngine } from './audio/soundEngine.js';
import { Phase1Controller } from './components/phase1.js';
import { Phase2Controller } from './components/phase2.js';
import { renderGallery } from './components/gallery.js';

const STORAGE_KEY = 'rompe_algoritmo_maipu_v1';

class GameApp {
  constructor() {
    this.topBar = document.getElementById('top-bar');
    this.screenEl = document.getElementById('screen-container');
    this.dvdLayer = document.getElementById('dvd-layer');
    this.modalOverlay = document.getElementById('modal-overlay');

    this.hudLevel = document.getElementById('hud-level');
    this.hudArtist = document.getElementById('hud-artist');
    this.hudVisText = document.getElementById('hud-visibility-text');
    this.hudVisFill = document.getElementById('hud-visibility-fill');
    this.btnPause = document.getElementById('btn-pause');
    this.pauseIcon = document.getElementById('pause-icon');
    this.pauseLabel = document.getElementById('pause-label');
    this.btnMute = document.getElementById('btn-mute');
    this.btnHome = document.getElementById('btn-home');

    this.state = this.loadState();
    this.answeredQuestionIds = new Set();
    this.isPaused = false;
    this.inGameplay = false;
    this.activeController = null;
    this.currentLevelIdx = 0;
    this.infiniteMode = false;
    this.infiniteStreak = 0;

    this.bindGlobalControls();
    this.showHome();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          maxUnlockedIdx: parsed.maxUnlockedIdx || 0,
          campaignCompleted: Boolean(parsed.campaignCompleted),
          discoveredIds: new Set(parsed.discoveredIds || []),
          bestInfiniteStreak: parsed.bestInfiniteStreak || 0,
        };
      }
    } catch {
      // ignore
    }
    return {
      maxUnlockedIdx: 0,
      campaignCompleted: false,
      discoveredIds: new Set(),
      bestInfiniteStreak: 0,
    };
  }

  saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        maxUnlockedIdx: this.state.maxUnlockedIdx,
        campaignCompleted: this.state.campaignCompleted,
        discoveredIds: Array.from(this.state.discoveredIds),
        bestInfiniteStreak: this.state.bestInfiniteStreak,
      })
    );
  }

  bindGlobalControls() {
    this.btnPause.addEventListener('click', () => this.togglePause());
    this.btnMute.addEventListener('click', () => {
      const next = !soundEngine.muted;
      soundEngine.setMuted(next);
      this.btnMute.textContent = next ? '🔇' : '🔊';
    });
    this.btnHome.addEventListener('click', () => {
      this.cleanupActivePhase();
      soundEngine.stopTrack();
      this.showHome();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.inGameplay) return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  togglePause(forceState) {
    if (!this.inGameplay) return;
    this.isPaused = typeof forceState === 'boolean' ? forceState : !this.isPaused;

    if (this.isPaused) {
      soundEngine.pause();
      this.pauseIcon.textContent = '▶️';
      this.pauseLabel.textContent = 'Reanudar';
      this.showPauseOverlay();
    } else {
      soundEngine.resume();
      this.pauseIcon.textContent = '⏸️';
      this.pauseLabel.textContent = 'Pausa';
      this.hidePauseOverlay();
    }
  }

  showPauseOverlay() {
    this.modalOverlay.classList.remove('hidden');
    this.modalOverlay.innerHTML = `
      <div class="modal-card pause-modal">
        <div class="modal-badge">⏸️ JUEGO EN PAUSA</div>
        <h2>Tómate un respiro</h2>
        <p>La música, los temporizadores, los elementos flotantes y las notas están detenidos.</p>
        <div class="modal-actions">
          <button id="resume-btn" type="button" class="primary-btn">▶️ Continuar jugando (Esc / P)</button>
          <button id="pause-home-btn" type="button" class="secondary-btn">🏠 Salir al Menú</button>
        </div>
      </div>
    `;
    this.modalOverlay.querySelector('#resume-btn').addEventListener('click', () => this.togglePause(false));
    this.modalOverlay.querySelector('#pause-home-btn').addEventListener('click', () => {
      this.isPaused = false;
      this.cleanupActivePhase();
      soundEngine.stopTrack();
      this.hideModal();
      this.showHome();
    });
  }

  hidePauseOverlay() {
    if (this.modalOverlay.querySelector('.pause-modal')) {
      this.hideModal();
    }
  }

  showModal({ badge, title, body, buttonText = '¡Entendido, a jugar!', onClose }) {
    this.modalOverlay.classList.remove('hidden');
    this.modalOverlay.innerHTML = `
      <div class="modal-card">
        ${badge ? `<div class="modal-badge">${badge}</div>` : ''}
        <h2>${title}</h2>
        <div class="modal-body">${body}</div>
        <button id="modal-confirm-btn" type="button" class="primary-btn">${buttonText}</button>
      </div>
    `;
    this.modalOverlay.querySelector('#modal-confirm-btn').addEventListener('click', () => {
      this.hideModal();
      if (onClose) onClose();
    });
  }

  hideModal() {
    this.modalOverlay.classList.add('hidden');
    this.modalOverlay.innerHTML = '';
  }

  setTheme(themeClass) {
    document.body.className = themeClass || 'theme-default';
  }

  cleanupActivePhase() {
    this.inGameplay = false;
    this.isPaused = false;
    this.pauseIcon.textContent = '⏸️';
    this.pauseLabel.textContent = 'Pausa';
    if (this.activeController) {
      this.activeController.destroy();
      this.activeController = null;
    }
    this.dvdLayer.classList.add('hidden');
    this.dvdLayer.innerHTML = '';
  }

  showHome() {
    this.cleanupActivePhase();
    this.topBar.classList.add('hidden');
    this.setTheme('theme-default');

    const nextIdx = Math.min(this.state.maxUnlockedIdx, ARTISTS.length - 1);
    const nextArtist = ARTISTS[nextIdx];
    const unlockedInf = this.state.campaignCompleted;

    this.screenEl.innerHTML = `
      <div class="home-screen">
        <div class="school-pill">🏫 Colegio Particular San Nicolás de Maipú • 7° Básico</div>
        <h1 class="game-title">ROMPE EL ALGORITMO</h1>
        <p class="game-subtitle">
          Descubre 12 proyectos musicales liderados por mujeres en el género urbano y el rock alternativo,
          desde <strong>AKRILLA en Maipú</strong> hasta escenarios del mundo.
        </p>

        <div class="home-actions">
          <button id="btn-start-campaign" type="button" class="primary-btn hero-btn">
            ▶ ${this.state.maxUnlockedIdx === 0 ? 'Iniciar Campaña (Nivel 1: AKRILLA)' : `Continuar Campaña (Nivel ${nextArtist.level}: ${nextArtist.name})`}
          </button>

          <button id="btn-gallery" type="button" class="secondary-btn">
            🏆 Artistas Descubiertas (${this.state.discoveredIds.size}/${ARTISTS.length})
          </button>

          <button id="btn-infinite" type="button" class="infinite-btn ${unlockedInf ? 'unlocked' : 'locked'}" ${unlockedInf ? '' : 'disabled'}>
            ${unlockedInf ? '♾️ Modo Infinito / Post-Clase (¡Desbloqueado!)' : '🔒 Modo Infinito / Post-Clase'}
            <small>${unlockedInf ? `Récord actual: ${this.state.bestInfiniteStreak} canciones` : 'Completa la campaña principal para desbloquear'}</small>
          </button>
        </div>

        <div class="campaign-strip">
          <h3>🗺️ Ruta de la Campaña</h3>
          <div class="level-chips">
            ${ARTISTS.map((a, idx) => {
              const isUnlocked = idx <= this.state.maxUnlockedIdx;
              const isDone = this.state.discoveredIds.has(a.id);
              return `
                <button type="button" class="level-chip ${isDone ? 'done' : isUnlocked ? 'open' : 'locked'}" data-idx="${idx}" ${isUnlocked ? '' : 'disabled'}>
                  <span>${isDone ? '✅' : isUnlocked ? '🎵' : '🔒'} Nv.${a.level}</span>
                  <strong>${a.name}</strong>
                  ${a.isMaipuLocal ? '<em>Maipú</em>' : ''}
                </button>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    this.screenEl.querySelector('#btn-start-campaign').addEventListener('click', () => {
      this.infiniteMode = false;
      this.startLevel(nextIdx);
    });

    this.screenEl.querySelector('#btn-gallery').addEventListener('click', () => {
      renderGallery(
        this.screenEl,
        this.state.discoveredIds,
        () => this.showHome(),
        (idx) => {
          this.infiniteMode = false;
          this.startLevel(idx);
        }
      );
    });

    if (unlockedInf) {
      this.screenEl.querySelector('#btn-infinite').addEventListener('click', () => {
        this.startInfiniteMode();
      });
    }

    this.screenEl.querySelectorAll('.level-chip.open, .level-chip.done').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.infiniteMode = false;
        this.startLevel(Number(chip.dataset.idx));
      });
    });
  }

  startLevel(levelIdx) {
    this.cleanupActivePhase();
    this.currentLevelIdx = levelIdx;
    const artist = ARTISTS[levelIdx];
    this.setTheme(artist.themeClass);

    this.topBar.classList.remove('hidden');
    this.hudLevel.textContent = this.infiniteMode
      ? `♾️ Infinito #${this.infiniteStreak + 1}`
      : `Nivel ${artist.level}/${ARTISTS.length}`;
    this.hudArtist.textContent = artist.isMaipuLocal ? `${artist.name} (Maipú)` : artist.name;
    this.updateVisibilityHud(0, 350);

    soundEngine.playArtistTrack(artist, false);

    // Pantalla de Explicación ANTES de la Fase 1
    this.showModal({
      badge: `📡 FASE 1 • ${artist.name}`,
      title: '¿Cómo se juega la Fase 1?',
      body: `
        <ul class="explain-list">
          <li>💡 En la parte superior de cada tarjeta leerás una <strong>Pista / Contexto</strong>.</li>
          <li>❓ Debajo encontrarás la <strong>Pregunta</strong> con 4 opciones para deducir la respuesta <strong>sin límite de tiempo</strong>.</li>
          <li>🛡️ Tienes <strong>2 oportunidades</strong> por pregunta y <strong>3 comodines</strong> que se activan tras 30 segundos.</li>
          <li>✨ ¡Atrapa el <strong>rostro luminoso de ${artist.name}</strong> que rebota por la pantalla para descubrir <strong>datos curiosos reales</strong> y sumar Visibilidad!</li>
        </ul>
      `,
      buttonText: '¡Entendido, a jugar!',
      onClose: () => this.launchPhase1(artist),
    });
  }

  updateVisibilityHud(current, goal) {
    const pct = Math.min(100, Math.round((current / goal) * 100));
    this.hudVisText.textContent = `${current} / ${goal}`;
    this.hudVisFill.style.width = `${pct}%`;
  }

  launchPhase1(artist) {
    this.inGameplay = true;
    this.activeController = new Phase1Controller({
      container: this.screenEl,
      dvdLayer: this.dvdLayer,
      modalOverlay: this.modalOverlay,
      artist,
      answeredIds: this.answeredQuestionIds,
      isPausedFn: () => this.isPaused,
      onVisibilityChange: (cur, goal) => this.updateVisibilityHud(cur, goal),
      onShowModal: (cfg) => this.showModal(cfg),
      onComplete: (finalVisibility) => {
        this.inGameplay = false;
        this.showPhase2Intro(artist, finalVisibility);
      },
    });
    this.activeController.start();
  }

  showPhase2Intro(artist, visibilityEarned) {
    soundEngine.setPhaseVolume(true);
    this.showModal({
      badge: `🎸 FASE 2 MUSICAL • ${artist.name}`,
      title: '¡Desbloqueaste la Fase Musical!',
      body: `
        <p class="intro-vis-note">Lograste <strong>${visibilityEarned} puntos de Visibilidad</strong>. ¡Ahora haz que suene ${artist.name}!</p>
        <ul class="explain-list">
          <li>🎹 Toca las notas al ritmo usando las teclas <strong>A - S</strong> (mano izquierda) y <strong>K - L</strong> (mano derecha).</li>
          <li>⚠️ <strong>Evita presionar teclas cuando no haya notas</strong> en la zona de acierto, ¡porque marca error!</li>
          <li>🎯 Alcanza al menos <strong>${artist.rhythm.minApprovalPct}% de aciertos</strong> para superar el nivel.</li>
        </ul>
      `,
      buttonText: '¡Entendido, a jugar!',
      onClose: () => this.launchPhase2(artist),
    });
  }

  launchPhase2(artist) {
    this.inGameplay = true;
    this.activeController = new Phase2Controller({
      container: this.screenEl,
      artist,
      isPausedFn: () => this.isPaused,
      onSuccess: (stats) => this.handleLevelComplete(artist, stats),
      onRetryNeeded: (failStats) => this.handlePhase2Retry(artist, failStats),
    });
    this.activeController.start();
  }

  handlePhase2Retry(artist, failStats) {
    this.inGameplay = false;
    this.showModal({
      badge: '🎵 ¡Casi lo logras!',
      title: `Alcanzaste ${failStats.approvalPct}% (Meta: ${failStats.minPct}%)`,
      body: `
        <p>Te faltaron aproximadamente <strong>${failStats.neededHits} aciertos</strong> para superar la canción.</p>
        <p>No pierdes tu avance de la Fase 1. ¡Inténtalo de nuevo con calma!</p>
      `,
      buttonText: '🔄 Reintentar Canción',
      onClose: () => this.launchPhase2(artist),
    });
  }

  handleLevelComplete(artist, stats) {
    this.inGameplay = false;
    this.state.discoveredIds.add(artist.id);

    if (this.infiniteMode) {
      this.infiniteStreak += 1;
      this.state.bestInfiniteStreak = Math.max(this.state.bestInfiniteStreak, this.infiniteStreak);
      this.saveState();

      this.showModal({
        badge: '♾️ MODO INFINITO',
        title: `¡Superaste a ${artist.name}!`,
        body: `
          <p>Aprobación: <strong>${stats.approvalPct}%</strong> • Combo máximo: <strong>${stats.maxCombo}</strong></p>
          <p>Racha actual: <strong>${this.infiniteStreak} canciones</strong></p>
        `,
        buttonText: '▶ Siguiente Artista Aleatoria',
        onClose: () => {
          const nextRandom = Math.floor(Math.random() * ARTISTS.length);
          this.startInfiniteSong(nextRandom);
        },
      });
      return;
    }

    if (this.currentLevelIdx + 1 > this.state.maxUnlockedIdx && this.currentLevelIdx + 1 < ARTISTS.length) {
      this.state.maxUnlockedIdx = this.currentLevelIdx + 1;
    }

    const isFinalLevel = this.currentLevelIdx === ARTISTS.length - 1;
    if (isFinalLevel) {
      this.state.campaignCompleted = true;
    }
    this.saveState();

    if (isFinalLevel) {
      this.showModal({
        badge: '🏆 ¡CAMPAÑA COMPLETADA!',
        title: '¡Rompiste el algoritmo por completo!',
        body: `
          <p>Descubriste a las <strong>12 referentes mujeres</strong> desde Maipú hasta Kioto.</p>
          <p>🔓 ¡Acabas de desbloquear el <strong>Modo Infinito / Post-Clase</strong> en el menú inicial!</p>
        `,
        buttonText: '🏠 Ir al Menú Principal',
        onClose: () => {
          soundEngine.stopTrack();
          this.showHome();
        },
      });
    } else {
      const nextArtist = ARTISTS[this.currentLevelIdx + 1];
      this.showModal({
        badge: `✅ NIVEL ${artist.level} SUPERADO`,
        title: `¡${artist.name} ahora es visible!`,
        body: `
          <p>Aprobación musical: <strong>${stats.approvalPct}%</strong> • Combo máximo: <strong>${stats.maxCombo}</strong></p>
          <p>Siguiente destino: <strong>Nivel ${nextArtist.level} — ${nextArtist.name}</strong> (${nextArtist.genre})</p>
        `,
        buttonText: `▶ Ir al Nivel ${nextArtist.level}`,
        onClose: () => this.startLevel(this.currentLevelIdx + 1),
      });
    }
  }

  startInfiniteMode() {
    this.infiniteMode = true;
    this.infiniteStreak = 0;
    const randomIdx = Math.floor(Math.random() * ARTISTS.length);
    this.startInfiniteSong(randomIdx);
  }

  startInfiniteSong(idx) {
    this.cleanupActivePhase();
    const artist = ARTISTS[idx];
    this.setTheme(artist.themeClass);
    this.topBar.classList.remove('hidden');
    this.hudLevel.textContent = `♾️ Infinito #${this.infiniteStreak + 1}`;
    this.hudArtist.textContent = artist.name;
    this.updateVisibilityHud(350, 350);

    soundEngine.playArtistTrack(artist, true);
    this.launchPhase2(artist);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
