import { useEffect, useState } from 'react';
import { ARTISTS } from '../data/artists.js';
import { api } from './api.js';

function escapeCsvCell(value) {
  const safe = String(value ?? '');
  const protectedValue = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function downloadExcelXml(filename, sheetName, rows) {
  const safeSheet = escapeXml(sheetName || 'Avance').slice(0, 31);
  const xmlRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell) => {
      const isNum = typeof cell === 'number' && Number.isFinite(cell);
      const type = isNum ? 'Number' : 'String';
      const val = isNum ? String(cell) : escapeXml(/^[=+\-@]/.test(String(cell ?? '')) ? `'${cell}` : String(cell ?? ''));
      const style = rowIndex === 0 ? ' ss:StyleID="header"' : '';
      return `<Cell${style}><Data ss:Type="${type}">${val}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   ${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const NEUTRAL_PREFIXES = ['Estudiante', 'Equipo', 'Puesto', 'Grupo'];

export function AdminPanel({ onDebug, onLogout }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [created, setCreated] = useState([]);

  // Formulario nuevo curso (máximo 30 días de vigencia de códigos, 45 días para borrado definitivo)
  const [newAlias, setNewAlias] = useState('');
  const [newSaveMode, setNewSaveMode] = useState('no_save');
  const [newExpireDays, setNewExpireDays] = useState(30);
  const [newDeleteDays, setNewDeleteDays] = useState(45);

  // Formulario generación de códigos (máximo 30 días)
  const [count, setCount] = useState(25);
  const [days, setDays] = useState(30);
  const [prefix, setPrefix] = useState('Estudiante');
  const [debugLevel, setDebugLevel] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh(courseFilter = selectedCourseId) {
    try {
      const query = courseFilter ? `?courseId=${encodeURIComponent(courseFilter)}` : '';
      const result = await api(`/api/admin/students${query}`);
      setStudents(result.students || []);
      if (result.courses) {
        setCourses(result.courses);
        if (!courseFilter && result.courses.length > 0) {
          setSelectedCourseId(result.courses[0].id);
        }
      }
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }

  useEffect(() => {
    refresh('');
  }, []);

  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0] || null;
  const visibleStudents = currentCourse
    ? students.filter((s) => s.courseId === currentCourse.id)
    : students;

  const date = (value) => new Date(value).toLocaleDateString('es-CL');

  function buildProgressReportRows() {
    const header = [
      'Curso',
      'Etiqueta (Pseudónimo)',
      'Niveles Completados (de 12)',
      'Campaña Completada',
      'Próximo Nivel / Retomar',
      'Visibilidad Total Acumulada',
      'Aprobación Ritmo Promedio (%)',
      'Mejor Racha Modo Infinito',
      'Sesiones Activas',
      'Vencimiento Código',
      'Borrado Automático',
    ];
    const dataRows = visibleStudents.map((item) => {
      const scoresList = Object.values(item.progress.scores || {});
      const totalVisibility = scoresList.reduce((acc, s) => acc + (Number(s.visibility) || 0), 0);
      const avgApproval = scoresList.length > 0
        ? Math.round(scoresList.reduce((acc, s) => acc + (Number(s.approvalPct) || 0), 0) / scoresList.length)
        : 0;
      const checkpoint = item.progress.checkpoint;
      const resumeLabel = item.progress.campaignCompleted
        ? 'Campaña completa'
        : checkpoint
          ? `${ARTISTS[checkpoint.levelIdx]?.name || `Nivel ${checkpoint.levelIdx + 1}`} (${checkpoint.stage === 'questions' ? `Pregunta ${Math.min(5, checkpoint.questionIndex + 1)}` : 'Ritmo'})`
          : `Nivel ${item.progress.maxUnlockedIdx + 1}`;
      return [
        item.courseAlias || currentCourse?.alias || '',
        item.label,
        item.progress.discoveredIds.length,
        item.progress.campaignCompleted ? 'Sí' : 'No',
        resumeLabel,
        totalVisibility,
        avgApproval,
        item.progress.bestInfiniteStreak || 0,
        item.activeSessions,
        date(item.expiresAt),
        date(item.deleteAt || item.expiresAt),
      ];
    });
    return [header, ...dataRows];
  }

  async function handleCreateCourse(event) {
    event.preventDefault();
    if (!newAlias.trim()) return;
    const expireD = Math.min(30, Math.max(1, Number(newExpireDays) || 30));
    const deleteD = Math.min(45, Math.max(expireD, Number(newDeleteDays) || 45));
    if (newSaveMode === 'save_to_resume') {
      const expDate = date(Date.now() + expireD * 24 * 3600_000);
      const delDate = date(Date.now() + deleteD * 24 * 3600_000);
      const ok = window.confirm(
        `¿Crear curso "${newAlias.toUpperCase()}" con guardado activo?\n\n` +
        `• Vencimiento de acceso (máx. 30 días): ${expDate}\n` +
        `• Borrado definitivo de datos: ${delDate}\n` +
        `• No se solicitarán ni guardarán nombres reales en la plataforma.`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/admin/courses', 'POST', {
        alias: newAlias,
        saveMode: newSaveMode,
        expireDays: expireD,
        deleteDays: deleteD,
      });
      setNewAlias('');
      setSelectedCourseId(result.course.id);
      setNotice(`Curso ${result.course.alias} creado en modo "${result.course.saveMode === 'no_save' ? 'Práctica sin guardado' : 'Guardar para retomar'}".`);
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCourseMode(course) {
    if (!course) return;
    if (course.saveMode === 'save_to_resume') {
      const ok = window.confirm(
        `¿Cambiar el curso "${course.alias}" a modo "Práctica sin guardado"?\n\n` +
        `ATENCIÓN: Se borrarán inmediatamente todos los códigos (${course.totalCodes}), sesiones activas y el progreso guardado de este curso.`
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api(`/api/admin/courses/${course.id}/mode`, 'POST', { saveMode: 'no_save' });
        setCreated([]);
        setNotice(`El curso ${course.alias} pasó a modo sin guardado y sus registros fueron eliminados.`);
        await refresh('');
      } catch (cause) {
        setError(cause.message);
      } finally {
        setBusy(false);
      }
    } else {
      const expDate = date(course.expiresAt);
      const delDate = date(course.deleteAt);
      const ok = window.confirm(
        `¿Activar guardado ("Retomar otro día") para el curso "${course.alias}"?\n\n` +
        `• Los códigos vencerán el: ${expDate}\n` +
        `• Los datos se borrarán automáticamente el: ${delDate}\n` +
        `• Solo se guardan códigos en hash y etiquetas neutras.`
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api(`/api/admin/courses/${course.id}/mode`, 'POST', { saveMode: 'save_to_resume' });
        setNotice(`Guardado activado para ${course.alias}. Ya puedes generar códigos pseudónimos.`);
        await refresh('');
      } catch (cause) {
        setError(cause.message);
      } finally {
        setBusy(false);
      }
    }
  }

  async function handleDeleteCourse(course) {
    if (!course) return;
    if (!window.confirm(`¿Borrar por completo el curso "${course.alias}", incluyendo todos sus códigos, sesiones y avances? Esta acción es irreversible.`)) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/courses/${course.id}`, 'DELETE');
      setCreated([]);
      setNotice(`Curso ${course.alias} y todos sus datos asociados fueron eliminados.`);
      setSelectedCourseId('');
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function generate(event) {
    event.preventDefault();
    if (currentCourse && currentCourse.saveMode !== 'save_to_resume') {
      setError('Activa el modo "Guardar para retomar" en el curso antes de crear códigos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/admin/codes', 'POST', {
        courseId: currentCourse?.id,
        count: Number(count),
        days: Math.min(30, Math.max(1, Number(days) || 30)),
        prefix,
      });
      setCreated(result.created);
      setNotice(`${result.created.length} códigos creados. Descárgalos ahora: el servidor solo conserva su hash y no volverá a mostrarlos.`);
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function action(id, kind) {
    if (kind === 'reset' && !window.confirm('¿Reiniciar todo el avance de este código?')) return;
    if (kind === 'revoke' && !window.confirm('¿Desactivar este código y cerrar sus sesiones?')) return;
    if (kind === 'delete' && !window.confirm('¿Borrar definitivamente este código y todo su progreso de la base de datos?')) return;
    setError('');
    try {
      await api(`/api/admin/students/${id}/${kind}`, 'POST', {});
      setNotice(
        kind === 'expire-sessions' ? 'Sesiones cerradas. El código sigue válido.' :
        kind === 'revoke' ? 'Código desactivado.' :
        kind === 'delete' ? 'Registro y progreso eliminados.' :
        'Progreso reiniciado.'
      );
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    }
  }

  const totalCompleted = visibleStudents.reduce((sum, student) => sum + student.progress.discoveredIds.length, 0);

  return <div className="admin-shell">
    <header className="admin-header">
      <div><p className="eyebrow">ROMPE EL ALGORITMO</p><h1>Panel docente</h1>
        <p>Gestión por curso, decisión de privacidad y progreso de la campaña.</p></div>
      <button className="secondary-btn" type="button" onClick={onLogout}>Cerrar sesión</button>
    </header>

    <main className="admin-main">
      <section className="admin-stats" aria-label="Resumen">
        <div><strong>{visibleStudents.length}</strong><span>Códigos creados</span></div>
        <div><strong>{visibleStudents.filter((item) => !item.revokedAt && item.expiresAt > Date.now()).length}</strong><span>Códigos vigentes</span></div>
        <div><strong>{totalCompleted}</strong><span>Niveles completados en total</span></div>
      </section>

      <section className="admin-card" aria-labelledby="privacy-note-title">
        <h2 id="privacy-note-title">Privacidad, TPACK y modo de trabajo por curso</h2>
        <p>
          <strong>1. Práctica sin guardado (recomendado para 1 sesión):</strong> No se crean códigos ni se registran datos en el servidor. Al cerrar o recargar la página, la partida se pierde.
        </p>
        <p>
          <strong>2. Retomar otro día (máximo 30 días de vigencia):</strong> Genera códigos aleatorios individuales con fecha de vencimiento de acceso (hasta 30 días) y fecha de borrado automático (hasta 45 días, dando una ventana al docente para descargar el informe en CSV o Excel antes de la eliminación total).
        </p>
        <p className="admin-hint">
          Prohibido ingresar nombres, apellidos, RUT, correo o número de lista en la plataforma (Ley 21.719 / protección de NNA). Si necesitas asociar un código a un estudiante, conserva la tabla <em>nombre ↔ código</em> en un registro privado fuera del sistema y de GitHub.
        </p>
      </section>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <div className="admin-grid">
        <section className="admin-card">
          <h2>Curso activo y retención</h2>
          {courses.length > 0 && (
            <div className="admin-form">
              <label>Seleccionar curso
                <select value={currentCourse?.id || ''} onChange={(e) => { setSelectedCourseId(e.target.value); setCreated([]); }}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} ({c.saveMode === 'save_to_resume' ? 'Con guardado' : 'Sin guardado'})
                    </option>
                  ))}
                </select>
              </label>
              {currentCourse && (
                <div className="course-meta">
                  <p>
                    <strong>Modo actual:</strong>{' '}
                    {currentCourse.saveMode === 'save_to_resume'
                      ? 'Guardar para retomar con código'
                      : 'Práctica sin guardado (no almacena datos)'}
                  </p>
                  <p>
                    <strong>Vencimiento de códigos:</strong> {date(currentCourse.expiresAt)} ·{' '}
                    <strong>Borrado definitivo del curso:</strong> {date(currentCourse.deleteAt)}
                  </p>
                  <div className="admin-row-actions">
                    <button type="button" className="secondary-btn" disabled={busy} onClick={() => handleToggleCourseMode(currentCourse)}>
                      {currentCourse.saveMode === 'save_to_resume'
                        ? 'Desactivar guardado y borrar progreso'
                        : 'Activar guardado para retomar'}
                    </button>
                    {courses.length > 1 && (
                      <button type="button" className="secondary-btn" disabled={busy} onClick={() => handleDeleteCourse(currentCourse)}>
                        Eliminar curso
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <hr style={{ margin: '1rem 0', opacity: 0.2 }} />
          <h3>Crear nuevo curso</h3>
          <form onSubmit={handleCreateCourse} className="admin-form">
            <label>Alias organizativo (no es contraseña)
              <input value={newAlias} maxLength={40} placeholder="7B-MATEMATICA-2026" onChange={(e) => setNewAlias(e.target.value)} />
            </label>
            <label>Modo de trabajo
              <select value={newSaveMode} onChange={(e) => setNewSaveMode(e.target.value)}>
                <option value="no_save">1. Práctica sin guardado (recomendado)</option>
                <option value="save_to_resume">2. Retomar otro día (con fecha de borrado)</option>
              </select>
            </label>
            <label>Vencimiento de códigos (máx. 30 días)
              <input type="number" min="1" max="30" value={newExpireDays} onChange={(e) => setNewExpireDays(e.target.value)} />
            </label>
            <label>Borrado definitivo de datos (máx. 45 días)
              <input type="number" min="1" max="45" value={newDeleteDays} onChange={(e) => setNewDeleteDays(e.target.value)} />
            </label>
            <button className="secondary-btn" type="submit" disabled={busy || !newAlias.trim()}>Crear curso</button>
          </form>
        </section>

        <section className="admin-card">
          <h2>Generar códigos</h2>
          <p>Entrega uno distinto a cada estudiante. Solo se permiten etiquetas genéricas neutras y hasta 30 días de vigencia.</p>
          {currentCourse?.saveMode === 'no_save' && (
            <p className="admin-hint">
              El curso <strong>{currentCourse.alias}</strong> está en modo <em>Práctica sin guardado</em>. Para usar códigos, activa primero el guardado en la tarjeta del curso.
            </p>
          )}
          <form onSubmit={generate} className="admin-form">
            <label>Cantidad <input type="number" min="1" max="45" value={count} onChange={(event) => setCount(event.target.value)} /></label>
            <label>Vencen en días <input type="number" min="1" max="30" value={days} onChange={(event) => setDays(event.target.value)} /></label>
            <label>Etiqueta neutra
              <select aria-label="Etiqueta" value={prefix} onChange={(event) => setPrefix(event.target.value)}>
                {NEUTRAL_PREFIXES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button className="primary-btn" disabled={busy || currentCourse?.saveMode === 'no_save'}>
              {busy ? 'Generando…' : 'Generar códigos'}
            </button>
          </form>
          {created.length > 0 && <div className="created-codes">
            <div className="created-heading"><strong>Códigos recién creados (descarga única)</strong>
              <div className="admin-table-actions">
                <button type="button" className="secondary-btn" onClick={() => downloadCsv(`codigos-${currentCourse?.alias || 'curso'}.csv`, [
                  ['Curso', 'Etiqueta', 'Código', 'Vence', 'Borrado definitivo'],
                  ...created.map((item) => [item.courseAlias || currentCourse?.alias || '', item.label, item.code, date(item.expiresAt), date(item.deleteAt || currentCourse?.deleteAt || item.expiresAt)]),
                ])}>Descargar CSV</button>
                <button type="button" className="secondary-btn" onClick={() => downloadExcelXml(`codigos-${currentCourse?.alias || 'curso'}.xls`, 'Codigos', [
                  ['Curso', 'Etiqueta', 'Código', 'Vence', 'Borrado definitivo'],
                  ...created.map((item) => [item.courseAlias || currentCourse?.alias || '', item.label, item.code, date(item.expiresAt), date(item.deleteAt || currentCourse?.deleteAt || item.expiresAt)]),
                ])}>Descargar Excel (.xls)</button>
              </div>
            </div>
            <ul>{created.map((item) => <li key={item.id}><span>{item.label}</span><code>{item.code}</code></li>)}</ul>
          </div>}

          <hr style={{ margin: '1rem 0', opacity: 0.2 }} />
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
        <div className="admin-table-heading">
          <div>
            <h2>Avance del curso {currentCourse ? `(${currentCourse.alias})` : ''}</h2>
            <p>Descarga el informe formativo antes de la fecha de borrado automático del curso.</p>
          </div>
          <div className="admin-table-actions">
            <button type="button" className="secondary-btn" onClick={() => refresh('')}>Actualizar</button>
            <button type="button" className="secondary-btn" onClick={() => downloadCsv(`avance-${currentCourse?.alias || 'curso'}.csv`, buildProgressReportRows())}>
              Exportar CSV
            </button>
            <button type="button" className="secondary-btn" onClick={() => downloadExcelXml(`informe-${currentCourse?.alias || 'curso'}.xls`, currentCourse?.alias || 'Avance', buildProgressReportRows())}>
              Descargar informe Excel (.xls)
            </button>
          </div>
        </div>
        <div className="admin-table-wrap"><table><thead><tr><th>Estudiante (pseudónimo)</th><th>Avance</th><th>Retomar</th><th>Vigencia / Borrado</th><th>Acciones</th></tr></thead>
          <tbody>{visibleStudents.map((item) => {
            const checkpoint = item.progress.checkpoint;
            const status = item.revokedAt ? 'Desactivado' : item.expiresAt <= Date.now() ? 'Vencido' : `Vence ${date(item.expiresAt)}`;
            return <tr key={item.id}>
              <td><strong>{item.label}</strong><small>#{item.id} · {item.activeSessions} sesión(es)</small></td>
              <td>{item.progress.discoveredIds.length}/12 niveles</td>
              <td>{checkpoint ? `${ARTISTS[checkpoint.levelIdx]?.name}: ${checkpoint.stage === 'questions' ? `pregunta ${Math.min(5, checkpoint.questionIndex + 1)}` : 'ritmo'}` : 'Sin partida pendiente'}</td>
              <td>{status}{item.deleteAt ? ` · Borrado ${date(item.deleteAt)}` : ''}</td>
              <td><div className="admin-row-actions">
                <button type="button" onClick={() => action(item.id, 'expire-sessions')}>Cerrar sesiones</button>
                <button type="button" onClick={() => action(item.id, 'reset')}>Reiniciar avance</button>
                {!item.revokedAt && <button type="button" onClick={() => action(item.id, 'revoke')}>Desactivar código</button>}
                <button type="button" onClick={() => action(item.id, 'delete')}>Borrar registro</button>
              </div></td>
            </tr>;
          })}</tbody></table>
          {visibleStudents.length === 0 && <p className="admin-empty">Aún no hay códigos en este curso. Genera los primeros para empezar o usa el modo de práctica sin guardado.</p>}
        </div>
      </section>
    </main>
  </div>;
}
