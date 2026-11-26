import { useEffect, useState } from 'react';
import { api } from './api.js';
import { AdminPanel } from './AdminPanel.jsx';
import { Game } from './Game.jsx';

const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true';

export function App() {
  const [auth, setAuth] = useState(staticDemo ? { role: 'guest' } : null);
  const [loginMode, setLoginMode] = useState(new URLSearchParams(location.search).has('admin') ? 'admin' : 'student');
  const [demo, setDemo] = useState(false);
  const [debugLevel, setDebugLevel] = useState(null);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (staticDemo) return;
    api('/api/me').then(setAuth).catch(() => setAuth({ role: 'guest' }));
  }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api(loginMode === 'admin' ? '/api/admin/login' : '/api/student/login', 'POST',
        loginMode === 'admin' ? { key: code } : { code });
      setAuth(result);
      setCode('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await api('/api/logout', 'POST'); } catch { /* cerrar vista igualmente */ }
    setDebugLevel(null);
    setDemo(false);
    setLoginMode('student');
    setAuth({ role: 'guest' });
  }

  if (!auth) return <main className="auth-screen"><p>Cargando juego…</p></main>;

  if (auth.role === 'admin') {
    if (debugLevel !== null) {
      return <Game key={`debug-${debugLevel}`} role="debug" debugLevel={debugLevel}
        onExit={() => setDebugLevel(null)} />;
    }
    return <AdminPanel onDebug={setDebugLevel} onLogout={logout} />;
  }

  if (auth.role === 'student') {
    return <Game key={`student-${auth.student.id}`} role="student" initialProgress={auth.progress}
      student={auth.student} onExit={logout} />;
  }

  if (demo) return <Game role="demo" onExit={() => setDemo(false)} />;

  if (staticDemo) return <main className="auth-screen">
    <div className="auth-card">
      <div className="school-pill">🎧 Modo de prueba sin guardar</div>
      <h1 className="game-title">ROMPE EL ALGORITMO</h1>
      <p className="game-subtitle">Descubre artistas, responde preguntas y haz que suene su música.</p>
      <p className="auth-note">Esta versión es una demostración. No tiene inicio de sesión, panel docente ni guardado de progreso.</p>
      <button className="primary-btn" type="button" onClick={() => setDemo(true)}>
        ▶ Probar el juego
      </button>
    </div>
  </main>;

  return <main className="auth-screen">
    <div className="auth-card">
      <div className="school-pill">🏫 Colegio Particular San Nicolás de Maipú • 7° Básico</div>
      <h1 className="game-title">ROMPE EL ALGORITMO</h1>
      <p className="game-subtitle">Descubre artistas, responde preguntas y haz que suene su música.</p>
      <div className="auth-tabs" role="tablist" aria-label="Tipo de acceso">
        <button type="button" className={loginMode === 'student' ? 'selected' : ''}
          onClick={() => { setLoginMode('student'); setError(''); }}>Estudiante</button>
        <button type="button" className={loginMode === 'admin' ? 'selected' : ''}
          onClick={() => { setLoginMode('admin'); setError(''); }}>Docente / administración</button>
      </div>
      <form onSubmit={login} className="auth-form">
        <label htmlFor="access-code">{loginMode === 'admin' ? 'Código de administración' : 'Código individual de estudiante'}</label>
        <input id="access-code" type={loginMode === 'admin' ? 'password' : 'text'}
          autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)}
          placeholder={loginMode === 'admin' ? 'Código privado' : 'ABCDE-12345'} required />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <button className="secondary-btn" type="button" onClick={() => setDemo(true)}>
        ▶ Probar el juego sin guardar progreso
      </button>
      <p className="auth-note">Tu progreso con código se puede retomar en otro equipo. La prueba no guarda resultados.</p>
    </div>
  </main>;
}
