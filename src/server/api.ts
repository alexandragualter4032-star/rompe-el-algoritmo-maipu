import { randomBytes } from 'node:crypto';
import { hasOffensiveUsernameTerm } from '../shared/usernames.js';
import {
  authenticateStudentByCode,
  cleanProgress,
  createCourse,
  createSessionRecord,
  deleteCourseCompletely,
  deleteAllStudents,
  deleteSessionByHash,
  generateStudentCodes,
  authenticateStudentByUsername,
  createStudentAccount,
  getActiveSession,
  hash,
  integer,
  listCourses,
  listStudents,
  normalizeCode,
  sanitizeUsername,
  issueCourseJoinCode,
  validateCourseJoinCode,
  isUsernameAvailable,
  performStudentAction,
  resetStudentPassword,
  sanitizeAlias,
  setCourseSaveMode,
  updateStudentProgress,
  verifyAdminKey,
  getSavedGameContent,
  saveGameContent,
} from './db';
import { ARTISTS } from '../data/artists.js';
import { QUESTIONS } from '../data/questions.js';

function json(data: unknown, status = 200, cookieHeader?: string) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (cookieHeader) headers.set('Set-Cookie', cookieHeader);
  return new Response(JSON.stringify(data), { status, headers });
}

function cookie(name: string, value: string, age: number, request: Request) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  const secure = proto === 'https' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}

function getCookie(request: Request, name: string) {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function session(request: Request, role: 'admin' | 'student') {
  const token = getCookie(request, role === 'admin' ? 'rea_admin' : 'rea_student');
  if (!token) return null;
  return getActiveSession(hash(token), role);
}

async function createSession(role: 'admin' | 'student', studentId: number | null, courseId: string | null, request: Request) {
  const token = randomBytes(32).toString('base64url');
  const age = role === 'admin' ? 8 * 3600 : 7 * 24 * 3600;
  await createSessionRecord(role, studentId, courseId, Date.now() + age * 1000, hash(token));
  return cookie(role === 'admin' ? 'rea_admin' : 'rea_student', token, age, request);
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  const text = await request.text();
  if (text.length > 524288) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function validMediaUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^(\.\/images\/|\/images\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function cleanGameContent(input: any) {
  if (!input || !Array.isArray(input.artists) || !input.questions || typeof input.questions !== 'object') return null;
  const artistsById = new Map(ARTISTS.map((artist) => [artist.id, artist]));
  if (input.artists.length !== ARTISTS.length) return null;
  const artists = [];
  const questions: Record<string, any[]> = {};
  for (const original of ARTISTS) {
    const artist = input.artists.find((item: any) => item?.id === original.id);
    if (!artist || !artist.files || !validMediaUrl(artist.files.photo)) return null;
    const coverKey = original.files.singleCover ? 'singleCover' : 'albumCover';
    if (!validMediaUrl(artist.files[coverKey])) return null;
    const videoId = artist.video?.id;
    const playlistId = artist.video?.playlistId;
    if (!(typeof videoId === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(videoId)) && !(typeof playlistId === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(playlistId))) return null;
    artists.push({ ...original, files: { ...original.files, photo: artist.files.photo, face: artist.files.photo, [coverKey]: artist.files[coverKey] }, video: { ...original.video, ...(videoId ? { id: videoId } : { id: undefined }), title: String(artist.video.title || original.video.title).slice(0, 120), ...(playlistId ? { playlistId } : { playlistId: undefined }) } });
    const items = input.questions[original.id];
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) return null;
    questions[original.id] = [];
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || item.id.length > 80) return null;
      if (![item.context, item.question, item.feedback].every((v) => typeof v === 'string' && v.length > 0 && v.length <= 1200)) return null;
      if (!Array.isArray(item.options) || item.options.length < 3 || item.options.length > 6 || !item.options.every((v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 500)) return null;
      if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length) return null;
      const clean: any = { id: item.id, context: item.context, question: item.question, options: item.options, correctIndex: item.correctIndex, feedback: item.feedback };
      if (item.source && typeof item.source.title === 'string' && item.source.title.length <= 160) {
        try { if (new URL(item.source.url).protocol === 'https:') clean.source = { title: item.source.title, url: item.source.url }; } catch { /* omit invalid optional source */ }
      }
      questions[original.id].push(clean);
    }
  }
  if (Object.keys(input.questions).some((id) => !artistsById.has(id))) return null;
  return { artists, questions };
}

const attemptsMap = new Map<string, number[]>();
function tooManyAttempts(request: Request, bucket: string, maxAttempts: number) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (attemptsMap.get(key) ?? []).filter((time) => now - time < 5 * 60_000);
  recent.push(now);
  attemptsMap.set(key, recent);
  return recent.length > maxAttempts;
}

