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

export function AdminPanel({ onDebug, onLogout }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [students, setStudents] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [renewedCredential, setRenewedCredential] = useState(null);

  // Formulario nuevo curso (máximo 30 días de acceso, 45 días para borrado definitivo)
  const [newAlias, setNewAlias] = useState('');
  const [newSaveMode, setNewSaveMode] = useState('no_save');
  const [newExpireDays, setNewExpireDays] = useState(30);
  const [newDeleteDays, setNewDeleteDays] = useState(45);

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
      'Usuario (alias inventado)',
      'Niveles Completados (de 12)',
      'Campaña Completada',
      'Próximo Nivel / Retomar',
      'Visibilidad Total Acumulada',
      'Aprobación Ritmo Promedio (%)',
      'Mejor Racha Modo Infinito',
      'Sesiones Activas',
      'Vencimiento Acceso',
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
        item.username || item.label,
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
      setJoinCode(result.course.joinCode || '');
      setNotice(result.course.joinCode
        ? `Curso ${result.course.alias} creado. Entrega el único código de curso solo a sus estudiantes.`
        : `Curso ${result.course.alias} creado sin guardado. No se necesita código.`);
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueCourseCode(course) {
    if (!course) return;
    if (!window.confirm('Generar una nueva invitación invalidará la anterior, si existe. ¿Continuar?')) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/admin/courses/${course.id}/invite-code`, 'POST', {});
      setJoinCode(result.joinCode);
      setNotice(`Código de curso para ${course.alias}. Compártelo solo con esa clase.`);
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
        `ATENCIÓN: Se borrarán inmediatamente todas las cuentas (${course.totalCodes}), sesiones activas y los avances de este curso.`
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api(`/api/admin/courses/${course.id}/mode`, 'POST', { saveMode: 'no_save' });
        setJoinCode('');
        setNotice(`El curso ${course.alias} pasó a modo sin guardado y sus cuentas y avances fueron eliminados.`);
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
        `• El acceso vencerá el: ${expDate}\n` +
        `• Los datos se borrarán automáticamente el: ${delDate}\n` +
        `• Se guardan alias inventados, contraseñas en hash y avance.`
      );
      if (!ok) return;
      setBusy(true);
      try {
        await api(`/api/admin/courses/${course.id}/mode`, 'POST', { saveMode: 'save_to_resume' });
        setJoinCode('');
        setNotice(`Guardado activado para ${course.alias}. Ya puedes compartir el código de curso.`);
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
      setNotice(`Curso ${course.alias} y todos sus datos asociados fueron eliminados.`);
      setSelectedCourseId('');
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAllStudents() {
    if (students.length === 0) return;
    if (!window.confirm(`Se eliminarán ${students.length} cuentas de todos los cursos, junto con sus avances y sesiones. Los cursos seguirán existiendo. Esta acción es irreversible. ¿Continuar?`)) return;
    if (window.prompt('Para confirmar, escribe BORRAR:') !== 'BORRAR') return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/admin/students', 'DELETE');
      setNotice(`Se eliminaron ${result.deletedCount} cuentas de todos los cursos y sus datos asociados.`);
      setRenewedCredential(null);
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function action(id, kind) {
    if (kind === 'reset' && !window.confirm('¿Reiniciar todo el avance de esta cuenta?')) return;
    if (kind === 'revoke' && !window.confirm('¿Desactivar esta cuenta y cerrar sus sesiones?')) return;
    if (kind === 'delete' && !window.confirm('¿Borrar definitivamente esta cuenta y todo su progreso de la base de datos?')) return;
    setError('');
    try {
      await api(`/api/admin/students/${id}/${kind}`, 'POST', {});
      setNotice(
        kind === 'expire-sessions' ? 'Sesiones cerradas. La cuenta sigue activa.' :
        kind === 'revoke' ? 'Cuenta desactivada.' :
        kind === 'delete' ? 'Registro y progreso eliminados.' :
        'Progreso reiniciado.'
      );
      await refresh('');
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function resetPassword(item) {
    if (!window.confirm(`¿Generar una nueva contraseña para ${item.username}? La anterior dejará de funcionar.`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/api/admin/students/${item.id}/new-password`, 'POST', {});
      setRenewedCredential({ id: item.id, username: item.username, password: result.password });
      setNotice('Nueva contraseña lista. Muéstrala al estudiante en privado.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
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
        <div><strong>{visibleStudents.length}</strong><span>Cuentas creadas</span></div>
        <div><strong>{visibleStudents.filter((item) => !item.revokedAt && item.expiresAt > Date.now()).length}</strong><span>Cuentas vigentes</span></div>
        <div><strong>{totalCompleted}</strong><span>Niveles completados en total</span></div>
      </section>

      <section className="admin-card" aria-labelledby="privacy-note-title">
        <h2 id="privacy-note-title">Guía rápida para usar en clase</h2>
        <ol className="teacher-quick-guide">
          <li><strong>Elige cómo jugar.</strong> Para una sesión, usa el modo sin guardado: no crea cuentas y el avance se pierde al cerrar o recargar.</li>
          <li><strong>Si continuarán otro día, activa el guardado.</strong> Comparte el enlace o código del curso. Cada estudiante crea un alias inventado y, después de superar el nivel 1, obtiene su contraseña para retomar.</li>
          <li><strong>Prueba antes de la clase.</strong> Usa los controles de prueba de niveles para revisar preguntas, imágenes y audio.</li>
          <li><strong>Al terminar, revisa las cuentas.</strong> Puedes borrar una cuenta o usar «Borrar todos los estudiantes» al final de la lista. La eliminación pide confirmación.</li>
        </ol>
        <p className="admin-hint">
          Por privacidad, no pidas nombres, apellidos, iniciales, RUT, correo ni número de lista. Si necesitas relacionar un alias con un estudiante, conserva esa relación en privado fuera de la aplicación.
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
                <select value={currentCourse?.id || ''} onChange={(e) => { setSelectedCourseId(e.target.value); setJoinCode(''); setRenewedCredential(null); }}>
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
                      ? 'Guardar para retomar con cuenta'
                      : 'Práctica sin guardado (no almacena datos)'}
                  </p>
                  <p>
                    <strong>Vencimiento de acceso:</strong> {date(currentCourse.expiresAt)} ·{' '}
                    <strong>Borrado definitivo del curso:</strong> {date(currentCourse.deleteAt)}
                  </p>
                  <div className="admin-row-actions">
                    {currentCourse.saveMode === 'save_to_resume' && <button type="button" className="secondary-btn" disabled={busy} onClick={() => handleIssueCourseCode(currentCourse)}>Generar o renovar invitación</button>}
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
                  {joinCode && <p className="admin-hint">Código de curso (se muestra ahora): <code>{joinCode}</code>. Compártelo solo con esta clase. Al crear otro, este dejará de servir.</p>}
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
            <label>Vencimiento de acceso (máx. 30 días)
              <input type="number" min="1" max="30" value={newExpireDays} onChange={(e) => setNewExpireDays(e.target.value)} />
            </label>
            <label>Borrado definitivo de datos (máx. 45 días)
              <input type="number" min="1" max="45" value={newDeleteDays} onChange={(e) => setNewDeleteDays(e.target.value)} />
            </label>
            <button className="secondary-btn" type="submit" disabled={busy || !newAlias.trim()}>Crear curso</button>
          </form>
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
            <button type="button" className="danger-btn" disabled={busy || students.length === 0} onClick={handleDeleteAllStudents}>
              Borrar todos los estudiantes ({students.length})
            </button>
          </div>
        </div>
        <div className="admin-table-wrap" tabIndex={0} aria-label="Tabla de avance del curso. Desplázate horizontalmente para ver todas las columnas."><table><thead><tr><th>Estudiante (pseudónimo)</th><th>Avance</th><th>Retomar</th><th>Vigencia / Borrado</th><th>Acciones</th></tr></thead>
          <tbody>{visibleStudents.map((item) => {
            const checkpoint = item.progress.checkpoint;
            const status = item.revokedAt ? 'Desactivado' : item.expiresAt <= Date.now() ? 'Vencido' : `Vence ${date(item.expiresAt)}`;
            return <tr key={item.id}>
              <td><strong>{item.label}</strong><small>{item.username ? `Usuario: ${item.username} · ` : ''}#{item.id} · {item.activeSessions} sesión(es)</small></td>
              <td>{item.progress.discoveredIds.length}/12 niveles</td>
              <td>{checkpoint ? `${ARTISTS[checkpoint.levelIdx]?.name}: ${checkpoint.stage === 'questions' ? `pregunta ${Math.min(5, checkpoint.questionIndex + 1)}` : 'ritmo'}` : 'Sin partida pendiente'}</td>
              <td>{status}{item.deleteAt ? ` · Borrado ${date(item.deleteAt)}` : ''}</td>
              <td><div className="admin-row-actions">
                <button type="button" onClick={() => action(item.id, 'expire-sessions')}>Cerrar sesiones</button>
                <button type="button" onClick={() => action(item.id, 'reset')}>Reiniciar avance</button>
                {item.username && <button type="button" disabled={busy} onClick={() => resetPassword(item)}>Nueva contraseña</button>}
                {!item.revokedAt && <button type="button" onClick={() => action(item.id, 'revoke')}>Desactivar cuenta</button>}
                <button type="button" onClick={() => action(item.id, 'delete')}>Borrar cuenta</button>
              </div></td>
            </tr>;
          })}</tbody></table>
          {renewedCredential && <p className="admin-hint">Usuario {renewedCredential.username} · nueva contraseña: <code>{renewedCredential.password}</code>. Anótala y entrégala en privado; solo se muestra ahora.</p>}
          {visibleStudents.length === 0 && <p className="admin-empty">Aún no hay cuentas en este curso. Comparte el código del curso o usa el modo sin guardar.</p>}
        </div>
      </section>
    </main>
  </div>;
}
