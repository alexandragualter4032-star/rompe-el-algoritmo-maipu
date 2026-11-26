import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const root = resolve(import.meta.dirname ?? import.meta.dir ?? process.cwd(), '../..');

export const initialProgress = () => ({
  maxUnlockedIdx: 0,
  campaignCompleted: false,
  discoveredIds: [] as string[],
  bestInfiniteStreak: 0,
  checkpoint: null as null | {
    levelIdx: number;
    stage: 'questions' | 'rhythm';
    questionIndex: number;
    visibility: number;
  },
  scores: {} as Record<string, object>,
});

export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function integer(value: unknown, min: number, max: number, fallback = min) {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

export function cleanProgress(input: any) {
  const source = input && typeof input === 'object' ? input : {};
  const checkpoint = source.checkpoint && typeof source.checkpoint === 'object'
    ? {
        levelIdx: integer(source.checkpoint.levelIdx, 0, 11),
        stage: (source.checkpoint.stage === 'rhythm' ? 'rhythm' : 'questions') as 'questions' | 'rhythm',
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

export function newCode() {
  // 32 caracteres sin ambigüedad visual (sin 0, O, 1, I) para reducir errores en sala de clases (TPACK)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normalizeCode(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function newCourseId() {
  return `crs_${randomBytes(9).toString('base64url')}`;
}

export function sanitizeAlias(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '-');
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (!/^[A-Z0-9ÁÉÍÓÚÑ._-]+$/.test(cleaned)) return null;
  return cleaned;
}

const ALLOWED_NEUTRAL_PREFIXES = new Set(['Estudiante', 'Equipo', 'Puesto', 'Grupo']);

export function sanitizeNeutralPrefix(value: unknown): string {
  if (typeof value !== 'string') return 'Estudiante';
  const trimmed = value.trim();
  if (ALLOWED_NEUTRAL_PREFIXES.has(trimmed)) return trimmed;
  return 'Estudiante';
}

function getEnv(name: string): string | undefined {
  return (typeof Bun !== 'undefined' ? Bun.env?.[name] : undefined) ?? process.env?.[name];
}

let cachedAdminKey: string | null = null;
export function getAdminKey(): string {
  if (cachedAdminKey) return cachedAdminKey;
  const envKey = getEnv('ADMIN_KEY');
  if (envKey) {
    cachedAdminKey = envKey.trim();
    return cachedAdminKey;
  }
  const dataDir = getEnv('DATA_DIR') ? resolve(getEnv('DATA_DIR')!) : resolve(root, 'data');
  try {
    mkdirSync(dataDir, { recursive: true });
    chmodSync(dataDir, 0o700);
  } catch { /* En Vercel /tmp o entornos de solo lectura */ }
  const secretPath = resolve(dataDir, 'admin.key');
  try {
    cachedAdminKey = readFileSync(secretPath, 'utf8').trim();
  } catch {
    cachedAdminKey = randomBytes(24).toString('base64url');
    try {
      writeFileSync(secretPath, `${cachedAdminKey}\n`, { mode: 0o600 });
    } catch { /* Solo lectura en serverless sin ADMIN_KEY configurada */ }
  }
  return cachedAdminKey;
}

export function verifyAdminKey(candidateStr: string): boolean {
  const expected = Buffer.from(getAdminKey());
  const candidate = Buffer.from(candidateStr.trim());
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Conexión unificada: PostgreSQL (Supabase Transaction Pooler / DATABASE_URL) o SQLite local (Bun)
const databaseUrl = getEnv('DATABASE_URL') || getEnv('POSTGRES_URL');

let pgSql: ReturnType<typeof postgres> | null = null;
let pgInitialized = false;

async function getPg() {
  if (!pgSql) {
    pgSql = postgres(databaseUrl!, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: databaseUrl!.includes('localhost') || databaseUrl!.includes('127.0.0.1') ? false : 'require',
      prepare: false, // Requerido para Supabase Transaction Pooler (Supavisor puerto 6543)
    });
  }
  if (!pgInitialized) {
    await pgSql.unsafe(`
      CREATE TABLE IF NOT EXISTS teachers (
        id BIGSERIAL PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        key_hash TEXT NOT NULL UNIQUE,
        created_at BIGINT NOT NULL,
        revoked_at BIGINT
      );
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
        save_mode TEXT NOT NULL CHECK (save_mode IN ('no_save', 'save_to_resume')),
        next_student_seq INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        delete_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS student_codes (
        id BIGSERIAL PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        revoked_at BIGINT,
        UNIQUE (course_id, label)
      );
      CREATE TABLE IF NOT EXISTS progress (
        student_id BIGINT PRIMARY KEY REFERENCES student_codes(id) ON DELETE CASCADE,
        progress_json JSONB NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
        course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
        student_id BIGINT REFERENCES student_codes(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL
      );
    `);
    const existingCourses = await pgSql`SELECT COUNT(*)::int AS total FROM courses`;
    if (existingCourses[0].total === 0) {
      const now = Date.now();
      const expiresAt = now + 30 * 24 * 3600_000;
      const deleteAt = now + 45 * 24 * 3600_000;
      await pgSql`
        INSERT INTO courses (id, alias, save_mode, next_student_seq, created_at, expires_at, delete_at)
        VALUES ('crs_default_7b', '7B-MUSICA-2026', 'save_to_resume', 1, ${now}, ${expiresAt}, ${deleteAt})
        ON CONFLICT (alias) DO NOTHING
      `;
    }
    pgInitialized = true;
  }
  return pgSql;
}

let sqliteDb: any = null;
async function getSqlite() {
  if (sqliteDb) return sqliteDb;
  const sqliteModName = 'bun:sqlite';
  const { Database } = await import(/* @vite-ignore */ sqliteModName);
  const dataDir = getEnv('DATA_DIR') ? resolve(getEnv('DATA_DIR')!) : resolve(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  try { chmodSync(dataDir, 0o700); } catch { /* Windows */ }
  const db = new Database(resolve(dataDir, 'game.sqlite'), { create: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      save_mode TEXT NOT NULL CHECK(save_mode IN ('no_save', 'save_to_resume')),
      next_student_seq INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      delete_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      UNIQUE(course_id, label)
    );
    CREATE TABLE IF NOT EXISTS progress (
      student_id INTEGER PRIMARY KEY REFERENCES student_codes(id) ON DELETE CASCADE,
      progress_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('admin', 'student')),
      course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES student_codes(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS student_codes_course_idx ON student_codes(course_id);
    CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(student_id);
    CREATE INDEX IF NOT EXISTS courses_delete_at_idx ON courses(delete_at);
  `);

  // Crear curso inicial por defecto si no hay cursos
  const countRow = db.query('SELECT COUNT(*) AS total FROM courses').get() as any;
  if (countRow.total === 0) {
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 3600_000;
    const deleteAt = now + 45 * 24 * 3600_000;
    db.query(`
      INSERT INTO courses(id, alias, save_mode, next_student_seq, created_at, expires_at, delete_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('crs_default_7b', '7B-MUSICA-2026', 'save_to_resume', 1, now, expiresAt, deleteAt);

    // Migrar datos heredados de la tabla antigua `students` si existiera en game.sqlite
    const legacyTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='students'").get();
    if (legacyTable) {
      const legacyStudents = db.query('SELECT * FROM students ORDER BY id ASC').all() as any[];
      let seq = 1;
      for (const s of legacyStudents) {
        const label = `Estudiante ${seq}`;
        seq += 1;
        const info = db.query(`
          INSERT OR IGNORE INTO student_codes(id, course_id, label, code_hash, created_at, expires_at, revoked_at)
          VALUES (?, 'crs_default_7b', ?, ?, ?, ?, ?)
        `).run(s.id, label, s.code_hash, s.created_at, s.expires_at, s.revoked_at);
        if (info.changes > 0) {
          db.query('INSERT OR REPLACE INTO progress(student_id, progress_json, updated_at) VALUES (?, ?, ?)')
            .run(s.id, s.progress_json, Date.now());
        }
      }
      db.query('UPDATE courses SET next_student_seq = ? WHERE id = ?').run(seq, 'crs_default_7b');
      db.exec('DROP TABLE IF EXISTS students');
    }
  }

  sqliteDb = db;
  return sqliteDb;
}

/**
 * Purga automática de cursos cuya fecha de borrado (`delete_at`) ya venció
 * y de sesiones expiradas. Cumple con el principio de limitación del plazo
 * de conservación (Ley 21.719 / Ley 21.855).
 */
export async function purgeExpiredData(): Promise<number> {
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    await sql`DELETE FROM sessions WHERE expires_at <= ${now}`;
    const deleted = await sql`DELETE FROM courses WHERE delete_at <= ${now} RETURNING id`;
    return deleted.length;
  }
  const db = await getSqlite();
  db.query('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  const info = db.query('DELETE FROM courses WHERE delete_at <= ?').run(now);
  return Number(info.changes ?? 0);
}

export async function createSessionRecord(role: 'admin' | 'student', studentId: number | null, courseId: string | null, expiresAt: number, tokenHash: string) {
  if (databaseUrl) {
    const sql = await getPg();
    await sql`
      INSERT INTO sessions (token_hash, role, course_id, student_id, expires_at)
      VALUES (${tokenHash}, ${role}, ${courseId}, ${studentId}, ${expiresAt})
    `;
    return;
  }
  const db = await getSqlite();
  db.query('INSERT INTO sessions(token_hash, role, course_id, student_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(tokenHash, role, courseId, studentId, expiresAt);
}

export async function deleteSessionByHash(tokenHash: string) {
  if (databaseUrl) {
    const sql = await getPg();
    await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
    return;
  }
  const db = await getSqlite();
  db.query('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export async function getActiveSession(tokenHash: string, role: 'admin' | 'student') {
  await purgeExpiredData();
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const rows = await sql`
      SELECT token_hash, role, course_id, student_id, expires_at
      FROM sessions
      WHERE token_hash = ${tokenHash}
    `;
    const row = rows[0];
    if (!row || row.role !== role || Number(row.expires_at) <= now) return null;
    if (role === 'admin') return { admin: true };

    const students = await sql`
      SELECT sc.id, sc.course_id, sc.label, sc.expires_at, sc.revoked_at,
             c.alias AS course_alias, c.save_mode, c.delete_at,
             p.progress_json
      FROM student_codes sc
      JOIN courses c ON c.id = sc.course_id
      LEFT JOIN progress p ON p.student_id = sc.id
      WHERE sc.id = ${row.student_id}
    `;
    const student = students[0];
    if (!student || student.revoked_at || Number(student.expires_at) <= now || Number(student.delete_at) <= now || student.save_mode !== 'save_to_resume') {
      return null;
    }
    const rawProgress = typeof student.progress_json === 'string'
      ? JSON.parse(student.progress_json)
      : (student.progress_json ?? initialProgress());
    return {
      student: {
        id: Number(student.id),
        courseId: String(student.course_id),
        courseAlias: String(student.course_alias),
        label: String(student.label),
        expiresAt: Number(student.expires_at),
        deleteAt: Number(student.delete_at),
      },
      progress: cleanProgress(rawProgress),
    };
  }

  const db = await getSqlite();
  const row: any = db.query('SELECT role, course_id, student_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!row || row.role !== role || row.expires_at <= now) return null;
  if (role === 'admin') return { admin: true };

  const student: any = db.query(`
    SELECT sc.id, sc.course_id, sc.label, sc.expires_at, sc.revoked_at,
           c.alias AS course_alias, c.save_mode, c.delete_at,
           p.progress_json
    FROM student_codes sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN progress p ON p.student_id = sc.id
    WHERE sc.id = ?
  `).get(row.student_id);

  if (!student || student.revoked_at || student.expires_at <= now || student.delete_at <= now || student.save_mode !== 'save_to_resume') {
    return null;
  }
  return {
    student: {
      id: Number(student.id),
      courseId: String(student.course_id),
      courseAlias: String(student.course_alias),
      label: String(student.label),
      expiresAt: Number(student.expires_at),
      deleteAt: Number(student.delete_at),
    },
    progress: cleanProgress(student.progress_json ? JSON.parse(student.progress_json) : initialProgress()),
  };
}

export async function authenticateStudentByCode(codeHash: string) {
  await purgeExpiredData();
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const rows = await sql`
      SELECT sc.id, sc.course_id, sc.label, sc.expires_at, sc.revoked_at,
             c.alias AS course_alias, c.save_mode, c.delete_at,
             p.progress_json
      FROM student_codes sc
      JOIN courses c ON c.id = sc.course_id
      LEFT JOIN progress p ON p.student_id = sc.id
      WHERE sc.code_hash = ${codeHash}
    `;
    const student = rows[0];
    if (!student || student.revoked_at || Number(student.expires_at) <= now || Number(student.delete_at) <= now || student.save_mode !== 'save_to_resume') {
      return null;
    }
    const rawProgress = typeof student.progress_json === 'string'
      ? JSON.parse(student.progress_json)
      : (student.progress_json ?? initialProgress());
    return {
      student: {
        id: Number(student.id),
        courseId: String(student.course_id),
        courseAlias: String(student.course_alias),
        label: String(student.label),
        expiresAt: Number(student.expires_at),
        deleteAt: Number(student.delete_at),
      },
      progress: cleanProgress(rawProgress),
    };
  }

  const db = await getSqlite();
  const student: any = db.query(`
    SELECT sc.id, sc.course_id, sc.label, sc.expires_at, sc.revoked_at,
           c.alias AS course_alias, c.save_mode, c.delete_at,
           p.progress_json
    FROM student_codes sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN progress p ON p.student_id = sc.id
    WHERE sc.code_hash = ?
  `).get(codeHash);

  if (!student || student.revoked_at || student.expires_at <= now || student.delete_at <= now || student.save_mode !== 'save_to_resume') {
    return null;
  }
  return {
    student: {
      id: Number(student.id),
      courseId: String(student.course_id),
      courseAlias: String(student.course_alias),
      label: String(student.label),
      expiresAt: Number(student.expires_at),
      deleteAt: Number(student.delete_at),
    },
    progress: cleanProgress(student.progress_json ? JSON.parse(student.progress_json) : initialProgress()),
  };
}

export async function updateStudentProgress(studentId: number, cleanedProgress: ReturnType<typeof cleanProgress>) {
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    await sql`
      INSERT INTO progress (student_id, progress_json, updated_at)
      VALUES (${studentId}, ${sql.json(cleanedProgress as any)}, ${now})
      ON CONFLICT (student_id) DO UPDATE
      SET progress_json = EXCLUDED.progress_json, updated_at = EXCLUDED.updated_at
    `;
    return;
  }
  const db = await getSqlite();
  db.query(`
    INSERT INTO progress (student_id, progress_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(student_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at
  `).run(studentId, JSON.stringify(cleanedProgress), now);
}

export async function listCourses() {
  await purgeExpiredData();
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const rows = await sql`
      SELECT c.id, c.alias, c.save_mode, c.next_student_seq, c.created_at, c.expires_at, c.delete_at,
             (SELECT COUNT(*)::int FROM student_codes sc WHERE sc.course_id = c.id) AS total_codes,
             (SELECT COUNT(*)::int FROM student_codes sc WHERE sc.course_id = c.id AND sc.revoked_at IS NULL AND sc.expires_at > ${now}) AS active_codes
      FROM courses c
      ORDER BY c.created_at DESC
    `;
    return rows.map((r: any) => ({
      id: String(r.id),
      alias: String(r.alias),
      saveMode: r.save_mode as 'no_save' | 'save_to_resume',
      createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at),
      deleteAt: Number(r.delete_at),
      totalCodes: Number(r.total_codes),
      activeCodes: Number(r.active_codes),
    }));
  }

  const db = await getSqlite();
  const rows = db.query(`
    SELECT c.id, c.alias, c.save_mode, c.next_student_seq, c.created_at, c.expires_at, c.delete_at,
           (SELECT COUNT(*) FROM student_codes sc WHERE sc.course_id = c.id) AS total_codes,
           (SELECT COUNT(*) FROM student_codes sc WHERE sc.course_id = c.id AND sc.revoked_at IS NULL AND sc.expires_at > ?) AS active_codes
    FROM courses c
    ORDER BY c.created_at DESC
  `).all(now) as any[];
  return rows.map((r) => ({
    id: String(r.id),
    alias: String(r.alias),
    saveMode: r.save_mode as 'no_save' | 'save_to_resume',
    createdAt: Number(r.created_at),
    expiresAt: Number(r.expires_at),
    deleteAt: Number(r.delete_at),
    totalCodes: Number(r.total_codes),
    activeCodes: Number(r.active_codes),
  }));
}

export async function createCourse(input: { alias: string; saveMode: 'no_save' | 'save_to_resume'; expireDays: number; deleteDays: number }) {
  await purgeExpiredData();
  const now = Date.now();
  const expiresAt = now + input.expireDays * 24 * 3600_000;
  const deleteAt = now + Math.max(input.expireDays, input.deleteDays) * 24 * 3600_000;
  const id = newCourseId();

  if (databaseUrl) {
    const sql = await getPg();
    const existing = await sql`SELECT id FROM courses WHERE alias = ${input.alias}`;
    if (existing.length > 0) {
      throw new Error(`Ya existe un curso con el alias "${input.alias}". Selecciónalo en la lista o usa otro identificador.`);
    }
    await sql`
      INSERT INTO courses (id, alias, save_mode, next_student_seq, created_at, expires_at, delete_at)
      VALUES (${id}, ${input.alias}, ${input.saveMode}, 1, ${now}, ${expiresAt}, ${deleteAt})
    `;
  } else {
    const db = await getSqlite();
    const existing = db.query('SELECT id FROM courses WHERE alias = ?').get(input.alias);
    if (existing) {
      throw new Error(`Ya existe un curso con el alias "${input.alias}". Selecciónalo en la lista o usa otro identificador.`);
    }
    db.query(`
      INSERT INTO courses (id, alias, save_mode, next_student_seq, created_at, expires_at, delete_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(id, input.alias, input.saveMode, now, expiresAt, deleteAt);
  }

  return {
    id,
    alias: input.alias,
    saveMode: input.saveMode,
    createdAt: now,
    expiresAt,
    deleteAt,
    totalCodes: 0,
    activeCodes: 0,
  };
}

export async function setCourseSaveMode(courseId: string, saveMode: 'no_save' | 'save_to_resume', expireDays?: number, deleteDays?: number) {
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const rows = await sql`SELECT id, expires_at, delete_at FROM courses WHERE id = ${courseId}`;
    if (rows.length === 0) return null;
    if (saveMode === 'no_save') {
      // Al pasar a modo sin guardado, se borran inmediatamente todos los códigos, sesiones y progresos existentes del curso
      await sql`DELETE FROM sessions WHERE course_id = ${courseId}`;
      await sql`DELETE FROM student_codes WHERE course_id = ${courseId}`;
      await sql`UPDATE courses SET save_mode = 'no_save', next_student_seq = 1 WHERE id = ${courseId}`;
    } else {
      const exp = expireDays ? now + expireDays * 24 * 3600_000 : Number(rows[0].expires_at);
      const del = deleteDays ? now + Math.max(expireDays ?? 1, deleteDays) * 24 * 3600_000 : Math.max(exp, Number(rows[0].delete_at));
      await sql`UPDATE courses SET save_mode = 'save_to_resume', expires_at = ${exp}, delete_at = ${del} WHERE id = ${courseId}`;
    }
    return true;
  }

  const db = await getSqlite();
  const row: any = db.query('SELECT id, expires_at, delete_at FROM courses WHERE id = ?').get(courseId);
  if (!row) return null;
  if (saveMode === 'no_save') {
    db.query('DELETE FROM sessions WHERE course_id = ?').run(courseId);
    db.query('DELETE FROM student_codes WHERE course_id = ?').run(courseId);
    db.query("UPDATE courses SET save_mode = 'no_save', next_student_seq = 1 WHERE id = ?").run(courseId);
  } else {
    const exp = expireDays ? now + expireDays * 24 * 3600_000 : Number(row.expires_at);
    const del = deleteDays ? now + Math.max(expireDays ?? 1, deleteDays) * 24 * 3600_000 : Math.max(exp, Number(row.delete_at));
    db.query("UPDATE courses SET save_mode = 'save_to_resume', expires_at = ?, delete_at = ? WHERE id = ?").run(exp, del, courseId);
  }
  return true;
}

export async function deleteCourseCompletely(courseId: string): Promise<boolean> {
  if (databaseUrl) {
    const sql = await getPg();
    const deleted = await sql`DELETE FROM courses WHERE id = ${courseId} RETURNING id`;
    return deleted.length > 0;
  }
  const db = await getSqlite();
  const info = db.query('DELETE FROM courses WHERE id = ?').run(courseId);
  return Number(info.changes ?? 0) > 0;
}

export async function listStudents(courseId?: string | null) {
  await purgeExpiredData();
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const rows = courseId
      ? await sql`
          SELECT sc.id, sc.course_id, sc.label, sc.created_at, sc.expires_at, sc.revoked_at,
                 c.alias AS course_alias, c.delete_at,
                 p.progress_json,
                 (SELECT COUNT(*)::int FROM sessions t WHERE t.student_id = sc.id AND t.expires_at > ${now}) AS active_sessions
          FROM student_codes sc
          JOIN courses c ON c.id = sc.course_id
          LEFT JOIN progress p ON p.student_id = sc.id
          WHERE sc.course_id = ${courseId}
          ORDER BY sc.id DESC
        `
      : await sql`
          SELECT sc.id, sc.course_id, sc.label, sc.created_at, sc.expires_at, sc.revoked_at,
                 c.alias AS course_alias, c.delete_at,
                 p.progress_json,
                 (SELECT COUNT(*)::int FROM sessions t WHERE t.student_id = sc.id AND t.expires_at > ${now}) AS active_sessions
          FROM student_codes sc
          JOIN courses c ON c.id = sc.course_id
          LEFT JOIN progress p ON p.student_id = sc.id
          ORDER BY sc.id DESC
        `;
    return rows.map((row: any) => {
      const rawProgress = typeof row.progress_json === 'string'
        ? JSON.parse(row.progress_json)
        : (row.progress_json ?? initialProgress());
      return {
        id: Number(row.id),
        courseId: String(row.course_id),
        courseAlias: String(row.course_alias),
        label: String(row.label),
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
        deleteAt: Number(row.delete_at),
        revokedAt: row.revoked_at ? Number(row.revoked_at) : null,
        activeSessions: Number(row.active_sessions),
        progress: cleanProgress(rawProgress),
      };
    });
  }

  const db = await getSqlite();
  const queryStr = `
    SELECT sc.id, sc.course_id, sc.label, sc.created_at, sc.expires_at, sc.revoked_at,
           c.alias AS course_alias, c.delete_at,
           p.progress_json,
           (SELECT COUNT(*) FROM sessions t WHERE t.student_id = sc.id AND t.expires_at > ?) AS active_sessions
    FROM student_codes sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN progress p ON p.student_id = sc.id
    ${courseId ? 'WHERE sc.course_id = ?' : ''}
    ORDER BY sc.id DESC
  `;
  const rows = (courseId ? db.query(queryStr).all(now, courseId) : db.query(queryStr).all(now)) as any[];
  return rows.map((row) => ({
    id: Number(row.id),
    courseId: String(row.course_id),
    courseAlias: String(row.course_alias),
    label: String(row.label),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    deleteAt: Number(row.delete_at),
    revokedAt: row.revoked_at ? Number(row.revoked_at) : null,
    activeSessions: Number(row.active_sessions),
    progress: cleanProgress(row.progress_json ? JSON.parse(row.progress_json) : initialProgress()),
  }));
}

export async function generateStudentCodes(input: { courseId?: string; count: number; days?: number; prefix?: string }) {
  await purgeExpiredData();
  const now = Date.now();
  const neutralPrefix = sanitizeNeutralPrefix(input.prefix);

  if (databaseUrl) {
    const sql = await getPg();
    let courseRows = input.courseId
      ? await sql`SELECT * FROM courses WHERE id = ${input.courseId}`
      : await sql`SELECT * FROM courses ORDER BY created_at DESC LIMIT 1`;
    if (courseRows.length === 0) {
      throw new Error('Curso no encontrado.');
    }
    const course = courseRows[0];
    if (course.save_mode !== 'save_to_resume') {
      throw new Error('Este curso está en modo "Práctica sin guardado". Activa el modo "Guardar para retomar" antes de generar códigos.');
    }

    let seq = Number(course.next_student_seq || 1);
    const expiresAt = input.days
      ? Math.min(Number(course.delete_at), now + input.days * 24 * 3600_000)
      : Number(course.expires_at);
    const created: Array<{ id: number; courseId: string; courseAlias: string; label: string; code: string; expiresAt: number; deleteAt: number }> = [];

    for (let i = 0; i < input.count; i += 1) {
      let code = newCode();
      let codeHash = hash(normalizeCode(code));
      while ((await sql`SELECT id FROM student_codes WHERE code_hash = ${codeHash}`).length > 0) {
        code = newCode();
        codeHash = hash(normalizeCode(code));
      }

      let label = `${neutralPrefix} ${seq}`;
      while ((await sql`SELECT id FROM student_codes WHERE course_id = ${course.id} AND label = ${label}`).length > 0) {
        seq += 1;
        label = `${neutralPrefix} ${seq}`;
      }
      seq += 1;

      const inserted = await sql`
        INSERT INTO student_codes (course_id, label, code_hash, created_at, expires_at)
        VALUES (${course.id}, ${label}, ${codeHash}, ${now}, ${expiresAt})
        RETURNING id
      `;
      const studentId = Number(inserted[0].id);
      await sql`
        INSERT INTO progress (student_id, progress_json, updated_at)
        VALUES (${studentId}, ${sql.json(initialProgress() as any)}, ${now})
      `;
      created.push({
        id: studentId,
        courseId: String(course.id),
        courseAlias: String(course.alias),
        label,
        code,
        expiresAt,
        deleteAt: Number(course.delete_at),
      });
    }

    await sql`UPDATE courses SET next_student_seq = ${seq} WHERE id = ${course.id}`;
    return created;
  }

  const db = await getSqlite();
  const course: any = input.courseId
    ? db.query('SELECT * FROM courses WHERE id = ?').get(input.courseId)
    : db.query('SELECT * FROM courses ORDER BY created_at DESC LIMIT 1').get();
  if (!course) throw new Error('Curso no encontrado.');
  if (course.save_mode !== 'save_to_resume') {
    throw new Error('Este curso está en modo "Práctica sin guardado". Activa el modo "Guardar para retomar" antes de generar códigos.');
  }

  let seq = Number(course.next_student_seq || 1);
  const expiresAt = input.days
    ? Math.min(Number(course.delete_at), now + input.days * 24 * 3600_000)
    : Number(course.expires_at);
  const created: Array<{ id: number; courseId: string; courseAlias: string; label: string; code: string; expiresAt: number; deleteAt: number }> = [];

  for (let i = 0; i < input.count; i += 1) {
    let code = newCode();
    let codeHash = hash(normalizeCode(code));
    while (db.query('SELECT id FROM student_codes WHERE code_hash = ?').get(codeHash)) {
      code = newCode();
      codeHash = hash(normalizeCode(code));
    }

    let label = `${neutralPrefix} ${seq}`;
    while (db.query('SELECT id FROM student_codes WHERE course_id = ? AND label = ?').get(course.id, label)) {
      seq += 1;
      label = `${neutralPrefix} ${seq}`;
    }
    seq += 1;

    const result = db.query(`
      INSERT INTO student_codes(course_id, label, code_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(course.id, label, codeHash, now, expiresAt);
    const studentId = Number(result.lastInsertRowid);
    db.query('INSERT INTO progress(student_id, progress_json, updated_at) VALUES (?, ?, ?)')
      .run(studentId, JSON.stringify(initialProgress()), now);

    created.push({
      id: studentId,
      courseId: String(course.id),
      courseAlias: String(course.alias),
      label,
      code,
      expiresAt,
      deleteAt: Number(course.delete_at),
    });
  }

  db.query('UPDATE courses SET next_student_seq = ? WHERE id = ?').run(seq, course.id);
  return created;
}

export async function performStudentAction(studentId: number, actionKind: 'expire-sessions' | 'revoke' | 'reset' | 'delete'): Promise<boolean> {
  const now = Date.now();
  if (databaseUrl) {
    const sql = await getPg();
    const existing = await sql`SELECT id FROM student_codes WHERE id = ${studentId}`;
    if (existing.length === 0) return false;
    if (actionKind === 'expire-sessions') {
      await sql`DELETE FROM sessions WHERE student_id = ${studentId}`;
    } else if (actionKind === 'revoke') {
      await sql`UPDATE student_codes SET revoked_at = ${now} WHERE id = ${studentId}`;
      await sql`DELETE FROM sessions WHERE student_id = ${studentId}`;
    } else if (actionKind === 'delete') {
      await sql`DELETE FROM student_codes WHERE id = ${studentId}`;
    } else {
      await sql`
        INSERT INTO progress (student_id, progress_json, updated_at)
        VALUES (${studentId}, ${sql.json(initialProgress() as any)}, ${now})
        ON CONFLICT (student_id) DO UPDATE
        SET progress_json = EXCLUDED.progress_json, updated_at = EXCLUDED.updated_at
      `;
    }
    return true;
  }

  const db = await getSqlite();
  const student: any = db.query('SELECT id FROM student_codes WHERE id = ?').get(studentId);
  if (!student) return false;
  if (actionKind === 'expire-sessions') {
    db.query('DELETE FROM sessions WHERE student_id = ?').run(studentId);
  } else if (actionKind === 'revoke') {
    db.query('UPDATE student_codes SET revoked_at = ? WHERE id = ?').run(now, studentId);
    db.query('DELETE FROM sessions WHERE student_id = ?').run(studentId);
  } else if (actionKind === 'delete') {
    db.query('DELETE FROM student_codes WHERE id = ?').run(studentId);
  } else {
    db.query(`
      INSERT INTO progress(student_id, progress_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at
    `).run(studentId, JSON.stringify(initialProgress()), now);
  }
  return true;
}
