# Próximos pasos: guardado, base de datos y Vercel

Este documento define una ruta para pasar del prototipo local a una versión web que pueda guardar progreso de forma clara y limitada. El principio central es **no pedir nombres en la aplicación**.

## Decisión de privacidad y guardado

El docente debe elegir el modo de trabajo para cada curso, dentro de las reglas que autorice el establecimiento:

1. **Práctica sin guardado** — opción inicial recomendada. No se crean códigos personales ni se registra avance en el servidor. Al cerrar o recargar la página, la partida se pierde.
2. **Retomar otro día** — el docente activa el guardado, elige una fecha de eliminación y genera un código aleatorio por estudiante. El sitio conserva solo el código en forma de hash, una etiqueta neutra y el progreso necesario para retomar.

La pantalla docente debe explicar esta diferencia antes de crear códigos. Si el guardado está activo, debe mostrar el vencimiento y la fecha en que se borrarán los datos. Desactivar el guardado debe requerir confirmar qué pasará con el progreso existente; la opción más simple es borrarlo.

No usar nombre, apellido, RUT, correo, fecha de nacimiento ni número de lista como código o etiqueta. Si el docente necesita saber quién usa cada código, puede conservar la relación **nombre ↔ código** en un registro privado del curso, separado de la aplicación y de GitHub. No subir esa relación ni compartir el CSV con el curso completo.

Un código aleatorio reduce la exposición directa, pero si el docente conserva una tabla que permite asociarlo a una persona, el progreso es **pseudónimo, no anónimo**. Debe cuidarse como información del curso.

## Estado actual del prototipo

- Bun sirve una API y una base SQLite local en `data/game.sqlite`.
- El modo de prueba no conserva el avance. En cambio, todo código individual actualmente sí lo guarda.
- Cada código generado es aleatorio; la base conserva su hash y una etiqueta genérica secuencial como “Estudiante 1”. No ingreses nombres en el campo de etiqueta.
- El avance queda asociado al registro del código. **El vencimiento impide volver a entrar, pero hoy no borra automáticamente el registro ni el progreso.** Falta implementar una política real de retención y borrado.
- La instalación tiene un único panel docente y no separa cursos ni docentes. Antes de usarla con varios cursos hay que agregar esa separación.

## Fase 1 — Cerrar el diseño antes de migrar

- Definir con el establecimiento quién administra el sitio y qué modo de guardado está permitido.
- Elegir retención corta y explícita para el avance guardado; por ejemplo, hasta una fecha de cierre del curso. El valor definitivo lo establece el establecimiento.
- Definir el procedimiento para entregar, reponer, revocar y borrar códigos.
- Confirmar quién puede ver el progreso y cómo docentes/estudiantes pueden solicitar corrección o eliminación.
- Preparar un aviso breve para estudiantes y apoderados que explique finalidad, datos guardados, fecha de borrado y contacto responsable.
- Mantener la tabla que vincula nombres con códigos fuera del sistema, bajo control del docente/establecimiento.

## Fase 2 — Diseñar la base de datos persistente

Usar PostgreSQL administrado para la versión web. El esquema inicial debería separar:

- `courses`: identificador interno aleatorio, alias organizativo (por ejemplo `7B-MATEMATICA-2026`), docente responsable, modo de guardado y fechas de expiración/borrado. El alias del curso no es una contraseña; cualquier código de invitación debe ser distinto.
- `student_codes`: curso, hash del código, etiqueta neutra, creación, vencimiento y revocación.
- `progress`: código/estudiante, nivel, pregunta pendiente, estado de campaña y fecha de última actualización.
- `sessions`: token de sesión en hash, rol, curso asociado y expiración.
- `teachers`: cuentas de docentes o invitaciones con permisos limitados por curso; no compartir una clave global entre varios docentes.

Aplicar claves foráneas, índices, restricciones y migraciones versionadas. No guardar respuestas libres, nombres ni correos estudiantiles si no son necesarios. Probar el borrado completo de un curso, incluidos progreso, códigos y sesiones.

## Fase 3 — Implementar el control de guardado

