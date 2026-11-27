# Estado y próximos pasos: guardado, base de datos y Vercel

Este documento define una ruta para pasar del prototipo local a una versión web que pueda guardar progreso de forma clara y limitada. El principio central es **no pedir nombres en la aplicación**.

## Decisión de privacidad y guardado

El docente debe elegir el modo de trabajo para cada curso, dentro de las reglas que autorice el establecimiento:

1. **Práctica sin guardado** — dinámica recomendada para la clase. No se crean códigos ni cuentas, ni se registra avance en el servidor. Al cerrar o recargar la página, la partida se pierde.
2. **Retomar otro día** — opción técnica para cuando el beneficio de continuar en varias sesiones justifique el tiempo de gestión. El docente activa el guardado y entrega el código de invitación del curso. El estudiante elige un alias inventado y juega el nivel 1; al superarlo se crea la cuenta, se guarda el progreso y se entrega una contraseña aleatoria que debe anotar.

La pantalla docente debe explicar esta diferencia antes de crear códigos. Si el guardado está activo, debe mostrar el vencimiento y la fecha en que se borrarán los datos. Desactivar el guardado debe requerir confirmar qué pasará con el progreso existente; la opción más simple es borrarlo.

No usar nombre, apellido, iniciales, RUT, correo, fecha de nacimiento ni número de lista como alias. El docente puede restablecer una contraseña perdida; la contraseña anterior deja de funcionar. No guardar la relación entre alias y estudiante dentro de la aplicación ni en GitHub.

Un código aleatorio reduce la exposición directa, pero si el docente conserva una tabla que permite asociarlo a una persona, el progreso es **pseudónimo, no anónimo**. Debe cuidarse como información del curso.

## Estado actual del prototipo

- Bun sirve una API y una base SQLite local en `data/game.sqlite`.
- Vercel ya tiene una publicación de producción para revisión y una función API (`api/index.ts`). El proyecto está vinculado a la cuenta de Diego, pero no a un repositorio GitHub (`repository: null`); los despliegues se hacen manualmente con la CLI.
- El entorno de producción tiene configuradas variables protegidas `DATABASE_URL` y `ADMIN_KEY`. La conexión, el esquema y los flujos de guardado deben validarse con datos ficticios antes de usarlos con estudiantes.
- **Jugar sin guardar** es el modo recomendado en el aula: no pide códigos ni crea cuentas y no conserva avance. **Guardar para retomar** es opcional y pide código de curso y alias; crea la cuenta solo después de superar el nivel 1.
- El servidor guarda el alias, el hash de la contraseña, una etiqueta neutra y el progreso. La contraseña aparece al estudiante una vez; el panel docente puede generar una nueva.
- En la dinámica recomendada no se reparten códigos. Si el docente elige el guardado opcional, se comparte un código de invitación por curso; cada cuenta usa un alias único y una contraseña propia, que se genera tras superar el nivel 1.
- Los registros de códigos individuales creados antes de este cambio pueden permanecer en SQLite hasta que se borre el curso o esos registros. El panel ya no genera ni entrega nuevos códigos individuales.
- La purga automática por fecha, las copias de seguridad y la prueba de restauración siguen pendientes. Bun/SQLite local solo guarda datos en el equipo donde corre.
- El panel separa cursos, pero aún usa una sola cuenta docente global.

## Fase 1 — Cerrar el diseño antes de migrar

- Definir con el establecimiento quién administra el sitio y qué modo de guardado está permitido.
- Elegir retención corta y explícita para el avance guardado; por ejemplo, hasta una fecha de cierre del curso. El valor definitivo lo establece el establecimiento.
- Si se habilita el modo opcional de guardado, definir quién entrega y renueva el código de invitación del curso y quién puede reiniciar contraseñas.
- Confirmar quién puede ver el progreso y cómo docentes/estudiantes pueden solicitar corrección o eliminación.
- Preparar un aviso breve para estudiantes y apoderados que explique finalidad, datos guardados, fecha de borrado y contacto responsable.
- Si se necesita evaluación nominal, mantener la tabla identidad ↔ alias fuera del sistema, bajo control del establecimiento.

## Fase 2 — Diseñar la base de datos persistente

Usar PostgreSQL administrado para la versión web. El esquema inicial debería separar:

