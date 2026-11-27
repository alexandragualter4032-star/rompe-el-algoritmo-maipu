# Rompe el Algoritmo Maipú

Juego educativo de música y pensamiento crítico. Sus 12 niveles presentan proyectos musicales liderados por mujeres; cada nivel combina cuestionario, retroalimentación, material audiovisual y minijuego de ritmo.

**Estado:** prototipo funcional en desarrollo. Hay una versión pública de revisión en Vercel y ejecución local con Bun. El proyecto de Vercel no está conectado a GitHub; los despliegues son manuales. La validación del guardado y la política de retención siguen pendientes.

## Funcionalidades

- Interfaz en React y Vite.
- Doce niveles, cinco preguntas por nivel y progresión de campaña.
- Imágenes de artistas y portadas de los doce niveles. La ruta oculta cada portada hasta descubrir a la artista.
- Reproductores incrustados de YouTube para canciones, discos o playlists; repiten el video o la playlist al terminar. El navegador puede impedir autoplay.
- Minijuego de ritmo con controles de teclado y pantalla táctil. Sus notas aún no están sincronizadas con BPM ni con las grabaciones.
- Modo de prueba, sin guardar avance.
- Panel docente: gestión opcional de cursos y progreso, exportación CSV, depuración y borrado de cuentas individuales o de todos los estudiantes con confirmación.
- Bun y SQLite para uso local; el despliegue Vercel usa la API serverless y tiene configurada una conexión PostgreSQL mediante variables protegidas.
- Diseño adaptable y soporte para `prefers-reduced-motion`.

## Requisitos

