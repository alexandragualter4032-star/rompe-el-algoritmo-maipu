import { soundEngine } from '../audio/soundEngine.js';

export const WILDCARD_DEFS = [
  {
    id: 'share',
    name: 'Compartir',
    effectLabel: 'Pista extra / Escudo',
    icon: '📤',
    minigameTitle: '¡Atrapa íconos musicales!',
  },
  {
    id: 'playlist',
    name: 'Agregar a Playlist',
    effectLabel: 'Elimina 2 opciones',
    icon: '➕',
    minigameTitle: '¡Detén la barra en la zona verde!',
  },
  {
    id: 'stream',
    name: 'Stremear',
    effectLabel: 'Puntos x2',
    icon: '🎧',
    minigameTitle: '¡Rompe el Algoritmo!',
  },
];

export function getWildcardRules(levelNumber = 1) {
  const band = Math.min(2, Math.floor((Math.max(1, levelNumber) - 1) / 4));
  return {
    band,
    cooldownSec: [30, 34, 38][band],
    maxUses: [3, 2, 2][band],
    eliminateCount: band === 0 ? 2 : 1,
    catchTarget: [3, 4, 4][band],
    catchDurationMs: [5000, 4700, 4500][band],
    catchSpawnMs: [650, 600, 600][band],
    catchSpeed: [75, 85, 90][band],
    timingHalfWidth: [16, 13, 11][band],
    timingSpeed: [135, 145, 155][band],
    streamClicks: [3, 4, 4][band],
    streamDurationMs: [4500, 4300, 4200][band],
    streamOffset: [40, 50, 60][band],
    hintText: [
      'Relaciona el contexto con una acción concreta que amplíe las oportunidades para artistas.',
      'Compara las alternativas con una evidencia específica del contexto.',
      'Distingue la causa de sus consecuencias y elige solo lo que el contexto respalda.',
    ][band],
  };
}

