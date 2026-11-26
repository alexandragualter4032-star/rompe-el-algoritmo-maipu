import { randomBytes } from 'node:crypto';
import {
  authenticateStudentByCode,
  cleanProgress,
  createCourse,
  createSessionRecord,
  deleteCourseCompletely,
  deleteSessionByHash,
  generateStudentCodes,
  getActiveSession,
  hash,
  integer,
  listCourses,
  listStudents,
  normalizeCode,
  performStudentAction,
  sanitizeAlias,
  setCourseSaveMode,
  updateStudentProgress,
  verifyAdminKey,
} from './db.ts';

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
  if (text.length > 16384) return null;
  try { return JSON.parse(text); } catch { return null; }
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
    if (await session(request, 'admin')) return json({ role: 'admin' });
    const current: any = await session(request, 'student');
    if (current) {
      return json({
        role: 'student',
        student: current.student,
        progress: current.progress,
      });
    }
    return json({ role: 'guest' });
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
    const code = normalizeCode(data?.code);
    if (code.length !== 10) return json({ error: 'Revisa el código de estudiante.' }, 400);
    const found = await authenticateStudentByCode(hash(code));
    if (!found) {
      return json({ error: 'Código inválido, vencido o curso sin guardado activo.' }, 401);
    }
    const setCookie = await createSession('student', found.student.id, found.student.courseId, request);
    return json({ role: 'student', student: found.student, progress: found.progress }, 200, setCookie);
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

    if (path === '/api/admin/students' && method === 'GET') {
      const courseId = url.searchParams.get('courseId') || undefined;
      const [students, courses] = await Promise.all([listStudents(courseId), listCourses()]);
      return json({ students, courses });
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
