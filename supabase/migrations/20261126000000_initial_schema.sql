-- Migración inicial: Rompe el Algoritmo Maipú
-- Diseño alineado con TPACK, Aprendizaje Multimedia (Mayer / Karpicke & Roediger)
-- y Protección de Datos Personales de NNA (Ley 21.719 / Ley 21.855, Chile).
-- Principio rector: ningún nombre, apellido, RUT, correo o número de lista se almacena en la base de datos.

BEGIN;

-- 1. Docentes / cuentas responsables (permite separar cursos por docente sin compartir una única clave global si se habilitan múltiples docentes)
CREATE TABLE IF NOT EXISTS teachers (
  id BIGSERIAL PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE CHECK (char_length(alias) BETWEEN 2 AND 40),
  key_hash TEXT NOT NULL UNIQUE CHECK (char_length(key_hash) = 64),
  created_at BIGINT NOT NULL,
  revoked_at BIGINT
);

-- 2. Cursos con decisión explícita de modo de guardado y fechas separadas de expiración y borrado
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY CHECK (char_length(id) BETWEEN 8 AND 36),
  alias TEXT NOT NULL UNIQUE CHECK (char_length(alias) BETWEEN 2 AND 40),
  teacher_id BIGINT REFERENCES teachers(id) ON DELETE SET NULL,
  save_mode TEXT NOT NULL CHECK (save_mode IN ('no_save', 'save_to_resume')),
  next_student_seq INTEGER NOT NULL DEFAULT 1 CHECK (next_student_seq >= 1),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  delete_at BIGINT NOT NULL,
  join_code_hash TEXT UNIQUE,
  CONSTRAINT courses_delete_after_expire_chk CHECK (delete_at >= expires_at)
);

CREATE INDEX IF NOT EXISTS courses_delete_at_idx ON courses(delete_at);
CREATE UNIQUE INDEX IF NOT EXISTS courses_join_code_idx ON courses(join_code_hash) WHERE join_code_hash IS NOT NULL;

-- 3. Cuentas pseudónimas por curso (alias inventado y contraseña aleatoria en hash)
CREATE TABLE IF NOT EXISTS student_codes (
  id BIGSERIAL PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label ~ '^[A-Za-zÁÉÍÓÚáéíóúÑñ]+ [0-9]{1,4}$'),
  code_hash TEXT NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  username TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  CONSTRAINT student_codes_course_label_unique UNIQUE (course_id, label)
);

CREATE INDEX IF NOT EXISTS student_codes_course_idx ON student_codes(course_id);
CREATE INDEX IF NOT EXISTS student_codes_expires_idx ON student_codes(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS student_codes_course_username_idx ON student_codes(course_id, lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS student_codes_username_global_idx ON student_codes(lower(username)) WHERE username IS NOT NULL;

-- 4. Progreso de campaña y punto de retorno (checkpoint de segmentación multimedia)
CREATE TABLE IF NOT EXISTS progress (
  student_id BIGINT PRIMARY KEY REFERENCES student_codes(id) ON DELETE CASCADE,
  progress_json JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);

-- 5. Sesiones autenticadas (hash de token de cookie HttpOnly)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY CHECK (char_length(token_hash) = 64),
  role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES student_codes(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_student_idx ON sessions(student_id);
CREATE INDEX IF NOT EXISTS sessions_course_idx ON sessions(course_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

COMMIT;