export function openWildcardMinigame(wildcardId, modalOverlay, isPausedFn, onResult, levelNumber = 1) {
  const def = WILDCARD_DEFS.find((w) => w.id === wildcardId);
  if (!def) return;
  const rules = getWildcardRules(levelNumber);
  const effectLabel = wildcardId === 'playlist'
    ? `Elimina ${rules.eliminateCount} ${rules.eliminateCount === 1 ? 'opción' : 'opciones'}`
    : def.effectLabel;
  const descriptions = {
    share: `Atrapa ${rules.catchTarget} íconos musicales antes de que se acabe el tiempo.`,
    playlist: 'Detén la barra dentro de la zona verde central.',
    stream: `Pulsa ${rules.streamClicks} veces el botón mientras se mueve antes de que se acabe el tiempo.`,
  };

  modalOverlay.classList.remove('hidden');
  modalOverlay.innerHTML = `
    <div class="modal-card wildcard-modal" role="dialog" aria-modal="true" aria-labelledby="wildcard-title" aria-describedby="wildcard-description">
      <div class="wildcard-badge">${def.icon} ${def.name} — ${effectLabel}</div>
      <h2 id="wildcard-title">${wildcardId === 'share' ? '¡Atrapa íconos musicales!' : wildcardId === 'stream' ? '¡Rompe el Algoritmo!' : def.minigameTitle}</h2>
      <p id="wildcard-description">${descriptions[wildcardId] || def.minigameDesc}</p>
      <div class="mg-timer-bar"><div id="mg-timer-fill" class="mg-timer-fill"></div></div>
      <div id="mg-arena" class="mg-arena"></div>
      <div id="mg-status" class="mg-status" role="status" aria-live="polite" tabindex="-1"></div>
    </div>
  `;

  const arena = modalOverlay.querySelector('#mg-arena');
  const timerFill = modalOverlay.querySelector('#mg-timer-fill');
  const statusEl = modalOverlay.querySelector('#mg-status');
  const dialogEl = modalOverlay.querySelector('[role="dialog"]');
  const focusableControls = () => [...dialogEl.querySelectorAll('button:not(:disabled)')];
  const trapTab = (event) => {
    if (event.key !== 'Tab') return;
    const controls = focusableControls();
    if (controls.length === 0) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  dialogEl.addEventListener('keydown', trapTab);

  let finished = false;
  const finish = (won) => {
    if (finished) return;
    finished = true;
    soundEngine.playSfx(won ? 'win' : 'wrong');
    statusEl.textContent = won
      ? `✅ ¡Logrado! Activaste: ${effectLabel}`
      : '😅 ¡Casi! No se activó esta vez.';
    statusEl.className = `mg-status ${won ? 'win' : 'lose'}`;
    dialogEl.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    statusEl.focus();
    setTimeout(() => {
      dialogEl.removeEventListener('keydown', trapTab);
      modalOverlay.classList.add('hidden');
      modalOverlay.innerHTML = '';
      onResult(won);
    }, 900);
  };

  const durationMs = wildcardId === 'share' ? rules.catchDurationMs : wildcardId === 'playlist' ? 4000 : rules.streamDurationMs;
  let elapsed = 0;
  let last = performance.now();

  const tickTimer = (now) => {
    if (finished) return;
    const dt = now - last;
    last = now;
    if (!isPausedFn()) {
      elapsed += dt;
      const pct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      timerFill.style.width = `${pct}%`;
      if (elapsed >= durationMs) {
        finish(false);
        return;
      }
    }
    requestAnimationFrame(tickTimer);
  };
  requestAnimationFrame(tickTimer);

  if (wildcardId === 'share') {
    runCatchMinigame(arena, isPausedFn, rules, () => finish(true));
  } else if (wildcardId === 'playlist') {
    runTimingBarMinigame(arena, isPausedFn, rules, (won) => finish(won));
  } else {
    runBreakAlgorithmMinigame(arena, isPausedFn, rules, () => finish(true));
  }
  requestAnimationFrame(() => focusableControls()[0]?.focus());
}

function runCatchMinigame(arena, isPausedFn, rules, onWin) {
  let caught = 0;
  arena.innerHTML = `
    <div class="mg-catch-counter">Atrapados: <strong id="mg-caught">0</strong> / ${rules.catchTarget}</div>
    <div id="mg-drop-zone" class="mg-drop-zone"></div>
  `;
  const counterEl = arena.querySelector('#mg-caught');
  const zone = arena.querySelector('#mg-drop-zone');
  const icons = ['🎵', '🎧', '🎤', '💿', '✨'];

  const spawnIcon = () => {
    if (!arena.isConnected) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'mg-falling-icon';
    item.textContent = icons[Math.floor(Math.random() * icons.length)];
    item.setAttribute('aria-label', 'Atrapar nota musical');
    item.style.left = `${10 + Math.random() * 78}%`;
    item.style.top = '-20px';

    let y = -20;
    const speed = rules.catchSpeed + Math.random() * 45;
    let alive = true;

    item.addEventListener('click', () => {
      if (!alive || isPausedFn()) return;
      alive = false;
      item.remove();
      caught += 1;
      counterEl.textContent = String(caught);
      soundEngine.playSfx('hit');
      if (caught >= rules.catchTarget) {
        onWin();
      }
    });

    zone.appendChild(item);

    let last = performance.now();
    const fall = (now) => {
      if (!alive || !item.isConnected) return;
      const dt = (now - last) / 1000;
      last = now;
      if (!isPausedFn()) {
        y += speed * dt;
        item.style.top = `${y}px`;
        if (y > 170) {
          alive = false;
          item.remove();
          return;
        }
      }
      requestAnimationFrame(fall);
    };
    requestAnimationFrame(fall);
  };

  spawnIcon();
  const spawner = setInterval(() => {
    if (!arena.isConnected) {
      clearInterval(spawner);
      return;
    }
    if (!isPausedFn()) spawnIcon();
  }, rules.catchSpawnMs);
}

function runTimingBarMinigame(arena, isPausedFn, rules, onDone) {
  arena.innerHTML = `
    <div class="mg-bar-track">
      <div class="mg-bar-green"></div>
      <div id="mg-bar-cursor" class="mg-bar-cursor"></div>
    </div>
    <button id="mg-stop-btn" type="button" class="primary-btn">¡DETENER!</button>
  `;
  const cursor = arena.querySelector('#mg-bar-cursor');
  const stopBtn = arena.querySelector('#mg-stop-btn');

  let pos = 10;
  let dir = 1;
  let stopped = false;
  let last = performance.now();

  const move = (now) => {
    if (stopped || !arena.isConnected) return;
    const dt = (now - last) / 1000;
    last = now;
    if (!isPausedFn()) {
      pos += dir * rules.timingSpeed * dt;
      if (pos >= 95) {
        pos = 95;
        dir = -1;
      } else if (pos <= 5) {
        pos = 5;
        dir = 1;
      }
      cursor.style.left = `${pos}%`;
    }
    requestAnimationFrame(move);
  };
  requestAnimationFrame(move);

  stopBtn.addEventListener('click', () => {
    if (stopped || isPausedFn()) return;
    stopped = true;
    const won = pos >= 50 - rules.timingHalfWidth && pos <= 50 + rules.timingHalfWidth;
    onDone(won);
  });
}

function runBreakAlgorithmMinigame(arena, isPausedFn, rules, onWin) {
  let clicks = 0;
  arena.innerHTML = `
    <div class="mg-catch-counter">Clics: <strong id="mg-clicks">0</strong> / ${rules.streamClicks}</div>
    <button id="mg-break-btn" type="button" class="mg-break-btn">⚡ ROMPER ALGORITMO</button>
  `;
  const clicksEl = arena.querySelector('#mg-clicks');
  const btn = arena.querySelector('#mg-break-btn');

  btn.addEventListener('click', () => {
    if (isPausedFn()) return;
    clicks += 1;
    clicksEl.textContent = String(clicks);
    soundEngine.playSfx('hit');
    btn.style.transform = `translate(${Math.round((Math.random() - 0.5) * rules.streamOffset * 2)}px, ${Math.round((Math.random() - 0.5) * rules.streamOffset)}px)`;
    if (clicks >= rules.streamClicks) {
      onWin();
    }
  });
}
