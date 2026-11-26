import { useEffect, useState } from 'react';
import { ARTISTS } from '../data/artists.js';
import { api } from './api.js';

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => {
    const safe = String(value ?? '');
    const protectedValue = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
    return `"${protectedValue.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminPanel({ onDebug, onLogout }) {
  const [students, setStudents] = useState([]);
  const [created, setCreated] = useState([]);
  const [count, setCount] = useState(25);
  const [days, setDays] = useState(90);
  const [prefix, setPrefix] = useState('Estudiante');
  const [debugLevel, setDebugLevel] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const result = await api('/api/admin/students');
      setStudents(result.students);
      setError('');
    } catch (cause) { setError(cause.message); }
  }

  useEffect(() => { refresh(); }, []);

  async function generate(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/admin/codes', 'POST', { count: Number(count), days: Number(days), prefix });
      setCreated(result.created);
      setNotice(`${result.created.length} códigos creados. Descárgalos ahora: el servidor no conserva el texto de los códigos.`);
      await refresh();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function action(id, kind) {
    if (kind === 'reset' && !window.confirm('¿Reiniciar todo el avance de este estudiante?')) return;
    if (kind === 'revoke' && !window.confirm('¿Desactivar este código y cerrar sus sesiones?')) return;
    setError('');
    try {
      await api(`/api/admin/students/${id}/${kind}`, 'POST', {});
      setNotice(kind === 'expire-sessions' ? 'Sesiones cerradas. El código sigue válido.' :
        kind === 'revoke' ? 'Código desactivado.' : 'Progreso reiniciado.');
      await refresh();
    } catch (cause) { setError(cause.message); }
  }

  const date = (value) => new Date(value).toLocaleDateString('es-CL');
  const totalCompleted = students.reduce((sum, student) => sum + student.progress.discoveredIds.length, 0);

  return <div className="admin-shell">
    <header className="admin-header">
      <div><p className="eyebrow">ROMPE EL ALGORITMO</p><h1>Panel docente</h1>
        <p>Códigos individuales y progreso de la campaña.</p></div>
      <button className="secondary-btn" type="button" onClick={onLogout}>Cerrar sesión</button>
    </header>

    <main className="admin-main">
      <section className="admin-stats" aria-label="Resumen">
        <div><strong>{students.length}</strong><span>Códigos creados</span></div>
        <div><strong>{students.filter((item) => !item.revokedAt && item.expiresAt > Date.now()).length}</strong><span>Códigos vigentes</span></div>
        <div><strong>{totalCompleted}</strong><span>Niveles completados en total</span></div>
      </section>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-grid">
        <section className="admin-card">
          <h2>Generar códigos</h2>
          <p>Entrega uno distinto a cada estudiante. No hace falta usar nombres reales.</p>
          <form onSubmit={generate} className="admin-form">
            <label>Cantidad <input type="number" min="1" max="40" value={count} onChange={(event) => setCount(event.target.value)} /></label>
            <label>Vencen en días <input type="number" min="1" max="365" value={days} onChange={(event) => setDays(event.target.value)} /></label>
            <label>Etiqueta <input value={prefix} maxLength={25} onChange={(event) => setPrefix(event.target.value)} /></label>
            <button className="primary-btn" disabled={busy}>{busy ? 'Generando…' : 'Generar códigos'}</button>
          </form>
          {created.length > 0 && <div className="created-codes">
            <div className="created-heading"><strong>Códigos recién creados</strong>
              <button type="button" className="secondary-btn" onClick={() => downloadCsv('codigos-estudiantes.csv', [
                ['Etiqueta', 'Código', 'Vence'], ...created.map((item) => [item.label, item.code, date(item.expiresAt)]),
              ])}>Descargar CSV</button></div>
            <ul>{created.map((item) => <li key={item.id}><span>{item.label}</span><code>{item.code}</code></li>)}</ul>
          </div>}
        </section>

        <section className="admin-card">
          <h2>Probar niveles</h2>
          <p>Abre cualquier nivel en modo de prueba. No modifica el progreso de estudiantes.</p>
          <label className="admin-select">Nivel
            <select value={debugLevel} onChange={(event) => setDebugLevel(Number(event.target.value))}>
              {ARTISTS.map((artist, index) => <option key={artist.id} value={index}>{artist.level}. {artist.name}</option>)}
            </select>
          </label>
          <button className="primary-btn" type="button" onClick={() => onDebug(debugLevel)}>Probar nivel</button>
          <p className="admin-hint">Puedes volver al panel desde el menú del juego de prueba.</p>
        </section>
      </div>

      <section className="admin-card">
        <div className="admin-table-heading"><div><h2>Avance del curso</h2><p>Las sesiones se pueden cerrar sin invalidar el código individual.</p></div>
          <div className="admin-table-actions">
            <button type="button" className="secondary-btn" onClick={refresh}>Actualizar</button>
            <button type="button" className="secondary-btn" onClick={() => downloadCsv('avance-estudiantes.csv', [
              ['Etiqueta', 'Niveles completados', 'Próximo nivel', 'Sesiones activas', 'Vence'],
              ...students.map((item) => [item.label, item.progress.discoveredIds.length,
                item.progress.campaignCompleted ? 'Campaña completa' : item.progress.maxUnlockedIdx + 1,
                item.activeSessions, date(item.expiresAt)]),
            ])}>Exportar avance</button>
          </div>
        </div>
        <div className="admin-table-wrap"><table><thead><tr><th>Estudiante</th><th>Avance</th><th>Retomar</th><th>Vigencia</th><th>Acciones</th></tr></thead>
          <tbody>{students.map((item) => {
            const checkpoint = item.progress.checkpoint;
            const status = item.revokedAt ? 'Desactivado' : item.expiresAt <= Date.now() ? 'Vencido' : `Hasta ${date(item.expiresAt)}`;
            return <tr key={item.id}>
              <td><strong>{item.label}</strong><small>#{item.id} · {item.activeSessions} sesión(es)</small></td>
              <td>{item.progress.discoveredIds.length}/12 niveles</td>
              <td>{checkpoint ? `${ARTISTS[checkpoint.levelIdx]?.name}: ${checkpoint.stage === 'questions' ? `pregunta ${Math.min(5, checkpoint.questionIndex + 1)}` : 'ritmo'}` : 'Sin partida pendiente'}</td>
              <td>{status}</td>
              <td><div className="admin-row-actions">
                <button type="button" onClick={() => action(item.id, 'expire-sessions')}>Cerrar sesiones</button>
                <button type="button" onClick={() => action(item.id, 'reset')}>Reiniciar avance</button>
                {!item.revokedAt && <button type="button" onClick={() => action(item.id, 'revoke')}>Desactivar código</button>}
              </div></td>
            </tr>;
          })}</tbody></table>
          {students.length === 0 && <p className="admin-empty">Aún no hay códigos. Genera los primeros para empezar.</p>}
        </div>
      </section>
    </main>
  </div>;
}
