import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = new Set(['/preview.html', '/tests/preview.js', '/extension/core.js', '/extension/palette.js']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = path === '/' ? '/preview.html' : path;
  if (!files.has(file)) { response.writeHead(404); response.end(); return; }
  try {
    const contents = await readFile(resolve(root, file === '/preview.html' ? 'tests/preview.html' : `.${file}`));
    response.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
    response.end(contents);
  } catch { response.writeHead(500); response.end('Aperçu indisponible'); }
}).listen(4173, '127.0.0.1', () => console.log('Aperçu avec données fictives : http://127.0.0.1:4173/preview.html'));
