import { useEffect, useRef, useState } from 'react';
import { getGameContent } from '../data/contentStore.js';
import { soundEngine } from '../audio/soundEngine.js';
import { Phase1Controller } from '../components/phase1.js';
import { Phase2Controller } from '../components/phase2.js';
import { ArtistImage } from './ArtistImage.jsx';
import { api } from './api.js';

const freshProgress = () => ({
  maxUnlockedIdx: 0,
  campaignCompleted: false,
  discoveredIds: [],
  bestInfiniteStreak: 0,
  checkpoint: null,
  scores: {},
});

function GameStage({ kind, artist, checkpoint, runId, answeredIds, dvdLayer, wildcardOverlay,
  pausedRef, onVisibilityChange, onShowModal, onProgress, onComplete, onSuccess, onRetry }) {
  const containerRef = useRef(null);
  const callbacks = useRef({ onVisibilityChange, onShowModal, onProgress, onComplete, onSuccess, onRetry });
  callbacks.current = { onVisibilityChange, onShowModal, onProgress, onComplete, onSuccess, onRetry };

  useEffect(() => {
    const container = containerRef.current;
    const controller = kind === 'questions'
      ? new Phase1Controller({
          container,
          dvdLayer: dvdLayer.current,
          modalOverlay: wildcardOverlay.current,
          artist,
          answeredIds: answeredIds.current,
          checkpoint,
          isPausedFn: () => pausedRef.current,
          onVisibilityChange: (...args) => callbacks.current.onVisibilityChange(...args),
          onShowModal: (config) => callbacks.current.onShowModal(config),
          onProgress: (state) => callbacks.current.onProgress(state),
          onComplete: (visibility) => callbacks.current.onComplete(visibility),
        })
      : new Phase2Controller({
          container,
          artist,
          isPausedFn: () => pausedRef.current,
          onSuccess: (stats) => callbacks.current.onSuccess(stats),
          onRetryNeeded: (stats) => callbacks.current.onRetry(stats),
        });
    controller.start();
    return () => { controller.destroy(); container.innerHTML = ''; };
  }, [kind, artist.id, runId]);

  return <div ref={containerRef} />;
}

function YouTubePlayer({ video, paused, muted }) {
  const player = useRef(null);
  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', enablejsapi: '1', origin: location.origin });
  params.set('loop', '1');
  if (video.id) params.set('playlist', video.id);
  if (video.playlistId) {
    params.set('listType', 'playlist');
    params.set('list', video.playlistId);
  }
  const source = `https://www.youtube.com/embed${video.id ? `/${video.id}` : ''}?${params}`;
  const original = video.id
    ? `https://www.youtube.com/watch?v=${video.id}`
    : `https://www.youtube.com/playlist?list=${video.playlistId}`;

  useEffect(() => {
    const command = (func) => player.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
    command(muted ? 'mute' : 'unMute');
    command(paused ? 'pauseVideo' : 'playVideo');
  }, [paused, muted]);

  return <div className="level-media-player">
    <div className="media-player-heading"><strong>🎵 Escucha {video.title}</strong>
      <span>Al terminar, la música vuelve a empezar. Si no comienza, pulsa ▶ o <a href={original} target="_blank" rel="noopener noreferrer">ábrelo en YouTube</a>.
        {video.playlistUrl && <> <a href={video.playlistUrl} target="_blank" rel="noopener noreferrer">Escuchar álbum completo</a>.</>}</span></div>
    <iframe ref={player} src={source} title={video.title} allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
  </div>;
}

