import { QUESTIONS } from '../data/questions.js';
import { soundEngine } from '../audio/soundEngine.js';
import { createArtistImage, getPhotoFallbackSvg } from './placeholders.js';
import { DvdFloater } from './dvdFloater.js';
import { WILDCARD_DEFS, openWildcardMinigame } from './wildcards.js';

export class Phase1Controller {
  constructor({
    container,
    dvdLayer,
    modalOverlay,
    artist,
    answeredIds,
    isPausedFn,
    onVisibilityChange,
    onShowModal,
    onComplete,
  }) {
    this.container = container;
    this.dvdLayer = dvdLayer;
    this.modalOverlay = modalOverlay;
    this.artist = artist;
    this.answeredIds = answeredIds;
    this.isPausedFn = isPausedFn;
    this.onVisibilityChange = onVisibilityChange;
    this.onShowModal = onShowModal;
    this.onComplete = onComplete;

    this.questions = (QUESTIONS[artist.id] || []).filter((q) => !answeredIds.has(q.id));
    if (this.questions.length === 0) {
      this.questions = [...(QUESTIONS[artist.id] || [])];
    }

    this.qIndex = 0;
    this.visibility = 0;
    this.visibilityGoal = 350;

    // Estado por pregunta
    this.attemptsUsed = 0;
    this.eliminatedOptions = new Set();
    this.shieldActive = false;
    this.doublePointsActive = false;
    this.questionLocked = false;

    // Comodines: se habilitan después de 30s en el nivel
    this.wildcardCooldownSec = 30;
    this.usedWildcards = new Set();
    this.cooldownTimer = null;

    this.dvdFloater = null;
  }

  start() {
    this.onVisibilityChange(this.visibility, this.visibilityGoal);
    this.render();
    this.startWildcardCooldown();

    this.dvdFloater = new DvdFloater({
      layerEl: this.dvdLayer,
      artist: this.artist,
      isPausedFn: this.isPausedFn,
      onShowFactModal: (fact, onClose) => {
        this.addVisibility(35);
        this.onShowModal({
          badge: `✨ Dato Curioso Real • ${this.artist.name}`,
          title: '¡Atrapaste el rostro luminoso! (+35 Visibilidad)',
          body: `<p class="fact-text">${fact}</p>`,
          buttonText: '¡Genial, seguir jugando!',
          onClose,
        });
      },
    });
    this.dvdFloater.start();
  }