- [Bun](https://bun.sh/) 1.x.
- Git.

## Inicio local

```bash
bun install
bun run build
bun run serve
```

Abre `http://localhost:5173/`. Bun escucha en `127.0.0.1` por defecto. El servicio local `rompe-el-algoritmo-bun.service` se usa en el equipo de desarrollo.

Para desarrollo con recarga automática, inicia el servidor/API y Vite en terminales separadas:

```bash
PORT=5174 bun run serve
bun run dev
```

Vite usa `http://localhost:5175/` y envía las llamadas `/api` al servidor configurado en `vite.config.js`.

## Comandos

| Comando | Uso |
| --- | --- |
| `bun run dev` | Desarrollo con Vite |
| `bun run build` | Crear versión compilada en `dist/` |
| `bun run serve` | Servir compilado y API con Bun |
| `bun run preview` | Previsualizar compilación de Vite |
| `bun run test` | Ejecutar pruebas con Bun |

## Acceso docente y progreso

En el primer inicio, el servidor genera `data/admin.key`. Inicia sesión en **Docente / administración** usando esa clave. Guárdala fuera del repositorio. La base `data/game.sqlite` contiene cuentas y avances; ambos archivos están ignorados por Git.

### Uso recomendado en una clase

La dinámica principal es **Jugar sin guardar**, similar a una actividad de Kahoot: el curso entra y juega sin crear cuentas ni repartir códigos. No se registra el avance en el servidor y se pierde al cerrar o recargar la página. Así se reduce el tiempo de organización dentro de la clase y no se recopilan datos de estudiantes.

El prototipo todavía incluye **Guardar para retomar** como opción técnica para sesiones en varios días. Ese flujo requiere que el docente active el guardado y comparta un código de curso; cada estudiante crea un alias inventado y, tras completar el nivel 1, recibe una contraseña aleatoria. La cuenta permite retomar el avance. Por el tiempo que requiere gestionar códigos y contraseñas, esta opción no forma parte de la dinámica recomendada para el curso. Las sesiones docentes duran ocho horas y las estudiantiles hasta siete días.

Si se prueba el modo opcional con guardado, no ingresar nombres reales, apellidos, iniciales, RUT, correo ni números de lista como alias. La cuenta queda asociada a un pseudónimo y al curso, por lo que el progreso es seudónimo, no anónimo. Los códigos de curso son parte de ese flujo opcional y deben compartirse solo con la clase correspondiente.

La purga automática y la verificación de esquema, respaldo y retención de la base de Vercel aún están pendientes. En local, los datos se guardan en SQLite dentro de `data/game.sqlite`.

No hace falta pedir nombres reales. El progreso es para retroalimentación: el servidor valida formato y sesión, pero el navegador envía el puntaje, así que no sirve como nota formal ni como ranking resistente a manipulación.

Variables disponibles:

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `PORT` | Puerto HTTP de Bun | `5173` |
| `HOST` | Interfaz de red | `127.0.0.1` |
| `DATA_DIR` | Carpeta persistente para SQLite y clave docente | `./data` |
| `ADMIN_KEY` | Clave docente opcional, para entornos administrados | Generada en `data/admin.key` |

No guardes secretos, base de datos, códigos de invitación ni datos de estudiantes en Git.

## Medios

Los archivos de imagen están en `public/images/`; las rutas y enlaces de reproducción viven en `src/data/artists.js`. El inventario está en [docs/medios.md](docs/medios.md). Los doce niveles cuentan con foto y portada. Los videos se reproducen desde YouTube: el proyecto no contiene copias de canciones. Las portadas pueden representar un disco distinto de la canción que acompaña el nivel; esos casos están identificados en la guía de medios.

Cada nivel muestra el mapa en la ficha de la artista. Para localidades en Chile aparece el mapa del país; si hay un lugar de origen o trayectoria fuera de Chile, aparece un mapamundi. Las marcas son aproximadas y no representan domicilios.

## Decisiones pedagógicas, TPACK, escalabilidad y respaldo legal

La revisión basada en el capítulo de Richard E. Mayer y en práctica de recuperación está en [docs/aprendizaje-multimedia.md](docs/aprendizaje-multimedia.md). Los principios considerados incluyen segmentación, señalización, contigüidad y limitar elementos que distraigan. La efectividad pedagógica todavía requiere prueba con estudiantes y revisión de datos biográficos.

### Matriz de justificación de arquitectura (TPACK + Aprendizaje Multimedia + Ley 21.719 / Ley 21.855)

| Decisión de diseño y base de datos | Justificación TPACK (Tecnología, Pedagogía y Contenido) | Aprendizaje Multimedia (Mayer, 2002) y Práctica de Recuperación (Karpicke & Roediger, 2008) | Marco Legal Chileno (Ley 21.719 y Ley 21.855 sobre protección de NNA) |
| --- | --- | --- | --- |
| **Modo principal: *Jugar sin guardar*** | **TK + PK (Gestión de aula):** El curso comienza sin repartir códigos ni administrar cuentas, ahorrando tiempo para la actividad musical. | **Reducción de carga cognitiva extrínseca:** El inicio no requiere recordar credenciales ni completar registro antes de jugar. | **Minimización de datos y protección de NNA:** La práctica no crea cuentas ni conserva avance en el servidor. |
| **Opción técnica: *Guardar para retomar*** | **PK + CK (Flexibilidad didáctica):** Permite explorar continuidad entre sesiones si el docente decide que el beneficio compensa la gestión adicional. | **Segmentación y ritmo propio:** El progreso por nivel, fase y pregunta pendiente permite continuar otro día. | **Finalidad y transparencia:** Requiere código de curso, alias y contraseña; el avance es seudónimo y debe tener vencimiento y eliminación definidos. No es el flujo recomendado para el uso habitual en aula. |
| **Fechas separadas de vencimiento (`expires_at`) y borrado definitivo (`delete_at`)** | **PK (Evaluación formativa):** Al cerrar el acceso, el docente conserva una ventana acotada para exportar el CSV de avance antes de la eliminación definitiva. | **Práctica de Recuperación Espaciada:** Facilita planificar sesiones de recuperación dentro de un periodo acotado y observar en qué niveles o preguntas hubo mayor dificultad. | **Limitación del plazo de conservación y derecho de supresión:** Al cumplirse `delete_at` (o cuando el docente elimina el curso o desactiva el guardado), `ON DELETE CASCADE` borra curso, cuentas, sesiones y progreso. |
| **Alias únicos y etiquetas secuenciales de seguimiento** | **TPK:** El panel muestra alias y avance; la relación con identidad escolar, si se necesita, queda bajo responsabilidad del establecimiento y fuera de la app. | **Señalización consistente:** Mantiene un registro comprensible sin pedir datos reales antes de comenzar. | **Pseudonimización y minimización:** Las cuentas guardan alias, contraseña en hash y progreso; no son anónimas si el alias se vincula con una persona. |

### Estimación de escalabilidad en Supabase (Plan Gratuito de 500 MB)

- **Tamaño por estudiante:** `student_codes` (~300 B) + `progress` JSONB acotado (~600 B) + `sessions` (~250 B) + índices ≈ **1,2 KB a 1,5 KB por estudiante**.
- **Tamaño por curso promedio (40 estudiantes):** **~50 KB a 60 KB** por curso completo.
- **Capacidad total en 500 MB (dejando ~50 MB de margen para catálogos e índices del motor PostgreSQL):**
  - Hasta **~7.500 cursos simultáneos** (aproximadamente **300.000 estudiantes**).
  - Con la purga automática por `delete_at` al finalizar cada semestre o unidad, el espacio se libera y reutiliza de forma continua.
- **Concurrencia en sala de enlaces (Vercel Functions + Supabase Transaction Pooler):**
  - El cliente PostgreSQL (`src/server/db.ts`) está configurado con `prepare: false` y `max: 3` conexiones para operar con el **Transaction Pooler (Supavisor, puerto 6543)** de Supabase. Como el navegador solo envía una petición `PUT /api/progress` al avanzar de pregunta o completar una fase, múltiples cursos de 40 estudiantes jugando en paralelo requieren menos de 5 conexiones activas simultáneas en la base de datos.

## Despliegue y pendientes

### Despliegue en Vercel

El sitio ya tiene una publicación de producción para revisión: [rompe-el-algoritmo-maipu-sndmp.vercel.app](https://rompe-el-algoritmo-maipu-sndmp.vercel.app). Usa `api/index.ts` como función serverless y las variables protegidas `DATABASE_URL` y `ADMIN_KEY`. El proyecto no tiene un repositorio Git conectado (`repository: null`), por lo que un `git push` no publica cambios en Vercel; el despliegue se hace manualmente desde la raíz con `vercel --prod`.

La base y el flujo de guardado requieren validación con datos ficticios antes de usarlos con estudiantes. Las funciones de Vercel tienen sistema de archivos de solo lectura, con `/tmp` temporal, así que ese disco no sirve para guardar progreso.

La hoja de ruta detallada de base de datos, modo de guardado por curso y publicación está en [docs/base-de-datos-y-vercel.md](docs/base-de-datos-y-vercel.md).

Pendientes antes de automatizar el despliegue y usar el modo con progreso en una clase:

1. Conectar GitHub en Vercel → Settings → Git. La persona dueña o administradora del repositorio debe autorizar el acceso; si no, continuar con publicación manual.
2. Verificar conexión, migraciones, cuentas y guardado en PostgreSQL usando datos ficticios.
3. Implementar purga automática, respaldos y una restauración comprobable; definir retención con el establecimiento.
4. Revisar autenticación docente, limitación de intentos en funciones serverless, cookies `Secure`, sesiones, CORS/CSRF y límites de solicitudes detrás de proxy.
5. Revisar privacidad: el juego apunta a cursos escolares; evitar nombres de estudiantes y obtener revisión del establecimiento antes de guardar progreso real.
6. Confirmar autorización/licencias de fotos, portadas y música antes de difundir el sitio. Los archivos de imagen entregados se incorporan como medios del proyecto; el repositorio es público.
7. Elegir dominio, región del servidor/base de datos, HTTPS y política de costos.
8. Completar accesibilidad con teclado/lector de pantalla y probar móvil, navegadores y autoplay.
9. Sincronizar patrones del minijuego con una canción, su BPM y el desplazamiento del primer pulso; BPM por sí solo no define las notas.
10. Revisar la declaración de sitio dirigido a menores para los reproductores de YouTube; la ayuda oficial indica que los sitios o apps infantiles que insertan contenido deben identificarse como tales: [YouTube Help](https://support.google.com/youtube/answer/171780).
11. Añadir integración continua para instalación reproducible, compilación y pruebas en cada pull request.
12. Revisar hechos, claves de respuestas y contenido educativo antes de usar puntajes formalmente.

Vercel admite despliegue de sitios y funciones, y puede conectarse a Postgres mediante proveedores del Marketplace. Vercel Postgres ya no se ofrece como servicio nuevo. Consulta [runtime Bun](https://vercel.com/docs/functions/runtimes/bun), [almacenamiento del sistema de archivos de las funciones](https://vercel.com/docs/functions/runtimes) y [Postgres en Marketplace](https://vercel.com/docs/marketplace-storage).

## Estructura

```text
src/react/       Componentes y pantallas React
src/components/  Motor de fases y minijuegos
src/data/        Artistas, preguntas, hechos y mapas
src/server/      API, autenticación y base SQLite
public/images/   Fotos y portadas
public/music/    Carpeta opcional de audio local
docs/            Medios, pedagogía y ruta de datos/Vercel
tests/           Pruebas API y de flujo
```

## Privacidad y seguridad

En el modo recomendado para aula no se pide identidad, no se usan códigos y no se guarda progreso en el servidor. El modo opcional para retomar sí usa código de curso, alias inventado y contraseña; guarda hashes de contraseñas y sesiones junto con progreso pseudónimo. Antes de activar ese modo en un despliegue público se deben definir almacenamiento persistente, plazos de conservación, eliminación y controles de acceso. La versión local escucha en la interfaz loopback por defecto.

Para reportar una vulnerabilidad, no incluyas claves ni datos de estudiantes en issues públicos. Contacta al responsable del repositorio por un canal privado.

## Contribuir

1. Crea una rama para el cambio.
2. Instala dependencias con `bun install`.
3. Ejecuta `bun run build` y `bun run test`.
4. Abre un pull request describiendo el cambio y cómo verificarlo.

## Licencias y atribución

El repositorio no declara todavía una licencia de código. Las fotos y portadas tienen derechos que dependen de sus autores/titulares; su presencia en el repositorio no implica autorización para reutilización o redistribución. Aclarar permisos antes de publicación pública o uso fuera del curso. Los reproductores de YouTube enlazan contenido alojado por sus titulares.