- `courses`: identificador interno aleatorio, alias organizativo (por ejemplo `7B-MATEMATICA-2026`), hash del código de invitación, modo de guardado y fechas de expiración/borrado. El alias del curso no es secreto.
- `student_codes` (nombre histórico de la tabla): curso, alias de usuario, hash de contraseña, etiqueta neutra, creación, vencimiento y revocación. No se reparten secretos individuales antes del juego.
- `progress`: código/estudiante, nivel, pregunta pendiente, estado de campaña y fecha de última actualización.
- `sessions`: token de sesión en hash, rol, curso asociado y expiración.
- `teachers`: cuentas de docentes o invitaciones con permisos limitados por curso; no compartir una clave global entre varios docentes.

Aplicar claves foráneas, índices, restricciones y migraciones versionadas. No guardar respuestas libres, nombres ni correos estudiantiles si no son necesarios. Probar el borrado completo de un curso, incluidos progreso, códigos y sesiones.

## Fase 3 — Implementar el control de guardado

- Crear un curso en el panel docente con modo **sin guardar** o **guardar para retomar**.
- Con modo sin guardar, no crear códigos ni enviar avances a la API; mantener el estado solo durante la sesión del navegador.
- El modo sin guardado es el punto de partida recomendado: no mostrar ni pedir códigos y mantener el estado solo durante la sesión del navegador.
- Si se habilita el guardado opcional, entregar a la clase un único código de invitación y mostrar la fecha de vencimiento y de borrado.
- El estudiante elige un alias inventado, completa el nivel 1 y recibe una contraseña aleatoria. Guardar el nivel 1 en la misma operación que crea la cuenta.
- Limitar intentos de acceso y almacenar solo el hash de la contraseña.
- No aceptar nombres ni números de lista como alias.
- Ejecutar un borrado automático al alcanzar la fecha definida. El vencimiento de un código y el borrado de sus datos son operaciones separadas.
- Permitir al docente borrar una cuenta, todas las cuentas de estudiantes o un curso; estas acciones eliminan sesiones y progreso asociados.
- No exportar contraseñas. El informe de progreso puede incluir alias pseudónimos, nunca nombres reales.

## Fase 4 — Validar el despliegue Vercel existente

