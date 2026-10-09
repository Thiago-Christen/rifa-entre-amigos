import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };
export const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    // Demonstração isolada somente no servidor local; nunca publicada no Pages.
    if (process.env.RIFA_DEMO === '1' && pathname === '/config.js') {
      res.writeHead(200, {'Content-Type':mime['.js'],'Cache-Control':'no-store'});
      res.end("window.RIFA_CONFIG={title:'Rifa entre amigos',prize:'Cesta com 11 itens',description:'Escolha seus números e participe. Cada número é uma nova chance!',draw:'Data e regras do sorteio a definir pelo organizador.',pixKey:'',pixRecipient:'',supabaseUrl:'',supabasePublicKey:''};");
      return;
    }
    const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root.endsWith(sep) ? root : root+sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(target); res.writeHead(200, { 'Content-Type':mime[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(body);
  } catch { res.writeHead(404).end('Arquivo não encontrado'); }
});
server.listen(Number(process.env.RIFA_PORT || 4173),'127.0.0.1', () => console.log(`Rifa disponível em http://127.0.0.1:${server.address().port}`));
