import { useEffect, useState } from 'react';
import { api } from './api.js';
import { AdminPanel } from './AdminPanel.jsx';
import { Game } from './Game.jsx';

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
    <p className="game-subtitle">Descubre artistas, responde preguntas y haz que suene su música.</p>
    {children}
  </div></main>;

  if (staticDemo) return showAuthCard(<>
    <p className="auth-note">Demostración sin inicio de sesión ni guardado de progreso.</p>
    <button className="primary-btn" type="button" onClick={() => setDemo(true)}>▶ Probar el juego</button>
  </>);

  if (screen === 'entry') return showAuthCard(<>
    <h2>¿Cómo quieres jugar?</h2>
    <div className="auth-form">
      <button className="primary-btn" type="button" onClick={() => setDemo(true)}>▶ Jugar sin guardar</button>
      <p className="auth-note">No pide usuario ni contraseña. El avance se pierde al salir.</p>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('register'); setError(''); }}>Guardar para retomar</button>
      <p className="auth-note">Elige un alias y completa el nivel 1. Al terminar recibirás una contraseña.</p>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('login'); setError(''); }}>Ya tengo usuario y contraseña</button>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('admin'); setError(''); }}>Docente / administración</button>
    </div>
  </>);

  if (screen === 'register') return showAuthCard(<>
    <h2>Crear acceso para retomar</h2>
    <p className="auth-note">Primero completarás el nivel 1. Después aparecerá tu contraseña; anótala y guárdala. Usa un alias inventado, no tu nombre real.</p>
    <form onSubmit={beginEnrollment} className="auth-form">
      <label htmlFor="course-code">Código de curso que te dio tu docente</label>
      <input id="course-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} autoComplete="off" required />
      <label htmlFor="new-username">Alias inventado (3 a 20 caracteres)</label>
      <input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" minLength={3} maxLength={20} required />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-btn" disabled={busy}>▶ Comenzar nivel 1</button>
      <button className="secondary-btn" type="button" onClick={() => { setScreen('entry'); setError(''); }}>Volver</button>
    </form>
  </>);

  return showAuthCard(<>
    <h2>{screen === 'admin' ? 'Acceso docente' : 'Entrar para retomar'}</h2>
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
      <button className="secondary-btn" type="button" onClick={() => { setScreen('entry'); setError(''); }}>Volver</button>
    </form>
  </>);
}
