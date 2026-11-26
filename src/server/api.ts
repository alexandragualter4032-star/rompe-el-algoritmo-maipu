import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';

const root = resolve(import.meta.dir, '../..');
const dataDir = Bun.env.DATA_DIR ? resolve(Bun.env.DATA_DIR) : resolve(root, 'data');
mkdirSync(dataDir, { recursive: true });
try { chmodSync(dataDir, 0o700); } catch { /* Windows controla permisos de otra forma */ }

const secretPath = resolve(dataDir, 'admin.key');
let adminKey = Bun.env.ADMIN_KEY;
if (!adminKey) {
  try {
    adminKey = readFileSync(secretPath, 'utf8').trim();
  } catch {
    adminKey = randomBytes(24).toString('base64url');
    writeFileSync(secretPath, `${adminKey}\n`, { mode: 0o600 });
  }
}

const db = new Database(resolve(dataDir, 'game.sqlite'), { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    progress_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(student_id);
`);

const initialProgress = () => ({
  maxUnlockedIdx: 0,
  campaignCompleted: false,
  discoveredIds: [],
  bestInfiniteStreak: 0,
  checkpoint: null,
  scores: {},
});

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function integer(value: unknown, min: number, max: number, fallback = min) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

function cleanProgress(input: any) {
  const source = input && typeof input === 'object' ? input : {};
  const checkpoint = source.checkpoint && typeof source.checkpoint === 'object'
    ? {
        levelIdx: integer(source.checkpoint.levelIdx, 0, 11),
        stage: source.checkpoint.stage === 'rhythm' ? 'rhythm' : 'questions',
        questionIndex: integer(source.checkpoint.questionIndex, 0, 5),
        visibility: integer(source.checkpoint.visibility, 0, 1500),
      }
    : null;
  const scores: Record<string, object> = {};
  if (source.scores && typeof source.scores === 'object') {
    for (let level = 0; level < 12; level += 1) {
      const item = source.scores[level];
      if (!item || typeof item !== 'object') continue;
      scores[level] = {
        visibility: integer(item.visibility, 0, 1500),
        approvalPct: integer(item.approvalPct, 0, 100),
        rhythmScore: integer(item.rhythmScore, 0, 100000),
        completedAt: integer(item.completedAt, 0, 4102444800000),
      };
    }
  }
  return {
    maxUnlockedIdx: integer(source.maxUnlockedIdx, 0, 11),
    campaignCompleted: source.campaignCompleted === true,
    discoveredIds: Array.isArray(source.discoveredIds)
      ? [...new Set(source.discoveredIds.filter((id: unknown) => typeof id === 'string'))].slice(0, 12)
      : [],
    bestInfiniteStreak: integer(source.bestInfiniteStreak, 0, 100000),
    checkpoint,
    scores,
  };
}

function json(data: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function cookie(name: string, value: string, age: number, request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}

function getCookie(request: Request, name: string) {
  const match = request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}

function session(request: Request, role: 'admin' | 'student') {
  const token = getCookie(request, role === 'admin' ? 'rea_admin' : 'rea_student');
  if (!token) return null;
  const row: any = db.query('SELECT role, student_id, expires_at FROM sessions WHERE token_hash = ?').get(hash(token));
  if (!row || row.role !== role || row.expires_at <= Date.now()) return null;
  if (role === 'student') {
    const student: any = db.query('SELECT * FROM students WHERE id = ?').get(row.student_id);
    if (!student || student.revoked_at || student.expires_at <= Date.now()) return null;
    return { student };
  }
  return { admin: true };
}

function createSession(role: 'admin' | 'student', studentId: number | null, request: Request) {
  const token = randomBytes(32).toString('base64url');
  const age = role === 'admin' ? 8 * 3600 : 7 * 24 * 3600;
  db.query('INSERT INTO sessions(token_hash, role, student_id, expires_at) VALUES (?, ?, ?, ?)')
    .run(hash(token), role, studentId, Date.now() + age * 1000);
  return cookie(role === 'admin' ? 'rea_admin' : 'rea_student', token, age, request);
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  const text = await request.text();
  if (text.length > 16384) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const adminAttempts = new Map<string, number[]>();
function tooManyAdminAttempts(request: Request) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  const now = Date.now();
  const recent = (adminAttempts.get(key) ?? []).filter((time) => now - time < 5 * 60_000);
  recent.push(now);
  adminAttempts.set(key, recent);
  return recent.length > 8;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}

export async function handleApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/me' && method === 'GET') {
    if (session(request, 'admin')) return json({ role: 'admin' });
    const current: any = session(request, 'student');
    if (current) {
      return json({
        role: 'student',
        student: { id: current.student.id, label: current.student.label, expiresAt: current.student.expires_at },
        progress: cleanProgress(JSON.parse(current.student.progress_json)),
      });
    }
    return json({ role: 'guest' });
  }

  if (path === '/api/admin/login' && method === 'POST') {
    if (tooManyAdminAttempts(request)) return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    const data = await body(request);
    const candidate = typeof data?.key === 'string' ? Buffer.from(data.key.trim()) : Buffer.alloc(0);
    const expected = Buffer.from(adminKey!);
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      return json({ error: 'Código de administración incorrecto.' }, 401);
    }
    return json({ role: 'admin' }, 200, createSession('admin', null, request));
  }

  if (path === '/api/student/login' && method === 'POST') {
    const data = await body(request);
    const code = normalizeCode(data?.code);
    if (code.length !== 10) return json({ error: 'Revisa el código de estudiante.' }, 400);
    const student: any = db.query('SELECT * FROM students WHERE code_hash = ?').get(hash(code));
    if (!student || student.revoked_at || student.expires_at <= Date.now()) {
      return json({ error: 'Código inválido o vencido.' }, 401);
    }
    return json({ role: 'student', student: { id: student.id, label: student.label }, progress: cleanProgress(JSON.parse(student.progress_json)) },
      200, createSession('student', student.id, request));
  }

  if (path === '/api/logout' && method === 'POST') {
    for (const role of ['admin', 'student'] as const) {
      const token = getCookie(request, role === 'admin' ? 'rea_admin' : 'rea_student');
      if (token) db.query('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
    }
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie('rea_admin', '', 0, request));
    headers.append('Set-Cookie', cookie('rea_student', '', 0, request));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (path === '/api/progress' && method === 'PUT') {
    const current: any = session(request, 'student');
    if (!current) return json({ error: 'Sesión vencida. Ingresa tu código de nuevo.' }, 401);
    const data = await body(request);
    if (!data?.progress || typeof data.progress !== 'object') return json({ error: 'Progreso inválido.' }, 400);
    const progress = cleanProgress(data.progress);
    db.query('UPDATE students SET progress_json = ? WHERE id = ?').run(JSON.stringify(progress), current.student.id);
    return json({ progress });
  }

  if (path.startsWith('/api/admin/')) {
    if (!session(request, 'admin')) return json({ error: 'Acceso de administración requerido.' }, 401);

    if (path === '/api/admin/students' && method === 'GET') {
      const rows: any[] = db.query(`SELECT s.id, s.label, s.created_at, s.expires_at, s.revoked_at, s.progress_json,
        (SELECT COUNT(*) FROM sessions t WHERE t.student_id = s.id AND t.expires_at > ?) AS active_sessions
        FROM students s ORDER BY s.id DESC`).all(Date.now()) as any[];
      return json({ students: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        activeSessions: row.active_sessions,
        progress: cleanProgress(JSON.parse(row.progress_json)),
      })) });
    }

    if (path === '/api/admin/codes' && method === 'POST') {
      const data = await body(request);
      const count = integer(data?.count, 1, 40, 1);
      const days = integer(data?.days, 1, 365, 90);
      const prefix = typeof data?.prefix === 'string' ? data.prefix.trim().slice(0, 25) : 'Estudiante';
      const existing = (db.query('SELECT COUNT(*) AS total FROM students').get() as any).total;
      const created = [];
      for (let i = 0; i < count; i += 1) {
        let code = newCode();
        while (db.query('SELECT id FROM students WHERE code_hash = ?').get(hash(normalizeCode(code)))) code = newCode();
        const label = `${prefix || 'Estudiante'} ${existing + i + 1}`;
        const expiresAt = Date.now() + days * 24 * 3600_000;
        const result = db.query('INSERT INTO students(label, code_hash, created_at, expires_at, progress_json) VALUES (?, ?, ?, ?, ?)')
          .run(label, hash(normalizeCode(code)), Date.now(), expiresAt, JSON.stringify(initialProgress()));
        created.push({ id: Number(result.lastInsertRowid), label, code, expiresAt });
      }
      return json({ created }, 201);
    }

    const action = path.match(/^\/api\/admin\/students\/(\d+)\/(expire-sessions|revoke|reset)$/);
    if (action && method === 'POST') {
      const studentId = Number(action[1]);
      const student: any = db.query('SELECT id FROM students WHERE id = ?').get(studentId);
      if (!student) return json({ error: 'Estudiante no encontrado.' }, 404);
      if (action[2] === 'expire-sessions') {
        db.query('DELETE FROM sessions WHERE student_id = ?').run(studentId);
      } else if (action[2] === 'revoke') {
        db.query('UPDATE students SET revoked_at = ? WHERE id = ?').run(Date.now(), studentId);
        db.query('DELETE FROM sessions WHERE student_id = ?').run(studentId);
      } else {
        db.query('UPDATE students SET progress_json = ? WHERE id = ?').run(JSON.stringify(initialProgress()), studentId);
      }
      return json({ ok: true });
    }
  }

  return json({ error: 'Ruta no encontrada.' }, 404);
}
