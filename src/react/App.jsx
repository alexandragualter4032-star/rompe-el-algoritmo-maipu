import { useEffect, useState } from 'react';
import { api } from './api.js';
import { AdminPanel } from './AdminPanel.jsx';
import { Game } from './Game.jsx';
import { hasOffensiveUsernameTerm } from '../shared/usernames.js';

const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true';

export function App() {
  const [auth, setAuth] = useState(staticDemo ? { role: 'guest' } : null);
  const [screen, setScreen] = useState(new URLSearchParams(location.search).has('admin') ? 'admin' : 'entry');
  const [enrollment, setEnrollment] = useState(null);
  const [demo, setDemo] = useState(false);
  const [debugLevel, setDebugLevel] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [password, setPassword] = useState('');
  const [credential, setCredential] = useState(null);

  useEffect(() => {
    if (staticDemo) return;
    api('/api/me').then(setAuth).catch(() => setAuth({ role: 'guest' }));
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = screen === 'admin'
        ? await api('/api/admin/login', 'POST', { key: adminKey })
        : await api('/api/student/login', 'POST', { username, password });
      setAuth(result);
      setPassword('');
      setAdminKey('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function beginEnrollment(event) {
    event.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    const cleanCode = joinCode.toUpperCase().replace(/[\s-]/g, '');
    if (!/^[a-z0-9_-]{3,20}$/.test(cleanUser)) {
      setError('Usa un alias de 3 a 20 caracteres: letras sin tilde, números, guion o guion bajo. No uses tu nombre real.');
      return;
    }
    if (hasOffensiveUsernameTerm(cleanUser)) {
      setError('Ese alias no está permitido. Elige uno respetuoso y que no revele tu identidad.');
      return;
    }
    if (cleanCode.length !== 10) {
      setError('Pide al docente el código de curso y escríbelo tal como aparece.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/student/check-course', 'POST', { joinCode: cleanCode, username: cleanUser });
      setEnrollment({ username: cleanUser, joinCode: cleanCode });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishFirstLevel(progress) {
    const result = await api('/api/student/register', 'POST', { ...enrollment, progress });
    setCredential({ username: result.student.username, password: result.password });
    setEnrollment(null);
    setAuth(result);
  }

  async function logout() {
    try { await api('/api/logout', 'POST'); } catch { /* cerrar vista igualmente */ }
    setDebugLevel(null);
    setDemo(false);
    setEnrollment(null);
    setCredential(null);
    setScreen('entry');
    setAuth({ role: 'guest' });
  }

  if (!auth) return <main className="auth-screen"><p>Cargando juego…</p></main>;

  if (auth.role === 'admin') {
    if (debugLevel !== null) return <Game key={`debug-${debugLevel}`} role="debug" debugLevel={debugLevel} onExit={() => setDebugLevel(null)} />;
    return <AdminPanel onDebug={setDebugLevel} onLogout={logout} />;
  }

  if (auth.role === 'student') {
    return <Game key={`student-${auth.student.id}`} role="student" initialProgress={auth.progress}
      student={auth.student} welcomePassword={credential?.password} onCredentialClose={() => setCredential(null)} onExit={logout} />;
  }

  if (enrollment) return <Game role="enroll" enrollment={enrollment} onFirstLevelComplete={finishFirstLevel}
    onExit={() => setEnrollment(null)} />;
  if (demo) return <Game role="demo" onExit={() => setDemo(false)} />;

  const showAuthCard = (children) => <main className="auth-screen"><div className="auth-card">
    <div className="school-pill">🏫 Colegio Particular San Nicolás de Maipú • 7° Básico</div>
    <h1 className="game-title">ROMPE EL ALGORITMO</h1>
    <p className="game-subtitle">Romper el algoritmo es salir de las recomendaciones de siempre: descubre artistas, escucha su música y conoce sus historias.</p>
    {children}
  </div></main>;

  if (staticDemo) return showAuthCard(<>
    <p className="auth-note">Demostración sin inicio de sesión ni guardado de progreso.</p>
    <button className="primary-btn" type="button" onClick={() => setDemo(true)}>▶ Probar el juego</button>
  </>);

  if (screen === 'entry') return showAuthCard(<>
    <h2>¿Listo para jugar?</h2>
    <div className="entry-actions">
      <button className="primary-btn" type="button" onClick={() => setDemo(true)}>▶ Jugar ahora</button>
      <p className="auth-note">Sin cuenta ni códigos. El avance se reinicia cuando sales.</p>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('login'); setError(''); }}>Retomar una partida guardada</button>
      <button className="text-btn" type="button" onClick={() => { setScreen('admin'); setError(''); }}>Acceso docente</button>
    </div>
  </>);

  if (screen === 'register') return showAuthCard(<>
    <h2>Crear acceso para retomar</h2>
    <p className="auth-note">Primero completarás el nivel 1. Después aparecerá tu contraseña; anótala y guárdala. Usa un alias inventado, no tu nombre real.</p>
    <form onSubmit={beginEnrollment} className="auth-form">
      <label htmlFor="course-code">Código de curso que te dio tu docente</label>
      <input id="course-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} autoComplete="off" required />
      <label htmlFor="new-username">Alias inventado (3 a 20 caracteres, sin groserías ni datos personales)</label>
      <input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" minLength={3} maxLength={20} required />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-btn" disabled={busy}>▶ Comenzar nivel 1</button>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('entry'); setError(''); }}>Volver</button>
    </form>
  </>);

  return showAuthCard(<>
    <h2>{screen === 'admin' ? 'Acceso docente' : 'Retomar una partida'}</h2>
    {screen !== 'admin' && <p className="auth-note">Ingresa el usuario y la contraseña que guardaste. Si aún no tienes una cuenta, consulta a tu docente: crearla requiere un código de curso.</p>}
    {screen === 'admin' && <a className="github-project-link" href="https://github.com/alexandragualter4032-star/rompe-el-algoritmo-maipu" target="_blank" rel="noreferrer" aria-label="Ver proyecto en GitHub (se abre en una pestaña nueva)" title="Ver proyecto en GitHub">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.32-3.76-1.32-.5-1.29-1.24-1.63-1.24-1.63-1.02-.7.08-.69.08-.69 1.12.08 1.7 1.15 1.7 1.15 1 .1.74 2.19 3.48 1.56.1-.73.4-1.23.7-1.51-2.48-.28-5.1-1.24-5.1-5.52 0-1.22.44-2.22 1.15-3-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.69.11 2.98.72.78 1.15 1.78 1.15 3 0 4.29-2.62 5.23-5.12 5.51.4.35.75 1.03.75 2.08v3.07c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z"/></svg>
      <span>Ver proyecto en GitHub</span>
    </a>}
    <form onSubmit={login} className="auth-form">
      {screen === 'admin' ? <>
        <label htmlFor="admin-key">Clave de administración</label>
        <input id="admin-key" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="current-password" required />
      </> : <>
        <label htmlFor="username">Usuario</label>
        <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        <label htmlFor="student-password">Contraseña</label>
        <input id="student-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      </>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      {screen !== 'admin' && <button className="secondary-btn" type="button" onClick={() => { setScreen('register'); setError(''); }}>Crear cuenta con código de curso</button>}
      <button className="secondary-btn" type="button" onClick={() => { setScreen('entry'); setError(''); }}>Volver</button>
    </form>
  </>);
}
