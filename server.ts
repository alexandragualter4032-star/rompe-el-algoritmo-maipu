import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { handleApi } from './src/server/api.ts';

const root = import.meta.dir;
const port = Number(Bun.env.PORT ?? 5173);
const dist = resolve(root, 'dist');

Bun.serve({
  hostname: Bun.env.HOST ?? '127.0.0.1',
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (pathname === '/') pathname = '/index.html';
    if (pathname.endsWith('/')) {
      return new Response('Not Found', { status: 404 });
    }

    const built = existsSync(resolve(dist, 'index.html'));
    const base = built ? dist : root;
    const filePath = resolve(base, `.${pathname}`);
    const relativePath = relative(base, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return new Response('Not Found', { status: 404 });
    }
    const allowed = built
      ? relativePath === 'index.html' || relativePath.startsWith(`assets${sep}`) ||
        relativePath.startsWith(`images${sep}`) || relativePath.startsWith(`music${sep}`)
      : relativePath === 'index.html' || relativePath === 'jugar.html' ||
        relativePath.startsWith(`src${sep}`) || relativePath.startsWith(`public${sep}`);
    if (!allowed) {
      return new Response('Not Found', { status: 404 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(request.method === 'HEAD' ? null : file, {
      headers: { 'Content-Type': file.type },
    });
  },
});

console.log(`Juego disponible en http://localhost:${port}/`);