export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/me' && method === 'GET') {
    const content = (await getSavedGameContent()) || { artists: ARTISTS, questions: QUESTIONS };
    if (await session(request, 'admin')) return json({ role: 'admin', content });
    const current: any = await session(request, 'student');
    if (current) {
      return json({
        role: 'student',
        student: current.student,
        progress: current.progress,
        content,
      });
    }
    return json({ role: 'guest', content });
  }

  if (path === '/api/admin/login' && method === 'POST') {
    if (tooManyAttempts(request, 'admin', 8)) {
      return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    }
    const data = await body(request);
    if (typeof data?.key !== 'string' || !verifyAdminKey(data.key)) {
      return json({ error: 'Código de administración incorrecto.' }, 401);
    }
    return json({ role: 'admin' }, 200, await createSession('admin', null, null, request));
  }

  if (path === '/api/student/login' && method === 'POST') {
    if (tooManyAttempts(request, 'student', 20)) {
      return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    }
    const data = await body(request);
    if (typeof data?.username === 'string' || typeof data?.password === 'string') {
      const username = sanitizeUsername(data?.username);
      const password = normalizeCode(data?.password);
      if (!username || password.length !== 10) return json({ error: 'Revisa tu usuario y contraseña.' }, 400);
      const found = await authenticateStudentByUsername(username, hash(password));
      if (!found) return json({ error: 'Usuario o contraseña incorrectos, vencidos o desactivados.' }, 401);
      const setCookie = await createSession('student', found.student.id, found.student.courseId, request);
      return json({ role: 'student', student: found.student, progress: found.progress }, 200, setCookie);
    }
    const code = normalizeCode(data?.code);
    if (code.length !== 10) return json({ error: 'Revisa el código de estudiante.' }, 400);
    const found = await authenticateStudentByCode(hash(code));
    if (!found) {
      return json({ error: 'Código inválido, vencido o curso sin guardado activo.' }, 401);
    }
    const setCookie = await createSession('student', found.student.id, found.student.courseId, request);
    return json({ role: 'student', student: found.student, progress: found.progress }, 200, setCookie);
  }

  if (path === '/api/student/register' && method === 'POST') {
    if (tooManyAttempts(request, 'student-register', 12)) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    const data = await body(request);
    const username = sanitizeUsername(data?.username);
    const joinCode = normalizeCode(data?.joinCode);
    if (!username) return json({ error: 'El usuario debe tener 3 a 20 caracteres: letras sin tilde, números, guion o guion bajo. Usa un alias que no revele tu identidad.' }, 400);
      if (hasOffensiveUsernameTerm(username)) return json({ error: 'Ese alias no está permitido. Elige uno respetuoso y que no revele tu identidad.' }, 400);
    if (joinCode.length !== 10) return json({ error: 'Revisa el código de curso.' }, 400);
    const account = await createStudentAccount(hash(joinCode), username, data?.progress);
    if ('error' in account) return json({ error: account.error }, 400);
    const setCookie = await createSession('student', account.student.id, account.student.courseId, request);
    return json({ role: 'student', student: account.student, progress: account.progress, password: account.password }, 201, setCookie);
  }

  if (path === '/api/student/check-course' && method === 'POST') {
    if (tooManyAttempts(request, 'student-course', 20)) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    const data = await body(request);
    const username = sanitizeUsername(data?.username);
    if (!username) return json({ error: 'El usuario debe tener 3 a 20 caracteres: letras sin tilde, números, guion o guion bajo.' }, 400);
    if (hasOffensiveUsernameTerm(username)) return json({ error: 'Ese alias no está permitido. Elige uno respetuoso y que no revele tu identidad.' }, 400);
    const joinCode = normalizeCode(data?.joinCode);
    if (joinCode.length !== 10 || !(await validateCourseJoinCode(hash(joinCode)))) {
      return json({ error: 'Código de curso incorrecto, vencido o sin guardado activo. Pide ayuda a tu docente.' }, 400);
    }
    if (!(await isUsernameAvailable(username))) return json({ error: 'Ese usuario ya existe. Prueba otro alias inventado antes de empezar.' }, 409);
    return json({ ok: true });
  }

  if (path === '/api/logout' && method === 'POST') {
    for (const role of ['admin', 'student'] as const) {
      const token = getCookie(request, role === 'admin' ? 'rea_admin' : 'rea_student');
      if (token) await deleteSessionByHash(hash(token));
    }
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie('rea_admin', '', 0, request));
    headers.append('Set-Cookie', cookie('rea_student', '', 0, request));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (path === '/api/progress' && method === 'PUT') {
    const current: any = await session(request, 'student');
    if (!current) return json({ error: 'Sesión vencida. Ingresa tu código de nuevo.' }, 401);
    const data = await body(request);
    if (!data?.progress || typeof data.progress !== 'object') return json({ error: 'Progreso inválido.' }, 400);
    const progress = cleanProgress(data.progress);
    await updateStudentProgress(current.student.id, progress);
    return json({ progress });
  }

  if (path.startsWith('/api/admin/')) {
    if (!(await session(request, 'admin'))) {
      return json({ error: 'Acceso de administración requerido.' }, 401);
    }

    if (path === '/api/admin/game-content' && method === 'PUT') {
      const data = await body(request);
      const content = cleanGameContent(data?.content);
      if (!content) return json({ error: 'El contenido no es válido. Revisa imágenes, enlaces y preguntas.' }, 400);
      await saveGameContent(content);
      return json({ ok: true, content });
    }

    if (path === '/api/admin/courses' && method === 'GET') {
      const courses = await listCourses();
      return json({ courses });
    }

    if (path === '/api/admin/courses' && method === 'POST') {
      const data = await body(request);
      const alias = sanitizeAlias(data?.alias);
      if (!alias) {
        return json({ error: 'Alias de curso inválido. Usa entre 2 y 40 caracteres (ej. 7B-MUSICA-2026).' }, 400);
      }
      const saveMode = data?.saveMode === 'no_save' ? 'no_save' : 'save_to_resume';
      const expireDays = integer(data?.expireDays, 1, 30, 30);
      const deleteDays = integer(data?.deleteDays, expireDays, 45, Math.min(45, expireDays + 15));
      try {
        const course = await createCourse({ alias, saveMode, expireDays, deleteDays });
        return json({ course }, 201);
      } catch (cause: any) {
        return json({ error: cause?.message || 'No se pudo crear el curso.' }, 409);
      }
    }

    const inviteMatch = path.match(/^\/api\/admin\/courses\/([A-Za-z0-9_-]+)\/invite-code$/);
    if (inviteMatch && method === 'POST') {
      const joinCode = await issueCourseJoinCode(inviteMatch[1]);
      if (!joinCode) return json({ error: 'Curso no encontrado.' }, 404);
      return json({ joinCode });
    }

    const courseModeMatch = path.match(/^\/api\/admin\/courses\/([A-Za-z0-9_-]+)\/mode$/);
    if (courseModeMatch && method === 'POST') {
      const courseId = courseModeMatch[1];
      const data = await body(request);
      const saveMode = data?.saveMode === 'no_save' ? 'no_save' : 'save_to_resume';
      const expireDays = data?.expireDays !== undefined ? integer(data.expireDays, 1, 30, 30) : undefined;
      const deleteDays = data?.deleteDays !== undefined ? integer(data.deleteDays, 1, 45, 45) : undefined;
      const updated = await setCourseSaveMode(courseId, saveMode, expireDays, deleteDays);
      if (!updated) return json({ error: 'Curso no encontrado.' }, 404);
      return json({ ok: true, courses: await listCourses() });
    }

    const courseDeleteMatch = path.match(/^\/api\/admin\/courses\/([A-Za-z0-9_-]+)$/);
    if (courseDeleteMatch && method === 'DELETE') {
      const courseId = courseDeleteMatch[1];
      const deleted = await deleteCourseCompletely(courseId);
      if (!deleted) return json({ error: 'Curso no encontrado.' }, 404);
      return json({ ok: true, courses: await listCourses() });
    }

    if (path === '/api/admin/students' && method === 'DELETE') {
      const deletedCount = await deleteAllStudents();
      return json({ ok: true, deletedCount });
    }

    if (path === '/api/admin/students' && method === 'GET') {
      const courseId = url.searchParams.get('courseId') || undefined;
      const [students, courses] = await Promise.all([listStudents(courseId), listCourses()]);
      return json({ students, courses });
    }

    const passwordReset = path.match(/^\/api\/admin\/students\/(\d+)\/new-password$/);
    if (passwordReset && method === 'POST') {
      const password = await resetStudentPassword(Number(passwordReset[1]));
      if (!password) return json({ error: 'No se encontró una cuenta activa para ese estudiante.' }, 404);
      return json({ password });
    }

    if (path === '/api/admin/codes' && method === 'POST') {
      const data = await body(request);
      const count = integer(data?.count, 1, 45, 1);
      const days = data?.days !== undefined ? integer(data?.days, 1, 30, 30) : undefined;
      const prefix = typeof data?.prefix === 'string' ? data.prefix : 'Estudiante';
      const courseId = typeof data?.courseId === 'string' && data.courseId.trim() ? data.courseId.trim() : undefined;
      try {
        const created = await generateStudentCodes({ courseId, count, days, prefix });
        return json({ created }, 201);
      } catch (cause: any) {
        return json({ error: cause?.message || 'No se pudieron generar los códigos.' }, 400);
      }
    }

    const action = path.match(/^\/api\/admin\/students\/(\d+)\/(expire-sessions|revoke|reset|delete)$/);
    if (action && method === 'POST') {
      const studentId = Number(action[1]);
      const kind = action[2] as 'expire-sessions' | 'revoke' | 'reset' | 'delete';
      const ok = await performStudentAction(studentId, kind);
      if (!ok) return json({ error: 'Estudiante no encontrado.' }, 404);
      return json({ ok: true });
    }
  }

  return json({ error: 'Ruta no encontrada.' }, 404);
}