- Crear un curso en el panel docente con modo **sin guardar** o **guardar para retomar**.
- Con modo sin guardar, no crear códigos ni enviar avances a la API; mantener el estado solo durante la sesión del navegador.
- Con guardado activo, pedir una confirmación que muestre el vencimiento y la fecha de borrado antes de generar códigos.
- Generar códigos aleatorios individuales; almacenar solo hashes y limitar intentos de acceso.
- No aceptar nombres ni números de lista en etiquetas. Usar alias neutros no vinculados al registro escolar.
- Ejecutar un borrado automático al alcanzar la fecha definida. El vencimiento de un código y el borrado de sus datos son operaciones separadas.
- Permitir al docente borrar el progreso de un código o de todo un curso y revocar sesiones asociadas.
- Mantener exportaciones protegidas: el CSV con códigos solo aparece al crearlos, se descarga una vez y no contiene nombres.

## Fase 4 — Migrar la API y desplegar

1. Crear una base PostgreSQL de desarrollo con datos ficticios y aplicar las migraciones.
2. Sustituir las consultas SQLite por consultas PostgreSQL con parámetros y conexión agrupada/pooling.
3. Adaptar las rutas de `src/server/api.ts` a funciones compatibles con Vercel, conservando validación, autenticación y límites de solicitudes.
4. Probar la sesión docente/estudiante, recuperación de avance, expiración, revocación y borrado con datos ficticios.
5. Conectar el repositorio en Vercel y la base mediante un proveedor del Marketplace. Guardar credenciales únicamente en variables de entorno.
6. Configurar HTTPS, cookies seguras, protección contra abuso, respaldos y una rutina comprobable de restauración.
7. Desplegar primero una vista previa privada; revisar costos, región de funciones/base y política del establecimiento antes de habilitar el uso del curso.
8. Publicar el aviso de privacidad y probar con un curso piloto usando códigos ficticios antes de cargar progreso real.

