import { QUESTIONS } from '../data/questions.js';
import { soundEngine } from '../audio/soundEngine.js';
import { createArtistImage, getPhotoFallbackSvg } from './placeholders.js';
import { DvdFloater } from './dvdFloater.js';
import { WILDCARD_DEFS, getWildcardRules, openWildcardMinigame } from './wildcards.js';

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
    onProgress,
    checkpoint,
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
    this.onProgress = onProgress;

    this.questions = [...(QUESTIONS[artist.id] || [])];
    this.optionOrders = this.questions.map((question) => {
      const order = question.options.map((_, index) => index);
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [order[index], order[swap]] = [order[swap], order[index]];
      }
      return order;
    });

    this.qIndex = Math.min(this.questions.length, Math.max(0, checkpoint?.questionIndex || 0));
    this.visibility = Math.max(0, checkpoint?.visibility || 0);
    this.visibilityGoal = 350;

    // Estado por pregunta
    this.attemptsUsed = 0;
    this.eliminatedOptions = new Set();
    this.shieldActive = false;
    this.shieldConsumed = false;
    this.doublePointsActive = false;
    this.questionLocked = false;

    // Las ayudas se vuelven algo más exigentes cada cuatro niveles.
    this.wildcardRules = getWildcardRules(artist.level || 1);
    this.wildcardCooldownSec = this.wildcardRules.cooldownSec;
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
          badge: `✨ Dato sobre ${this.artist.name}`,
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
    const coverCards = [];
    if (this.artist.files.singleCover || this.artist.files.albumCover) {
      coverCards.push({
        cover: this.artist.files.singleCover || this.artist.files.albumCover,
        label: this.artist.featuredSingle ? 'Single destacado' : 'Disco destacado',
        title: this.artist.featuredSingle || this.artist.featuredAlbum || this.artist.albumTitle,
      });
    }
    (this.artist.additionalAlbums || []).forEach((album) => coverCards.push(album));
    const coverCardsMarkup = coverCards.map((album, index) => `
      <div class="album-cover-card">
        <div id="album-cover-slot-${index}" class="album-cover-image"></div>
        <div><small>${album.label || 'Disco destacado'}</small><strong>${album.title}</strong></div>
      </div>
    `).join('');

    this.container.innerHTML = `
      <div class="phase1-layout">
        <aside class="artist-stage-card">
          <div class="decor-chip">${this.artist.decorLabel}</div>
          <div id="artist-photo-slot" class="artist-photo-frame"></div>
          ${coverCardsMarkup ? `<div class="featured-albums">${coverCardsMarkup}</div>` : ''}
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
            <div class="box-label">💡 Contexto</div>
            <p>${q.context}</p>
            <div id="extra-hint-box" class="extra-hint ${this.shieldActive ? '' : 'hidden'}">
              🛡️ <strong>Pista protectora:</strong> ${this.wildcardRules.hintText} Tu próximo intento fallido no consume tu oportunidad.
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
            <div id="q-feedback" class="q-feedback hidden" role="status" aria-live="polite"></div>
          </div>

          <div class="wildcards-bar">
            <div class="wildcards-title">Ayudas del juego</div>
            <p class="wildcards-help">Se activan tras ${this.wildcardRules.cooldownSec} s. Puedes usar hasta ${this.wildcardRules.maxUses} ayudas en este nivel; los minijuegos suben suavemente de dificultad durante la campaña.</p>
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

    coverCards.forEach((album, index) => {
      this.container.querySelector(`#album-cover-slot-${index}`).appendChild(
        createArtistImage(
          album.cover,
          getPhotoFallbackSvg(this.artist),
          `Portada de ${album.title}`,
          'album-cover-img'
        )
      );
    });

    this.renderOptions(q);
    this.updateWildcardButtons();
  }

  renderOptions(q) {
    const list = this.container.querySelector('#options-list');
    list.innerHTML = '';

    this.optionOrders[this.qIndex].forEach((idx, visualIndex) => {
      const optText = q.options[idx];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.dataset.index = String(idx);
      btn.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + visualIndex)}</span><span>${optText}</span>`;

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
      if (this.shieldConsumed) pts = Math.min(pts, 70);
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

      if (this.shieldActive && !this.shieldConsumed) {
        this.shieldConsumed = true;
        feedbackEl.className = 'q-feedback retry';
        feedbackEl.textContent = '🛡️ El escudo absorbió este error. Lee de nuevo el contexto y prueba otra opción.';
        feedbackEl.classList.remove('hidden');
        this.updateWildcardButtons();
      } else if (this.attemptsUsed === 0) {
        this.attemptsUsed = 1;
        feedbackEl.className = 'q-feedback retry';
        feedbackEl.textContent = this.shieldActive
          ? '🛡️ ¡Escudo usado! ¡Casi! Inténtalo de nuevo con las opciones restantes.'
          : '😅 ¡Casi! Inténtalo de nuevo (segunda oportunidad).';
        feedbackEl.classList.remove('hidden');
        this.updateWildcardButtons();
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
    this.shieldConsumed = false;
    this.doublePointsActive = false;
    this.questionLocked = false;
    this.onProgress?.({ questionIndex: this.qIndex, visibility: this.visibility });
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
      const useLimitReached = this.usedWildcards.size >= this.wildcardRules.maxUses && !used;
      const needsAttempt = wc.id === 'playlist' && this.wildcardRules.band === 2 && this.attemptsUsed === 0;
      btn.className = `wildcard-btn ${used ? 'used' : locked || needsAttempt || useLimitReached ? 'charging' : 'ready'}`;
      btn.disabled = used || locked || this.questionLocked || needsAttempt || useLimitReached;

      let statusText = wc.id === 'playlist'
        ? `Elimina ${this.wildcardRules.eliminateCount} ${this.wildcardRules.eliminateCount === 1 ? 'opción' : 'opciones'}`
        : wc.effectLabel;
      if (used) statusText = 'Usado en este nivel';
      else if (locked) statusText = `⏳ Disponible en ${this.wildcardCooldownSec}s`;
      else if (useLimitReached) statusText = 'Ya alcanzaste el límite de ayudas de este nivel';
      else if (needsAttempt) statusText = 'Disponible después de tu primer intento';

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
    if (this.wildcardCooldownSec > 0 || this.usedWildcards.size >= this.wildcardRules.maxUses || this.usedWildcards.has(wildcardId) || this.questionLocked) return;
    this.usedWildcards.add(wildcardId);
    this.updateWildcardButtons();

    openWildcardMinigame(wildcardId, this.modalOverlay, this.isPausedFn, (won) => {
      if (!won) {
        requestAnimationFrame(() => this.container.querySelector('#options-list .option-btn:not(:disabled)')?.focus());
        return;
      }
      if (wildcardId === 'share') {
        this.shieldActive = true;
      } else if (wildcardId === 'stream') {
        this.doublePointsActive = true;
      } else if (wildcardId === 'playlist') {
        const q = this.questions[this.qIndex];
        const wrongIndices = [0, 1, 2, 3].filter(
          (i) => i !== q.correctIndex && !this.eliminatedOptions.has(i)
        );
        wrongIndices.slice(0, this.wildcardRules.eliminateCount).forEach((i) => this.eliminatedOptions.add(i));
      }
      this.render();
      requestAnimationFrame(() => {
        const nextControl = this.container.querySelector('#wildcards-grid button:not(:disabled)')
          || this.container.querySelector('#options-list .option-btn:not(:disabled)');
        nextControl?.focus();
      });
    }, this.artist.level || 1);
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
