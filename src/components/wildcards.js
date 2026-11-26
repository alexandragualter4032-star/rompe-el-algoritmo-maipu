import { soundEngine } from '../audio/soundEngine.js';

export const WILDCARD_DEFS = [
  {
    id: 'share',
    name: 'Compartir',
    effectLabel: 'Pista extra / Escudo',
    icon: '📤',
    minigameTitle: '¡Atrapa 3 íconos musicales!',
    minigameDesc: 'Haz clic en 3 notas que caen antes de que se acabe el tiempo (5s).',
  },
  {
    id: 'playlist',
    name: 'Agregar a Playlist',
    effectLabel: 'Elimina 2 opciones',
    icon: '➕',
    minigameTitle: '¡Detén la barra en la zona verde!',
    minigameDesc: 'Presiona "¡DETENER!" cuando el marcador pase por el centro verde (4s).',
  },
  {
    id: 'stream',
    name: 'Stremear',
    effectLabel: 'Puntos x2',
    icon: '🎧',
    minigameTitle: '¡Rompe el Algoritmo!',
    minigameDesc: 'Haz clic 3 veces seguidas en el botón antes de que desaparezca (4.5s).',
  },
];

export function openWildcardMinigame(wildcardId, modalOverlay, isPausedFn, onResult) {
  const def = WILDCARD_DEFS.find((w) => w.id === wildcardId);
  if (!def) return;

  modalOverlay.classList.remove('hidden');
  modalOverlay.innerHTML = `
    <div class="modal-card wildcard-modal">
      <div class="wildcard-badge">${def.icon} ${def.name} — ${def.effectLabel}</div>
      <h2>${def.minigameTitle}</h2>
      <p>${def.minigameDesc}</p>
      <div class="mg-timer-bar"><div id="mg-timer-fill" class="mg-timer-fill"></div></div>
      <div id="mg-arena" class="mg-arena"></div>
      <div id="mg-status" class="mg-status"></div>
    </div>
  `;

  const arena = modalOverlay.querySelector('#mg-arena');
  const timerFill = modalOverlay.querySelector('#mg-timer-fill');
  const statusEl = modalOverlay.querySelector('#mg-status');

  let finished = false;
  const finish = (won) => {
    if (finished) return;
    finished = true;
    soundEngine.playSfx(won ? 'win' : 'wrong');
    statusEl.textContent = won
      ? `✅ ¡Logrado! Activaste: ${def.effectLabel}`
      : '😅 ¡Casi! No se activó esta vez.';
    statusEl.className = `mg-status ${won ? 'win' : 'lose'}`;
    setTimeout(() => {
      modalOverlay.classList.add('hidden');
      modalOverlay.innerHTML = '';
      onResult(won);
    }, 900);
  };

  const durationMs = wildcardId === 'share' ? 5000 : wildcardId === 'playlist' ? 4000 : 4500;
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
    runCatchMinigame(arena, isPausedFn, () => finish(true));
  } else if (wildcardId === 'playlist') {
    runTimingBarMinigame(arena, isPausedFn, (won) => finish(won));
  } else {
    runBreakAlgorithmMinigame(arena, isPausedFn, () => finish(true));
  }
}

function runCatchMinigame(arena, isPausedFn, onWin) {
  let caught = 0;
  arena.innerHTML = `
    <div class="mg-catch-counter">Atrapados: <strong id="mg-caught">0</strong> / 3</div>
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
    item.style.left = `${10 + Math.random() * 78}%`;
    item.style.top = '-20px';

    let y = -20;
    const speed = 75 + Math.random() * 45;
    let alive = true;

    item.addEventListener('click', () => {
      if (!alive || isPausedFn()) return;
      alive = false;
      item.remove();
      caught += 1;
      counterEl.textContent = String(caught);
      soundEngine.playSfx('hit');
      if (caught >= 3) {
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
  }, 650);
}

function runTimingBarMinigame(arena, isPausedFn, onDone) {
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
      pos += dir * 135 * dt;
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
    const won = pos >= 34 && pos <= 66;
    onDone(won);
  });
}

function runBreakAlgorithmMinigame(arena, isPausedFn, onWin) {
  let clicks = 0;
  arena.innerHTML = `
    <div class="mg-catch-counter">Clics: <strong id="mg-clicks">0</strong> / 3</div>
    <button id="mg-break-btn" type="button" class="mg-break-btn">⚡ ROMPER ALGORITMO</button>
  `;
  const clicksEl = arena.querySelector('#mg-clicks');
  const btn = arena.querySelector('#mg-break-btn');

  btn.addEventListener('click', () => {
    if (isPausedFn()) return;
    clicks += 1;
    clicksEl.textContent = String(clicks);
    soundEngine.playSfx('hit');
    btn.style.transform = `translate(${Math.round((Math.random() - 0.5) * 80)}px, ${Math.round((Math.random() - 0.5) * 35)}px)`;
    if (clicks >= 3) {
      onWin();
    }
  });
}
