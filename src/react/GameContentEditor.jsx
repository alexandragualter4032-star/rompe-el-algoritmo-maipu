import { useMemo, useState } from 'react';
import { getGameContent, setGameContent } from '../data/contentStore.js';
import { api } from './api.js';

function copy(value) { return JSON.parse(JSON.stringify(value)); }

function parseYoutube(value) {
  try {
    const url = new URL(value.trim());
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) return null;
    const playlistId = url.searchParams.get('list');
    const videoId = url.hostname.includes('youtu.be') ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (videoId && /^[A-Za-z0-9_-]{6,80}$/.test(videoId)) return { id: videoId, ...(playlistId ? { playlistId } : {}) };
    if (playlistId && /^[A-Za-z0-9_-]{6,100}$/.test(playlistId)) return { playlistId };
  } catch { /* invalid URL */ }
  return null;
}

export function GameContentEditor() {
  const initial = useMemo(() => copy(getGameContent()), []);
  const [content, setContent] = useState(initial);
  const [artistId, setArtistId] = useState(initial.artists[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const artistIndex = content.artists.findIndex((artist) => artist.id === artistId);
  const artist = content.artists[artistIndex];
  const coverKey = artist?.files?.singleCover ? 'singleCover' : 'albumCover';
  const questions = content.questions[artistId] || [];

  function updateArtist(mutator) {
    setContent((current) => {
      const artists = [...current.artists];
      artists[artistIndex] = mutator(copy(artists[artistIndex]));
      return { ...current, artists };
    });
  }
  function updateQuestion(index, changes) {
    setContent((current) => ({ ...current, questions: { ...current.questions,
      [artistId]: current.questions[artistId].map((question, i) => i === index ? { ...question, ...changes } : question) } }));
  }
  function moveQuestion(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setContent((current) => ({ ...current, questions: { ...current.questions, [artistId]: reordered } }));
  }
  function addQuestion() {
    const n = questions.length + 1;
    setContent((current) => ({ ...current, questions: { ...current.questions, [artistId]: [...questions, {
      id: `${artistId}-extra-${Date.now()}`, context: '', question: '', options: ['', '', ''], correctIndex: 0, feedback: '',
    }] } }));
    setNotice(`Pregunta ${n} añadida al final. Completa todos los campos antes de guardar.`);
  }
  function deleteQuestion(index) {
    if (questions.length <= 1 || !window.confirm('¿Eliminar esta pregunta? Se guardará al pulsar “Guardar cambios”.')) return;
    setContent((current) => ({ ...current, questions: { ...current.questions, [artistId]: questions.filter((_, i) => i !== index) } }));
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/api/admin/game-content', 'PUT', { content });
      setContent(copy(result.content)); setGameContent(result.content);
      setNotice('Cambios guardados. Se aplicarán a las próximas partidas que abran los estudiantes.');
    } catch (cause) { setError(cause.message || 'No se pudieron guardar los cambios.'); }
    finally { setBusy(false); }
  }

  if (!artist) return null;
  return <section className="admin-card game-content-editor">
    <h2>Editar contenido del juego</h2>
    <p>Actualiza imágenes, reproductor y preguntas. El orden se mantiene tal como aparece aquí; usa las flechas para cambiarlo.</p>
    <label className="admin-select">Artista
      <select value={artistId} onChange={(event) => setArtistId(event.target.value)}>
        {content.artists.map((item) => <option key={item.id} value={item.id}>{item.level}. {item.name}</option>)}
      </select>
    </label>
    <div className="content-editor-media">
      <label>Foto del artista (URL HTTPS o ruta /images/ existente)
        <input value={artist.files.photo || ''} onChange={(e) => updateArtist((item) => ({ ...item, files: { ...item.files, photo: e.target.value, face: e.target.value } }))} />
      </label>
      <label>Portada destacada (URL HTTPS o ruta /images/ existente)
        <input value={artist.files[coverKey] || ''} onChange={(e) => updateArtist((item) => ({ ...item, files: { ...item.files, [coverKey]: e.target.value } }))} />
      </label>
      <label>Enlace de canción o playlist de YouTube
        <input value={artist.video?.playlistId ? `https://www.youtube.com/playlist?list=${artist.video.playlistId}` : artist.video?.id ? `https://www.youtube.com/watch?v=${artist.video.id}` : ''}
          onChange={(e) => { const parsed = parseYoutube(e.target.value); updateArtist((item) => ({ ...item, video: { ...item.video, ...(parsed || {}), title: item.video?.title || item.name } })); }} />
      </label>
      <label>Título mostrado en el reproductor
        <input maxLength={120} value={artist.video?.title || ''} onChange={(e) => updateArtist((item) => ({ ...item, video: { ...item.video, title: e.target.value } }))} />
      </label>
      <p className="admin-hint">Las imágenes deben estar en una URL pública HTTPS o existir ya en <code>public/images</code>. La carga de archivos desde el computador requiere configurar un servicio de almacenamiento.</p>
    </div>
    <div className="content-question-heading"><h3>Preguntas ({questions.length})</h3><button className="secondary-btn" type="button" disabled={questions.length >= 20} onClick={addQuestion}>Añadir pregunta</button></div>
    <div className="content-editor-questions">
      {questions.map((question, index) => <fieldset className="content-editor-question" key={question.id}>
        <legend>Pregunta {index + 1}</legend>
        <div className="content-question-controls">
          <button type="button" disabled={index === 0} onClick={() => moveQuestion(index, -1)} aria-label="Mover pregunta hacia arriba">↑</button>
          <button type="button" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} aria-label="Mover pregunta hacia abajo">↓</button>
          <button type="button" disabled={questions.length <= 1} onClick={() => deleteQuestion(index)}>Eliminar</button>
        </div>
        <label>Contexto<textarea maxLength={1200} rows={3} value={question.context} onChange={(e) => updateQuestion(index, { context: e.target.value })} /></label>
        <label>Enunciado<textarea maxLength={1200} rows={2} value={question.question} onChange={(e) => updateQuestion(index, { question: e.target.value })} /></label>
        <div className="content-editor-options">{question.options.map((option, optionIndex) => <label key={optionIndex}>Alternativa {String.fromCharCode(65 + optionIndex)} {question.correctIndex === optionIndex && <strong>(correcta)</strong>}
          <textarea maxLength={500} rows={2} value={option} onChange={(e) => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? e.target.value : value) })} />
          <span className="content-option-actions"><button type="button" disabled={question.options.length <= 3} onClick={() => updateQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex), correctIndex: question.correctIndex === optionIndex ? 0 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex })}>Quitar</button><button type="button" onClick={() => updateQuestion(index, { correctIndex: optionIndex })}>Marcar correcta</button></span>
        </label>)}</div>
        {question.options.length < 6 && <button type="button" onClick={() => updateQuestion(index, { options: [...question.options, ''] })}>Añadir alternativa</button>}
        <label>Retroalimentación<textarea maxLength={1200} rows={2} value={question.feedback} onChange={(e) => updateQuestion(index, { feedback: e.target.value })} /></label>
        <div className="content-editor-source"><label>Fuente verificada (opcional): nombre<input maxLength={160} value={question.source?.title || ''} onChange={(e) => updateQuestion(index, { source: { ...question.source, title: e.target.value } })} placeholder="Ej. entrevista en Radio Bío-Bío" /></label>
          <label>Enlace HTTPS<input value={question.source?.url || ''} onChange={(e) => updateQuestion(index, { source: { ...question.source, url: e.target.value } })} placeholder="https://…" /></label></div>
      </fieldset>)}
    </div>
    {error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="admin-hint" role="status">{notice}</p>}
    <button className="primary-btn" type="button" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
  </section>;
}
