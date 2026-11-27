# Rompe el Algoritmo Maipú

Juego educativo de música y pensamiento crítico. Sus 12 niveles presentan proyectos musicales liderados por mujeres; cada nivel combina cuestionario, retroalimentación, material audiovisual y minijuego de ritmo.

**Estado:** prototipo funcional en desarrollo. El workflow de Pages está preparado; falta que una persona administradora habilite GitHub Actions como fuente de publicación. La aplicación completa con progreso se ejecuta localmente con Bun.

## Funcionalidades

- Interfaz en React y Vite.
- Doce niveles, cinco preguntas por nivel y progresión de campaña.
- Imágenes de artistas y portadas de los doce niveles. La ruta oculta cada portada hasta descubrir a la artista.
- Reproductores incrustados de YouTube para canciones, discos o playlists. El navegador puede impedir autoplay.
- Minijuego de ritmo con controles de teclado y pantalla táctil. Sus notas aún no están sincronizadas con BPM ni con las grabaciones.
- Modo de prueba, sin guardar avance.
- Panel docente: creación de cursos, códigos de invitación, seguimiento, exportación CSV, renovación de contraseñas y depuración de niveles.
- Persistencia actual mediante Bun y SQLite local.
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

El menú ofrece **Jugar sin guardar** o **Guardar para retomar**. Para guardar, el docente entrega un código de curso; el estudiante usa un alias inventado y completa el nivel 1. Al terminar, la aplicación crea su cuenta, guarda ese avance y muestra una contraseña aleatoria una sola vez. Debe anotarla. El docente puede generar otra contraseña si se pierde; la anterior deja de funcionar. Las cuentas pueden retomar desde su último avance. Las sesiones docentes duran ocho horas y las estudiantiles hasta siete días.

No ingresar nombres reales, apellidos, iniciales, RUT, correo ni números de lista como alias. La cuenta queda asociada a un pseudónimo y al curso, por lo que el progreso es seudónimo. El código de curso permite inscribirse y debe compartirse solo con esa clase.

La purga automática al vencer la fecha de borrado y la migración a PostgreSQL para Vercel aún están pendientes. En local, los datos se guardan en SQLite dentro de `data/game.sqlite`.

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
| **Una invitación por curso; alias y contraseña individual después del nivel 1** | **TK + PK (Gestión de aula):** El docente comparte un único código con toda la clase. El estudiante crea su alias y recibe contraseña solo después del primer nivel, reduciendo el reparto de credenciales individuales. | **Reducción de carga cognitiva extrínseca:** El inicio del juego no requiere correo ni contraseña; la credencial aparece después de una primera meta breve. | **Minimización de datos y protección de NNA:** No pedir nombre, apellido, iniciales, RUT, correo o número de lista. Los alias siguen siendo pseudónimos y no deben contener datos personales. |
| **Separación por cursos y elección explícita: *Jugar sin guardar* vs *Guardar para retomar*** | **PK + CK (Flexibilidad didáctica):** Permite usar la aplicación en una sesión sin registro o en varias sesiones con cuentas pseudónimas. | **Segmentación y ritmo propio:** El progreso por nivel, fase y pregunta pendiente permite continuar otro día. | **Finalidad y transparencia:** El modo sin guardado no registra avance. El modo con cuenta muestra fechas de expiración y eliminación. |
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

Vercel es el destino previsto. El proyecto actual aún necesita adaptar la API y cambiar SQLite local por PostgreSQL persistente antes de activar el progreso en línea. Las funciones de Vercel tienen sistema de archivos de solo lectura, con `/tmp` temporal, así que ese disco no sirve para guardar progreso.

La hoja de ruta detallada de base de datos, modo de guardado por curso y publicación está en [docs/base-de-datos-y-vercel.md](docs/base-de-datos-y-vercel.md).

Pendientes para el despliegue completo:

1. Migrar la API a funciones de Vercel y configurar el runtime elegido.
2. Migrar datos y consultas de SQLite a una base administrada persistente, por ejemplo Postgres mediante Neon o Supabase.
3. Crear migraciones del esquema, conexión con pooling y variables de entorno para credenciales.
4. Revisar autenticación docente, limitación de intentos, cookies `Secure`, sesiones, CORS/CSRF y límites de solicitudes detrás de proxy.
5. Definir respaldos, retención y eliminación de cuentas/progresos; probar recuperación.
6. Revisar privacidad: el juego apunta a cursos escolares, así que publicar solo los datos mínimos y evitar nombres de estudiantes.
7. Confirmar autorización/licencias de fotos, portadas y música antes de difundir el sitio. Los archivos de imagen entregados se incorporan como medios del proyecto; el repositorio es público.
8. Elegir dominio, región del servidor/base de datos, HTTPS y política de costos.
9. Completar accesibilidad con teclado/lector de pantalla y probar móvil, navegadores y autoplay.
10. Sincronizar patrones del minijuego con una canción, su BPM y el desplazamiento del primer pulso; BPM por sí solo no define las notas.
11. Revisar la declaración de sitio dirigido a menores para los reproductores de YouTube; la ayuda oficial indica que los sitios o apps infantiles que insertan contenido deben identificarse como tales: [YouTube Help](https://support.google.com/youtube/answer/171780).
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

El sitio no solicita identidad real. El docente comparte un código por curso; cada estudiante crea un alias inventado y una contraseña aleatoria después del nivel 1. El servidor guarda el hash de la contraseña, el token de sesión en hash y el progreso pseudónimo. El código de curso es un secreto compartido y debe entregarse solo a esa clase. La versión local escucha en la interfaz loopback por defecto; antes de abrir acceso remoto se necesita HTTPS, almacenamiento persistente, secretos de despliegue y límites adecuados.

Para reportar una vulnerabilidad, no incluyas claves ni datos de estudiantes en issues públicos. Contacta al responsable del repositorio por un canal privado.

## Contribuir

1. Crea una rama para el cambio.
2. Instala dependencias con `bun install`.
3. Ejecuta `bun run build` y `bun run test`.
4. Abre un pull request describiendo el cambio y cómo verificarlo.

## Licencias y atribución

El repositorio no declara todavía una licencia de código. Las fotos y portadas tienen derechos que dependen de sus autores/titulares; su presencia en el repositorio no implica autorización para reutilización o redistribución. Aclarar permisos antes de publicación pública o uso fuera del curso. Los reproductores de YouTube enlazan contenido alojado por sus titulares.