1. Verificar que `DATABASE_URL` conecta a la base esperada y que el esquema/migraciones están aplicados. No copiar secretos a Git ni pegarlos en la terminal compartida.
2. Probar el modo sin guardado y el modo opcional con curso y estudiantes ficticios: acceso, guardar, retomar, expiración, revocación y borrado.
3. Implementar purga automática por `delete_at`, respaldos y una restauración comprobable.
4. Revisar autenticación, cookies seguras, límites de solicitudes en funciones serverless y la configuración de proxy antes de guardar progreso real.
5. Para despliegues automáticos, conectar el repositorio en **Vercel → Settings → Git**. La persona dueña o administradora de GitHub debe autorizar Vercel; si no, seguir publicando manualmente con la CLI.
6. Publicar aviso de privacidad y obtener revisión del establecimiento antes de usar progreso identificable o seudónimo de estudiantes.
7. Revisar la declaración de sitio dirigido a menores de YouTube: la ayuda oficial indica que los sitios o apps infantiles que insertan contenido deben identificarse como tales. Ver [YouTube: insertar videos y playlists](https://support.google.com/youtube/answer/171780).

La función `api/index.ts` usa el runtime Bun y el adaptador PostgreSQL configurado por `DATABASE_URL`. Las funciones tienen sistema de archivos de solo lectura (salvo `/tmp`, que es temporal), por lo que SQLite local no sirve como base persistente en Vercel. Ver [runtime Bun](https://vercel.com/docs/functions/runtimes/bun), [sistema de archivos de Functions](https://vercel.com/docs/functions/runtimes) y [almacenamiento de Vercel Marketplace](https://vercel.com/docs/marketplace-storage).

## Criterios para considerar lista la versión con progreso

- El docente elige explícitamente si se guarda, y el modo sin guardado no crea registros de estudiantes.
- En modo con guardado, el docente comparte un código para el curso; cada estudiante crea un alias inventado y recibe una contraseña tras el primer nivel.
- La fecha de expiración y la de borrado se entienden y son distintas cuando corresponde.
- Al borrar un curso se eliminan sus códigos, progreso y sesiones; se documenta cuánto duran los respaldos.
- Ningún código, clave, CSV de clase o base de datos se sube a GitHub.
- La política y el texto informativo fueron revisados por el establecimiento antes de usar información de estudiantes.

## Escalabilidad, retención máxima de 30 días y exportación docente (TPACK + Ley 21.719)

- **Vigencia máxima del acceso (30 días) y borrado automático (hasta 45 días):**
  - Las cuentas del curso tienen un tope de **30 días** (`expires_at`), suficiente para una unidad didáctica mensual.
  - La fecha de eliminación del curso (`delete_at`, máximo **45 días**) otorga al docente una ventana de hasta 15 días para descargar el informe antes de borrar curso, cuentas, sesiones y progreso (`ON DELETE CASCADE`).
- **Informe descargable en CSV y Excel (`.xls`):**
  - El panel docente permite exportar el **informe de avance del curso** en formato **CSV** y **planilla Excel (`.xls` SpreadsheetML)** con alias, niveles completados, estado de campaña, punto de retorno, visibilidad acumulada y porcentaje promedio de aprobación de ritmo, sin incluir nombres reales ni contraseñas.
- **Capacidad en Supabase (Plan Gratuito de 500 MB):**
  - Cada estudiante ocupa entre **1,2 KB y 1,5 KB** (`student_codes` + `progress` JSONB acotado + `sessions` + índices), por lo que un curso promedio de **40 estudiantes ocupa ~50 KB a 60 KB**.
  - Con ~450 MB útiles (reservando 50 MB para el motor PostgreSQL), la base soporta hasta **~7.500 cursos simultáneos (~300.000 estudiantes)**, y la purga automática tras `delete_at` recicla el espacio continuamente.
  - Para soportar salas de clases completas conectadas al mismo tiempo desde funciones serverless de Vercel, `src/server/db.ts` utiliza el **Transaction Pooler (Supavisor, puerto 6543)** con `prepare: false` y `max: 3` conexiones.

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

### Despliegue manual y conexión automática a GitHub

Este directorio ya está vinculado al proyecto Vercel `rompe-el-algoritmo-maipu` mediante `.vercel/project.json`. El proyecto no tiene conexión GitHub. Para automatizar, abrir **Vercel → Settings → Git → Connect Git Repository**; la persona dueña o administradora del repo debe autorizar la integración. Sin esa autorización, publicar desde esta copia local:

```bash
bun run build
bunx vercel --prod
```

El proyecto ya tiene variables protegidas `DATABASE_URL` y `ADMIN_KEY` en Vercel Production. No imprimir sus valores ni escribirlos en el código o en variables `VITE_*`; la conexión debe quedar disponible solo en la API servidor.

Se puede traer una copia local de variables a un archivo que Git ignora:

```bash
bunx vercel env pull .env.local
```

Para una vista previa sin mover el alias de producción:

```bash
bunx vercel
```

Publicar producción solo después de revisar el cambio, el proyecto destino, la base, la retención/borrado y la configuración de seguridad:

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

> Lee `docs/base-de-datos-y-vercel.md` completo y revisa el estado de Git y la estructura actual antes de editar. El juego recomienda la práctica sin guardado para el aula; el modo opcional de retomar usa un código por curso, alias inventados y contraseña tras el nivel 1. El sitio ya está desplegado manualmente en Vercel; el proyecto no está conectado a GitHub y tiene variables protegidas `DATABASE_URL` y `ADMIN_KEY`. Verifica conexión/esquema y flujos con datos ficticios; completa purga y respaldos antes de guardar progreso real. No agregues códigos individuales ni campos de identidad real. No escribas secretos en archivos versionados ni cambies datos remotos o publiques producción sin mostrar antes el comando, el proyecto y su efecto.

## Siguiente decisión: asociar el progreso con evaluación

El flujo de dos modos y la cuenta posterior al nivel 1 ya están implementados para Bun/SQLite local. Antes de usarlo para evaluar formalmente:

- Acordar si el docente relacionará alias con estudiantes en una tabla privada externa, aprobada por el establecimiento.
- No añadir nombre, iniciales, RUT o correo al formulario sin revisar finalidad, acceso, aviso, base legal, retención y borrado con el establecimiento.
- Acordar qué puede ver/exportar cada docente, cómo corregir una asociación y cómo borrar una cuenta o curso.
- Migrar la base a PostgreSQL antes del despliegue con persistencia en Vercel; SQLite local no mantiene datos entre despliegues.
