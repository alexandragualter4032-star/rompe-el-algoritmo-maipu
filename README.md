# Rompe el Algoritmo Maipú

Juego educativo de música y pensamiento crítico. Sus 12 niveles presentan proyectos musicales liderados por mujeres; cada nivel combina cuestionario, retroalimentación, material audiovisual y minijuego de ritmo.

**Estado:** prototipo funcional en desarrollo. [Abrir demo pública en GitHub Pages](https://alexandragualter4032-star.github.io/rompe-el-algoritmo-maipu/). La aplicación completa con progreso se ejecuta localmente con Bun.

## Funcionalidades

- Interfaz en React y Vite.
- Doce niveles, cinco preguntas por nivel y progresión de campaña.
- Imágenes de artistas y portadas de los doce niveles. La ruta oculta cada portada hasta descubrir a la artista.
- Reproductores incrustados de YouTube para canciones, discos o playlists. El navegador puede impedir autoplay.
- Minijuego de ritmo con controles de teclado y pantalla táctil. Sus notas aún no están sincronizadas con BPM ni con las grabaciones.
- Modo de prueba, sin guardar avance.
- Panel docente: códigos de acceso individuales, seguimiento, exportación CSV, cierre de sesión, reinicio y depuración de niveles.
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

En el primer inicio, el servidor genera `data/admin.key`. Inicia sesión en **Docente / administración** usando esa clave. Guárdala fuera del repositorio. La base `data/game.sqlite` contiene códigos y avances; ambos archivos están ignorados por Git.

El panel crea códigos de estudiante y los muestra una sola vez para descargar. La base guarda hashes de los códigos. Cada estudiante puede retomar desde la pregunta pendiente o reiniciar la fase de ritmo. Las sesiones docentes duran ocho horas y las estudiantiles hasta siete días. Los códigos tienen vencimiento configurable y se pueden revocar.

No hace falta pedir nombres reales. El progreso es para retroalimentación: el servidor valida formato y sesión, pero el navegador envía el puntaje, así que no sirve como nota formal ni como ranking resistente a manipulación.

Variables disponibles:

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `PORT` | Puerto HTTP de Bun | `5173` |
| `HOST` | Interfaz de red | `127.0.0.1` |
| `DATA_DIR` | Carpeta persistente para SQLite y clave docente | `./data` |
| `ADMIN_KEY` | Clave docente opcional, para entornos administrados | Generada en `data/admin.key` |

No guardes secretos, base de datos, códigos descargados ni datos de estudiantes en Git.

## Medios

Los archivos de imagen están en `public/images/`; las rutas y enlaces de reproducción viven en `src/data/artists.js`. El inventario está en [docs/medios.md](docs/medios.md). Los doce niveles cuentan con foto y portada. Los videos se reproducen desde YouTube: el proyecto no contiene copias de canciones. Las portadas pueden representar un disco distinto de la canción que acompaña el nivel; esos casos están identificados en la guía de medios.

El mapa del menú marca Maipú, Santiago y Viña del Mar cuando ese origen se indica en los datos. El contorno proviene de Natural Earth, en dominio público. La base del mapa es esquemática; no representa comunas ni direcciones exactas.

## Decisiones pedagógicas

La revisión basada en el capítulo de Richard E. Mayer y en práctica de recuperación está en [docs/aprendizaje-multimedia.md](docs/aprendizaje-multimedia.md). Los principios considerados incluyen segmentación, señalización, contigüidad y limitar elementos que distraigan. La efectividad pedagógica todavía requiere prueba con estudiantes y revisión de datos biográficos.

## Despliegue y pendientes

### Demo estática en GitHub Pages

El workflow `.github/workflows/pages.yml` compila y publica automáticamente cada cambio en `main`. Esta demo no ejecuta Bun ni una API: inicio de sesión, administración y guardado de progreso están desactivados. Para usar el juego con códigos y progreso se necesita alojar la API y una base persistente; consulta la sección de Vercel.

### Sitio completo en Vercel

El proyecto actual no se puede publicar completo en Vercel con solo apuntar el repositorio: la aplicación espera el servidor HTTP `server.ts` y una base SQLite en disco. Las funciones de Vercel usan un sistema de archivos de solo lectura, con `/tmp` temporal; no es almacenamiento persistente. Vercel ofrece runtime Bun en beta, pero la arquitectura todavía debe adaptarse a funciones serverless.

Pendientes para el despliegue completo:

1. Migrar la API a funciones de Vercel y configurar el runtime elegido.
2. Migrar datos y consultas de SQLite a una base administrada persistente, por ejemplo Postgres mediante Neon o Supabase.
3. Crear migraciones del esquema, conexión con pooling y variables de entorno para credenciales.
4. Revisar autenticación docente, limitación de intentos, cookies `Secure`, sesiones, CORS/CSRF y límites de solicitudes detrás de proxy.
5. Definir respaldos, retención y eliminación de códigos/progresos; probar recuperación.
6. Revisar privacidad: el juego apunta a cursos escolares, así que publicar solo los datos mínimos y evitar nombres de estudiantes.
7. Confirmar autorización/licencias de fotos, portadas y música antes de difundir el sitio. Los archivos de imagen entregados se incorporan como medios del proyecto; GitHub Pages y este repositorio son públicos.
8. Elegir dominio, región del servidor/base de datos, HTTPS y política de costos.
9. Completar accesibilidad con teclado/lector de pantalla y probar móvil, navegadores y autoplay.
10. Sincronizar patrones del minijuego con una canción, su BPM y el desplazamiento del primer pulso; BPM por sí solo no define las notas.
11. Añadir integración continua para instalación reproducible, compilación y pruebas en cada pull request.
12. Revisar hechos, claves de respuestas y contenido educativo antes de usar puntajes formalmente.

Vercel admite despliegue de sitios y funciones, y puede conectarse a Postgres mediante proveedores del Marketplace. Vercel Postgres ya no se ofrece como servicio nuevo. Consulta [runtime Bun](https://vercel.com/docs/functions/runtimes/bun), [almacenamiento del sistema de archivos de las funciones](https://vercel.com/docs/functions/runtimes) y [Postgres en Marketplace](https://vercel.com/docs/marketplace-storage).

## Estructura

```text
src/react/       Componentes y pantallas React
src/components/  Motor de fases y minijuegos
src/data/        Artistas, preguntas, hechos y mapa
src/server/      API, autenticación y base SQLite
public/images/   Fotos y portadas
public/music/    Carpeta opcional de audio local
docs/            Medios y revisión pedagógica
tests/           Pruebas API y de flujo
```

## Privacidad y seguridad

El sitio no solicita identidad real; el docente crea códigos pseudónimos. El servidor guarda hash de códigos de estudiante, hash de tokens de sesión y progreso. Los códigos descargados son secretos del curso. La versión local escucha solo en la interfaz loopback por defecto. Antes de abrir acceso remoto, configurar HTTPS, almacenamiento persistente, secretos de despliegue y límites adecuados.

Para reportar una vulnerabilidad, no incluyas claves ni datos de estudiantes en issues públicos. Contacta al responsable del repositorio por un canal privado.

## Contribuir

1. Crea una rama para el cambio.
2. Instala dependencias con `bun install`.
3. Ejecuta `bun run build` y `bun run test`.
4. Abre un pull request describiendo el cambio y cómo verificarlo.

## Licencias y atribución

El repositorio no declara todavía una licencia de código. Las fotos y portadas tienen derechos que dependen de sus autores/titulares; su presencia en el repositorio no implica autorización para reutilización o redistribución. Aclarar permisos antes de publicación pública o uso fuera del curso. Los reproductores de YouTube enlazan contenido alojado por sus titulares.