export function Game({ role, initialProgress, student, debugLevel, enrollment, onFirstLevelComplete, welcomePassword, onCredentialClose, onExit }) {
  const { artists: ARTISTS } = getGameContent();
  const [progress, setProgress] = useState(() => initialProgress || freshProgress());
  const progressRef = useRef(progress);
  const saveQueue = useRef(Promise.resolve());
  const answeredIds = useRef(new Set());
  const dvdLayer = useRef(null);
  const wildcardOverlay = useRef(null);
  const pausedRef = useRef(false);
  const visibilityRef = useRef(0);

  const [screen, setScreen] = useState('home');
  const [currentIdx, setCurrentIdx] = useState(debugLevel ?? 0);
  const [visibility, setVisibility] = useState(0);
  const [modal, setModal] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mediaActive, setMediaActive] = useState(false);
  const [runId, setRunId] = useState(0);
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [infiniteStreak, setInfiniteStreak] = useState(0);
  const [saveError, setSaveError] = useState('');

  const artist = ARTISTS[currentIdx];
  const discovered = new Set(progress.discoveredIds);
  const inGameplay = screen === 'questions' || screen === 'rhythm';
  pausedRef.current = paused;

  function commitProgress(change) {
    const next = { ...progressRef.current, ...change };
    progressRef.current = next;
    setProgress(next);
    if (role === 'student') {
      saveQueue.current = saveQueue.current
        .then(() => api('/api/progress', 'PUT', { progress: next }))
        .then(() => setSaveError(''))
        .catch((cause) => setSaveError(cause.message));
    }
    return next;
  }

  function showHome() {
    soundEngine.stopTrack();
    soundEngine.resume();
    setMediaActive(false);
    setPaused(false);
    pausedRef.current = false;
    setModal(null);
    setScreen('home');
  }

  function showPhase2Intro(levelArtist, earnedVisibility) {
    soundEngine.setPhaseVolume(true);
    setModal({
      badge: `🎸 FASE 2 • ${levelArtist.name}`,
      title: 'Ahora juega con el ritmo',
      body: `<p>Ganaste <strong>${earnedVisibility} puntos de Visibilidad</strong>.</p>
        <p>Pulsa <strong>A, S, K o L</strong> cuando una nota llegue a la zona de acierto. Las notas de este juego no siguen exactamente los golpes del audio.</p>
        <p>Meta de aprobación: <strong>${levelArtist.rhythm.minApprovalPct}%</strong>. Si fallas, puedes repetir esta fase.</p>`,
      buttonText: 'Comenzar ritmo',
      onClose: () => { setRunId((value) => value + 1); setScreen('rhythm'); },
    });
  }

  function startLevel(index, { resume = false } = {}) {
    const levelArtist = ARTISTS[index];
    const saved = progressRef.current.checkpoint;
    const checkpoint = resume && saved?.levelIdx === index ? saved : null;
    const firstCheckpoint = checkpoint || { levelIdx: index, stage: 'questions', questionIndex: 0, visibility: 0 };
    commitProgress({ checkpoint: firstCheckpoint });
    setInfiniteMode(false);
    setCurrentIdx(index);
    visibilityRef.current = firstCheckpoint.visibility;
    setVisibility(firstCheckpoint.visibility);
    setMediaActive(false);
    setScreen('transition');
    soundEngine.stopTrack();
    soundEngine.resume();
    if (!levelArtist.video) soundEngine.playArtistTrack(levelArtist, firstCheckpoint.stage === 'rhythm');

    if (firstCheckpoint.stage === 'rhythm') {
      showPhase2Intro(levelArtist, firstCheckpoint.visibility);
    } else {
      setModal({
        badge: `📡 FASE 1 • ${levelArtist.name}`,
        title: checkpoint ? 'Retoma tu cuestionario' : 'Conoce a la artista',
      body: `<p>Lee el contexto y responde cinco preguntas. Tienes dos intentos por pregunta.</p>
          <p>Al acertar sumas puntos de <strong>Visibilidad</strong>: representan el apoyo que das para que más personas descubran a esta artista.</p>
          <p>Toca el rostro que aparece para conocer un dato y sumar puntos extra.</p>
          <p>Tras un breve tiempo se habilitan ayudas de un solo uso. Para obtenerlas debes superar minijuegos, que se vuelven gradualmente más exigentes en los niveles posteriores.</p>`,
        buttonText: checkpoint ? 'Seguir jugando' : 'Iniciar nivel',
        onClose: () => { setMediaActive(true); setRunId((value) => value + 1); setScreen('questions'); },
      });
    }
  }

  function onVisibilityChange(value) {
    visibilityRef.current = value;
    setVisibility(value);
  }

  function onQuestionProgress(state) {
    commitProgress({ checkpoint: { levelIdx: currentIdx, stage: 'questions', ...state } });
  }

  function onQuestionsComplete(earnedVisibility) {
    visibilityRef.current = earnedVisibility;
    setVisibility(earnedVisibility);
    commitProgress({ checkpoint: { levelIdx: currentIdx, stage: 'rhythm', questionIndex: 5, visibility: earnedVisibility } });
    setScreen('transition');
    showPhase2Intro(artist, earnedVisibility);
  }

  function startInfiniteSong(index) {
    const levelArtist = ARTISTS[index];
    setCurrentIdx(index);
    visibilityRef.current = 350;
    setVisibility(350);
    setMediaActive(true);
    soundEngine.stopTrack();
    soundEngine.resume();
    if (!levelArtist.video) soundEngine.playArtistTrack(levelArtist, true);
    setRunId((value) => value + 1);
    setScreen('rhythm');
  }

  function onRhythmSuccess(stats) {
    setScreen('transition');
    if (infiniteMode) {
      const streak = infiniteStreak + 1;
      setInfiniteStreak(streak);
      commitProgress({ bestInfiniteStreak: Math.max(progressRef.current.bestInfiniteStreak, streak) });
      setModal({
        badge: '♾️ MODO INFINITO', title: `¡Superaste a ${artist.name}!`,
        body: `<p>Aprobación: <strong>${stats.approvalPct}%</strong> · Racha: <strong>${streak}</strong></p>`,
        buttonText: 'Siguiente artista',
        onClose: () => startInfiniteSong(Math.floor(Math.random() * ARTISTS.length)),
      });
      return;
    }

    const previous = progressRef.current;
    const ids = [...new Set([...previous.discoveredIds, artist.id])];
    const finalLevel = currentIdx === ARTISTS.length - 1;
    const completedProgress = commitProgress({
      discoveredIds: ids,
      maxUnlockedIdx: Math.max(previous.maxUnlockedIdx, Math.min(ARTISTS.length - 1, currentIdx + 1)),
      campaignCompleted: previous.campaignCompleted || finalLevel,
      checkpoint: null,
      scores: { ...previous.scores, [currentIdx]: {
        visibility: visibilityRef.current,
        approvalPct: stats.approvalPct,
        rhythmScore: stats.score,
        completedAt: Date.now(),
      } },
    });
    if (role === 'enroll' && currentIdx === 0) {
      const createAccount = () => {
        setModal({ kind: 'loading', badge: '🔐 CUENTA', title: 'Creando tu acceso…', body: '<p>Guardando el nivel que acabas de completar.</p>', buttonText: 'Un momento…', onClose: () => {} });
        onFirstLevelComplete(completedProgress).catch((cause) => {
          setModal({ badge: '⚠️ NO SE PUDO GUARDAR', title: 'Inténtalo otra vez', body: `<p>${cause.message}</p><p>Tu avance sigue abierto en este navegador.</p>`, buttonText: 'Reintentar', onClose: createAccount });
        });
      };
      createAccount();
      return;
    }
    if (finalLevel) {
      setModal({
        badge: '🏆 CAMPAÑA COMPLETADA', title: '¡Rompiste el algoritmo!',
        body: '<p>Descubriste a las 12 artistas. El modo infinito ya está disponible en el menú.</p>',
        buttonText: 'Volver al menú', onClose: showHome,
      });
    } else {
      const next = ARTISTS[currentIdx + 1];
      setModal({
        badge: `✅ NIVEL ${artist.level} SUPERADO`, title: `¡${artist.name} ahora es visible!`,
        body: `<p>Aprobación musical: <strong>${stats.approvalPct}%</strong>. Siguiente nivel: <strong>${next.name}</strong>.</p>`,
        buttonText: `Ir al nivel ${next.level}`,
        onClose: () => startLevel(currentIdx + 1),
      });
    }
  }

  function onRhythmRetry(stats) {
    setScreen('transition');
    setModal({
      badge: '🎵 ¡Casi!', title: `Lograste ${stats.approvalPct}%`,
      body: `<p>La meta es ${stats.minPct}%. Tu cuestionario queda guardado; puedes repetir solo el ritmo.</p>`,
      buttonText: 'Reintentar ritmo',
      onClose: () => { setRunId((value) => value + 1); setScreen('rhythm'); },
    });
  }

  function togglePause() {
    if (!inGameplay) return;
    if (paused) {
      pausedRef.current = false;
      setPaused(false);
      soundEngine.resume();
      setModal(null);
    } else if (!modal) {
      pausedRef.current = true;
      setPaused(true);
      soundEngine.pause();
      setModal({ kind: 'pause', badge: '⏸️ PAUSA', title: 'Tómate un respiro',
        body: '<p>Las notas y los temporizadores están detenidos.</p>', buttonText: 'Continuar',
        onClose: () => { pausedRef.current = false; setPaused(false); soundEngine.resume(); } });
    }
  }

  useEffect(() => {
    // Pre-cargar el retrato y portada de la artista actual y de la siguiente para que no tarden al abrir el nivel
    for (const idx of [currentIdx, Math.min(ARTISTS.length - 1, currentIdx + 1)]) {
      const a = ARTISTS[idx];
      if (!a?.files) continue;
      for (const imgPath of [a.files.photo, a.files.singleCover, a.files.albumCover]) {
        if (imgPath) {
          const img = new Image();
          img.src = imgPath;
        }
      }
    }
  }, [currentIdx]);

  useEffect(() => {
    document.body.className = screen === 'home' || screen === 'gallery' ? 'theme-default' : artist.themeClass;
  }, [screen, artist.themeClass]);

  useEffect(() => {
    const listener = (event) => {
      if ((event.key === 'Escape' || event.key.toLowerCase() === 'p') && inGameplay) {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [screen, paused, modal]);

  useEffect(() => {
    if (role === 'debug' && debugLevel !== undefined) startLevel(debugLevel);
    return () => { soundEngine.stopTrack(); document.body.className = 'theme-default'; };
  }, []);

  function closeModal() {
    const next = modal?.onClose;
    setModal(null);
    next?.();
  }

  const nextIdx = progress.checkpoint?.levelIdx ?? Math.min(progress.maxUnlockedIdx, ARTISTS.length - 1);
  const nextArtist = ARTISTS[nextIdx];
  const hudVisible = screen !== 'home' && screen !== 'gallery';

  return <>
    <header id="top-bar" className={`top-bar ${hudVisible ? '' : 'hidden'}`}>
      <div className="top-bar-left">
        <button className="icon-btn" type="button" onClick={showHome}>🏠 Menú</button>
        <div className="level-badge"><span>{infiniteMode ? `♾️ Infinito #${infiniteStreak + 1}` : `Nivel ${artist.level}/12`}</span>
          <span className="hud-artist-name">{artist.name}</span></div>
      </div>
      <div className="top-bar-center"><div className="visibility-meter-wrap">
        <div className="visibility-labels"><span>📡 Visibilidad</span><span>{visibility} / 350</span></div>
        <div className="visibility-bar"><div className="visibility-fill" style={{ width: `${Math.min(100, Math.round(visibility / 350 * 100))}%` }} /></div>
      </div></div>
      <div className="top-bar-right">
        <button className="icon-btn" type="button" onClick={() => {
          const next = !muted; setMuted(next); soundEngine.setMuted(next);
        }}>{muted ? '🔇' : '🔊'}</button>
        <button className="pause-btn" type="button" disabled={!inGameplay} onClick={togglePause}>{paused ? '▶ Continuar' : '⏸️ Pausa'}</button>
      </div>
    </header>

    {mediaActive && artist.video && hudVisible && <YouTubePlayer video={artist.video} paused={paused} muted={muted} />}

    <main id="screen-container" className="screen-container">
      {saveError && <p className="auth-error" role="alert">No se pudo guardar: {saveError}</p>}
      {screen === 'home' && <div className="home-screen">
        <div className="school-pill">🏫 Colegio Particular San Nicolás de Maipú • 7° Básico</div>
        <h1 className="game-title">ROMPE EL ALGORITMO</h1>
        <p className="game-subtitle">Sal de tus recomendaciones habituales: descubre 12 proyectos musicales liderados por mujeres, desde AKRIILA en Maipú hasta artistas de otros lugares del mundo.</p>
        <p className="session-label">{role === 'student' ? `Jugando como ${student.label}` : role === 'debug' ? 'Modo de prueba docente' : role === 'enroll' ? 'Nivel 1 para activar tu cuenta' : 'Práctica de esta sesión'}</p>
        {welcomePassword && <section className="credential-reveal" role="status">
          <h2>¡Tu contraseña está lista!</h2>
          <p>Usuario: <strong>{student?.username}</strong></p>
          <p>Contraseña (anótala): <code>{welcomePassword}</code></p>
          <p>Guárdala para retomar el juego otro día. Si la pierdes, pide ayuda a tu docente.</p>
          <button className="secondary-btn" type="button" onClick={onCredentialClose}>Ya la anoté</button>
        </section>}
        <div className="home-actions">
          <button className="primary-btn hero-btn" type="button" onClick={() => startLevel(nextIdx, { resume: true })}>
            ▶ {progress.checkpoint ? `Retomar ${nextArtist.name}` : `Jugar nivel ${nextArtist.level}: ${nextArtist.name}`}
          </button>
          <button className="secondary-btn" type="button" onClick={() => { soundEngine.stopTrack(); setScreen('gallery'); }}>
            Artistas descubiertas ({discovered.size}/12)
          </button>
          {progress.campaignCompleted && <button className="infinite-btn unlocked" type="button" onClick={() => {
              setInfiniteMode(true); setInfiniteStreak(0); startInfiniteSong(Math.floor(Math.random() * ARTISTS.length));
            }}>Modo infinito · récord {progress.bestInfiniteStreak}</button>}
          <button className="text-btn home-exit" type="button" onClick={onExit}>{role === 'debug' ? 'Volver al panel docente' : 'Salir del juego'}</button>
        </div>
        <section className="campaign-strip" aria-labelledby="campaign-title">
          <div className="campaign-heading">
            <h2 id="campaign-title">Ruta de la campaña</h2>
            <span className="campaign-count">{discovered.size} de 12 descubiertas</span>
          </div>
          <p className="campaign-help">Las portadas bloqueadas se revelan al completar cada nivel.</p>
          <div className="level-chips">
          {ARTISTS.map((item, index) => {
            const unlocked = role === 'debug' || index <= progress.maxUnlockedIdx;
            const done = discovered.has(item.id);
            return <button key={item.id} className={`level-chip ${done ? 'done' : unlocked ? 'open' : 'locked'}`}
              type="button" disabled={!unlocked} aria-label={`Nivel ${item.level}: ${done ? `${item.name}, descubierta` : unlocked ? `${item.name}, disponible` : 'artista por descubrir, bloqueado'}`}
              onClick={() => startLevel(index)}>
              <span className={`level-cover-wrap ${done ? 'revealed' : 'concealed'}`}>
                <ArtistImage artist={item} src={item.files.singleCover || item.files.albumCover}
                  alt={done ? `Portada de ${item.featuredSingle || item.featuredAlbum || item.albumTitle}` : ''} className="level-cover-img" />
                {!done && <span className="level-cover-lock" aria-hidden="true">🔒</span>}
              </span>
              <span className="level-chip-status">{done ? 'Descubierta' : unlocked ? 'Disponible' : 'Bloqueada'} · Nv. {item.level}</span>
              <strong>{done ? item.name : unlocked ? item.name : 'Por descubrir'}</strong>
              {done && <small>{item.featuredSingle || item.featuredAlbum || item.albumTitle}</small>}
              {item.isMaipuLocal && <em>Maipú</em>}</button>;
          })}
          </div>
        </section>
      </div>}

      {screen === 'gallery' && <div className="gallery-screen">
        <div className="gallery-header"><button className="secondary-btn" type="button" onClick={showHome}>⬅ Volver al menú</button>
          <div><h2>🏆 Artistas descubiertas</h2><p>Has visibilizado <strong>{discovered.size} de 12</strong> artistas.</p></div></div>
        <div className="gallery-grid">{ARTISTS.map((item, index) => {
          const unlocked = discovered.has(item.id);
          return <div key={item.id} className={`gallery-card ${unlocked ? 'unlocked' : 'locked'}`}
            style={{ '--card-accent': item.colors.primary }}>
            <div className="gal-img-wrap">{unlocked ? <ArtistImage artist={item} src={item.files.photo} alt={item.name} className="gal-img" /> : <div className="gal-locked-icon">🔒</div>}</div>
            <div className="gal-info"><div className="gal-badges"><span className="gal-level">Nivel {item.level}</span></div>
              <h3>{unlocked ? item.name : 'Artista por descubrir'}</h3>
              <p>{unlocked ? `${item.genre} · ${item.origin}` : 'Supera este nivel para descubrirla.'}</p>
              {unlocked && <button className="small-play-btn" type="button" onClick={() => startLevel(index)}>▶ Rejugar nivel</button>}
            </div>
          </div>;
        })}</div>
      </div>}

      {(screen === 'questions' || screen === 'rhythm') && <GameStage kind={screen} artist={artist}
        checkpoint={screen === 'questions' ? progressRef.current.checkpoint : null} runId={runId}
        answeredIds={answeredIds} dvdLayer={dvdLayer} wildcardOverlay={wildcardOverlay}
        pausedRef={pausedRef} onVisibilityChange={onVisibilityChange} onShowModal={setModal}
        onProgress={onQuestionProgress} onComplete={onQuestionsComplete}
        onSuccess={onRhythmSuccess} onRetry={onRhythmRetry} />}
    </main>

    <div ref={dvdLayer} className="dvd-layer hidden" />
    <div ref={wildcardOverlay} className="modal-overlay hidden" />
    {modal && <div className="modal-overlay"><div className="modal-card" role="dialog" aria-modal="true" aria-label={modal.title}>
      {modal.badge && <div className="modal-badge">{modal.badge}</div>}
      <h2>{modal.title}</h2><div className="modal-body" dangerouslySetInnerHTML={{ __html: modal.body }} />
      <button className="primary-btn" type="button" onClick={closeModal}>{modal.buttonText || 'Continuar'}</button>
      {modal.kind === 'pause' && <button className="secondary-btn modal-extra" type="button" onClick={showHome}>Salir al menú</button>}
    </div></div>}
  </>;
}