Vercel ofrece funciones con runtime Bun, pero la aplicación actual usa un servidor Bun continuo y SQLite local: hay que adaptar la API. Las funciones tienen sistema de archivos de solo lectura (salvo `/tmp`, que es temporal), por lo que SQLite local no sirve como base persistente para este despliegue. Vercel conecta PostgreSQL mediante integraciones del Marketplace, como Neon o Supabase. Ver [runtime Bun](https://vercel.com/docs/functions/runtimes/bun), [sistema de archivos de Functions](https://vercel.com/docs/functions/runtimes) y [almacenamiento de Vercel Marketplace](https://vercel.com/docs/marketplace-storage).

## Criterios para considerar lista la versión con progreso

- El docente elige explícitamente si se guarda, y el modo sin guardado no crea registros de estudiantes.
- En modo con guardado, cada estudiante recibe un código aleatorio y la interfaz nunca solicita su nombre.
- La fecha de expiración y la de borrado se entienden y son distintas cuando corresponde.
- Al borrar un curso se eliminan sus códigos, progreso y sesiones; se documenta cuánto duran los respaldos.
- Ningún código, clave, CSV de clase o base de datos se sube a GitHub.
- La política y el texto informativo fueron revisados por el establecimiento antes de usar información de estudiantes.

## Respaldo legislativo chileno

La Ley 21.719 modifica el marco chileno de protección de datos personales e incluye reglas especiales para niños, niñas y adolescentes, entre ellas el interés superior, la autonomía progresiva y un deber especial de protección para establecimientos educacionales. La Ley 21.855, publicada el 23 de noviembre de 2026, fijó su entrada en vigencia para el **15 de octubre de 2027**. Revisar la fecha y el texto vigente antes de un despliegue real; esta sección sirve para orientar el diseño, no reemplaza la revisión del establecimiento ni asesoría legal.

- [Ley 21.719, Biblioteca del Congreso Nacional](https://www.bcn.cl/leychile/navegar?idNorma=1209272)
- [Ley 21.855, Biblioteca del Congreso Nacional](https://www.bcn.cl/leychile/navegar?idNorma=1230520&idVersion=2026-11-23)

## Guía de terminal: Arch Linux, Supabase y Vercel

El equipo ya tiene Bun y Git. Ejecuta estos comandos desde la raíz del repositorio; `bunx` ejecuta los CLIs sin instalarlos globalmente:

```bash
cd /home/diego/Proyectos/rompe-el-algoritmo-maipu
bun --version
git status --short
```

### Crear y enlazar una base Supabase de desarrollo

Primero crea un proyecto **de desarrollo** desde el Dashboard de Supabase y usa datos ficticios. Guarda la contraseña de PostgreSQL en un gestor de contraseñas; no la pegues en el repositorio ni en un issue. Luego, desde la terminal:

```bash
bun add --dev supabase
bunx supabase --version
bunx supabase init
bunx supabase login
bunx supabase projects list
bunx supabase link --project-ref <PROJECT_REF>
```

Crear la primera migración versionada y escribir ahí el esquema revisado:

```bash
bunx supabase migration new initial_schema
```

Después de revisar el SQL, previsualizar y aplicar al proyecto remoto de desarrollo:

```bash
bunx supabase db push --dry-run --remote
bunx supabase db push --remote
```

`--dry-run` no aplica cambios. `db push` sí cambia la base remota; confirmar el nombre del proyecto y el SQL antes de ejecutarlo. No apuntar a producción hasta tener una migración revisada y un respaldo probado. Para levantar Supabase localmente se necesita Docker; no hace falta si se trabajará solo con un proyecto de desarrollo alojado.

### Vincular Vercel y hacer una vista previa

Cuando la API se haya adaptado a funciones Vercel, autenticar y vincular el directorio:

```bash
bunx vercel login
bunx vercel link
```

Crear variables de entorno backend solo en Vercel. Si se usa una conexión PostgreSQL, copiar desde Supabase **Connect → Transaction pooler** y guardarla como `DATABASE_URL`. No escribir la contraseña de la base en el código ni en variables `VITE_*`; la conexión debe quedar disponible solo en la API servidor. Para funciones serverless se recomienda el pooler de transacciones; configurar el driver con conexiones limitadas, SSL y sin prepared statements si el driver lo requiere.

Se puede traer una copia local de variables a un archivo que Git ignora:

```bash
bunx vercel env pull .env.local
```

Desplegar primero una vista previa y verificar solo con códigos ficticios:

```bash
bunx vercel
```

Publicar producción solo después de revisar la vista previa, el proyecto de Supabase conectado, la retención/borrado y la configuración de seguridad:

```bash
bunx vercel --prod
```

Referencias oficiales: [CLI de Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started), [migraciones remotas](https://supabase.com/docs/guides/local-development/cli-workflows), [conexiones serverless Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers) y [CLI de Vercel](https://vercel.com/docs/cli).

### Contexto para Agy desde la terminal

Desde la raíz del repositorio, iniciar una sesión interactiva:

```bash
agy --prompt-interactive
```

Como primer mensaje, pedirle:

> Lee `docs/base-de-datos-y-vercel.md` completo y revisa el estado de Git y la estructura actual antes de editar. Sigue la hoja de ruta en orden: primero define e implementa el esquema Supabase y sus migraciones con datos ficticios; después adapta la API Bun/SQLite a Vercel Functions y PostgreSQL. Conserva la decisión de guardado por curso y la indicación de no pedir nombres dentro del sitio. La relación entre códigos de curso, identidad y evaluación queda como tarea posterior: no agregues campos de nombre o iniciales ahora. No escribas secretos en archivos versionados ni apliques cambios remotos o despliegues de producción sin mostrarme antes el comando, el proyecto de destino y su efecto.

## Tarea posterior: código de curso e identificación para evaluación

Después de completar la migración técnica, decidir cómo vincular el avance con evaluación sin pedir al estudiante su nombre dentro del sitio:

- Asociar cada lote de códigos a un curso identificado por un ID interno. Un alias docente como `7B-MATEMATICA-2026` sirve para organizar, pero no debe autorizar acceso.
- Comparar una tabla privada nombre ↔ código gestionada fuera de la aplicación, códigos seudónimos asignados por el docente u otra alternativa aprobada por el establecimiento.
- No asumir que una inicial del apellido vuelve anónimo un registro. Si se propone guardar identidad, revisar finalidad, acceso, aviso, base legal, retención y borrado antes de diseñar el formulario.
- Acordar qué puede ver/exportar cada docente, cómo corregir una asociación y cómo borrar un estudiante o curso.