  startWildcardCooldown() {
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      if (this.isPausedFn()) return;
      if (this.wildcardCooldownSec > 0) {
        this.wildcardCooldownSec -= 1;
        this.updateWildcardButtons();
        if (this.wildcardCooldownSec === 0) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      }
    }, 1000);
  }

  addVisibility(amount) {
    this.visibility += amount;
    this.onVisibilityChange(this.visibility, this.visibilityGoal);
  }

  render() {
    const q = this.questions[this.qIndex];
    if (!q) {
      this.finishPhase();
      return;
    }

    const maipuBanner = this.artist.isMaipuLocal
      ? `<div class="maipu-spotlight">📍 PROTAGONISTA LOCAL: Orgullo de Maipú — la misma comuna de nuestro colegio</div>`
      : '';

    this.container.innerHTML = `
      <div class="phase1-layout">
        <aside class="artist-stage-card">
          <div class="decor-chip">${this.artist.decorLabel}</div>
          <div id="artist-photo-slot" class="artist-photo-frame"></div>
          <div class="artist-meta">
            <h2>${this.artist.name}</h2>
            <p class="artist-origin">${this.artist.origin} • ${this.artist.genre}</p>
            <p class="artist-tagline">${this.artist.tagline}</p>
            <div class="symbol-row">${this.artist.symbols.map((s) => `<span>${s}</span>`).join('')}</div>
          </div>
        </aside>

        <section class="question-panel">
          ${maipuBanner}
          <div class="question-header">
            <span class="q-counter">Desafío ${this.qIndex + 1} de ${this.questions.length}</span>
            <span class="q-no-timer">🕊️ Sin límite de tiempo — lee con calma</span>
          </div>

          <div class="context-box">
            <div class="box-label">💡 Contexto / Pista</div>
            <p>${q.context}</p>
            <div id="extra-hint-box" class="extra-hint ${this.shieldActive ? '' : 'hidden'}">
              🛡️ <strong>Pista / Escudo activo:</strong> Tu próximo intento está protegido y la respuesta correcta habla de romper sesgos o dar visibilidad real.
            </div>
          </div>

          <div class="question-box">
            <div class="box-label">❓ Pregunta directa</div>
            <h3>${q.question}</h3>
            <div id="active-buffs" class="active-buffs">
              ${this.doublePointsActive ? '<span class="buff-pill">🎧 Puntos x2 activo</span>' : ''}
              ${this.shieldActive ? '<span class="buff-pill">📤 Escudo activo</span>' : ''}
            </div>
            <div id="options-list" class="options-list"></div>
            <div id="q-feedback" class="q-feedback hidden"></div>
          </div>

          <div class="wildcards-bar">
            <div class="wildcards-title">⚡ Comodines estratégicos (1 uso por nivel):</div>
            <div id="wildcards-grid" class="wildcards-grid"></div>
          </div>
        </section>
      </div>
    `;

    const photoSlot = this.container.querySelector('#artist-photo-slot');
    photoSlot.appendChild(
      createArtistImage(
        this.artist.files.photo,
        getPhotoFallbackSvg(this.artist),
        this.artist.name,
        'artist-photo-img'
      )
    );

    this.renderOptions(q);
    this.updateWildcardButtons();
  }

  renderOptions(q) {
    const list = this.container.querySelector('#options-list');
    list.innerHTML = '';

    q.options.forEach((optText, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.dataset.index = String(idx);
      btn.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + idx)}</span><span>${optText}</span>`;

      if (this.eliminatedOptions.has(idx)) {
        btn.disabled = true;
        btn.classList.add('eliminated');
      }

      btn.addEventListener('click', () => this.handleOptionClick(idx, btn));
      list.appendChild(btn);
    });
  }

  handleOptionClick(idx, btn) {
    if (this.questionLocked || this.isPausedFn()) return;
    const q = this.questions[this.qIndex];
    const feedbackEl = this.container.querySelector('#q-feedback');

    if (idx === q.correctIndex) {
      this.questionLocked = true;
      btn.classList.add('correct');
      soundEngine.playSfx('correct');

      let pts = this.attemptsUsed === 0 ? 100 : 70;
      if (this.doublePointsActive) pts *= 2;

      this.answeredIds.add(q.id);
      this.addVisibility(pts);

      feedbackEl.className = 'q-feedback success';
      feedbackEl.innerHTML = `✅ ${q.feedback} <strong>(+${pts} Visibilidad)</strong>`;
      feedbackEl.classList.remove('hidden');

      setTimeout(() => this.advanceQuestion(), 1450);
    } else {
      soundEngine.playSfx('wrong');
      this.eliminatedOptions.add(idx);
      btn.disabled = true;
      btn.classList.add('wrong');

      if (this.attemptsUsed === 0) {
        this.attemptsUsed = 1;
        feedbackEl.className = 'q-feedback retry';
        feedbackEl.textContent = this.shieldActive
          ? '🛡️ ¡Escudo usado! ¡Casi! Inténtalo de nuevo con las opciones restantes.'
          : '😅 ¡Casi! Inténtalo de nuevo (segunda oportunidad).';
        feedbackEl.classList.remove('hidden');
      } else {
        // Segundo fallo: mostrar respuesta correcta y avanzar
        this.questionLocked = true;
        const correctBtn = this.container.querySelector(`.option-btn[data-index="${q.correctIndex}"]`);
        if (correctBtn) correctBtn.classList.add('correct');

        const effortPts = this.shieldActive ? 70 : 45;
        this.answeredIds.add(q.id);
        this.addVisibility(effortPts);

        feedbackEl.className = 'q-feedback info';
        feedbackEl.innerHTML = `💡 Respuesta correcta marcada arriba. ${q.feedback} <strong>(+${effortPts} Visibilidad por aprender)</strong>`;
        feedbackEl.classList.remove('hidden');

        setTimeout(() => this.advanceQuestion(), 2100);
      }
    }
  }

  advanceQuestion() {
    this.qIndex += 1;
    this.attemptsUsed = 0;
    this.eliminatedOptions.clear();
    this.shieldActive = false;
    this.doublePointsActive = false;
    this.questionLocked = false;
    this.render();
  }

  updateWildcardButtons() {
    const grid = this.container.querySelector('#wildcards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    WILDCARD_DEFS.forEach((wc) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const used = this.usedWildcards.has(wc.id);
      const locked = this.wildcardCooldownSec > 0;
      btn.className = `wildcard-btn ${used ? 'used' : locked ? 'charging' : 'ready'}`;
      btn.disabled = used || locked || this.questionLocked;

      let statusText = wc.effectLabel;
      if (used) statusText = 'Usado en este nivel';
      else if (locked) statusText = `⏳ Disponible en ${this.wildcardCooldownSec}s`;

      btn.innerHTML = `
        <span class="wc-icon">${wc.icon}</span>
        <span class="wc-text">
          <strong>${wc.name}</strong>
          <small>${statusText}</small>
        </span>
      `;

      btn.addEventListener('click', () => this.activateWildcard(wc.id));
      grid.appendChild(btn);
    });
  }

  activateWildcard(wildcardId) {
    if (this.wildcardCooldownSec > 0 || this.usedWildcards.has(wildcardId) || this.questionLocked) return;
    this.usedWildcards.add(wildcardId);
    this.updateWildcardButtons();

    openWildcardMinigame(wildcardId, this.modalOverlay, this.isPausedFn, (won) => {
      if (!won) return;
      if (wildcardId === 'share') {
        this.shieldActive = true;
      } else if (wildcardId === 'stream') {
        this.doublePointsActive = true;
      } else if (wildcardId === 'playlist') {
        const q = this.questions[this.qIndex];
        const wrongIndices = [0, 1, 2, 3].filter(
          (i) => i !== q.correctIndex && !this.eliminatedOptions.has(i)
        );
        wrongIndices.slice(0, 2).forEach((i) => this.eliminatedOptions.add(i));
      }
      this.render();
    });
  }

  finishPhase() {
    this.destroy();
    this.onComplete(this.visibility);
  }

  destroy() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    if (this.dvdFloater) {
      this.dvdFloater.destroy();
      this.dvdFloater = null;
    }
  }
}
