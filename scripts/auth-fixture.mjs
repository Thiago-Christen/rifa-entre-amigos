// Servidor isolado de verificação do fluxo de login. Nenhuma conexão ao Supabase.
// Execute node scripts/auth-fixture.mjs e abra http://127.0.0.1:4176.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../public/',import.meta.url));
const token = 'fixture-organizer-token';
const now = Date.now();
const bookings = [
  {id:'fixture-pending',name:'Participante de teste',phone:'41999990000',numbers:[1,2],status:'pending',created_at:new Date(now).toISOString(),expires_at:new Date(now+86400000).toISOString()},
  {id:'fixture-paid',name:'Pagamento de teste',phone:'41999990001',numbers:[3],status:'paid',created_at:new Date(now-1000).toISOString(),expires_at:new Date(now+86400000).toISOString()},
  {id:'fixture-expired',name:'Reserva expirada de teste',phone:'41999990002',numbers:[4],status:'pending',created_at:new Date(now-172800000).toISOString(),expires_at:new Date(now-86400000).toISOString()},
];
let revoked = false;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server = createServer(async(req,res) => {
  const url = new URL(req.url,'http://127.0.0.1:4176');
  const json = (value,status=200) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try {
    if (url.pathname === '/config.js') {
      const config = {title:'Rifa entre amigos',prize:'Cesta com 11 itens',description:'Escolha seus números e participe. Cada número é uma nova chance!',draw:'Data e regras do sorteio a definir pelo organizador.',pixKey:'TESTE — NÃO PAGAR',pixRecipient:'',supabaseUrl:'http://127.0.0.1:4176/mock',supabasePublicKey:'fixture-public-key',reservationsEnabled:true,adminSignupEnabled:false};
      res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});res.end('window.RIFA_CONFIG='+JSON.stringify(config));return;
    }
    if (url.pathname.startsWith('/mock/')) {
      let raw = '';for await(const chunk of req) raw+=chunk;
      const body = raw ? JSON.parse(raw) : {};
      const allowed = req.headers.authorization === 'Bearer '+token && !revoked;
      if (url.pathname.endsWith('/get_numbers')) return json(Array.from({length:100},(_,i) => {
        const b = bookings.find(b=>b.numbers.includes(i+1)&&(b.status==='paid'||(b.status==='pending'&&Date.parse(b.expires_at)>Date.now())));
        return {number:i+1,status:b?(b.status==='paid'?'paid':'reserved'):'available'};
      }));
      if (url.pathname.endsWith('/auth/v1/token')) {
        revoked = false;
        const organizer = body.email === 'organizador@example.test' || body.refresh_token === 'fixture-refresh';
        return json({access_token:organizer?token:'fixture-client-token',refresh_token:organizer?'fixture-refresh':'fixture-client-refresh',expires_at:Math.floor(Date.now()/1000)+3600});
      }
      if (url.pathname.endsWith('/is_admin')) return json(allowed);
      if (url.pathname.endsWith('/auth/v1/user')) return allowed ? json({id:'fixture-organizer',email:'organizador@example.test'}) : json({message:'Acesso inválido.'},401);
      if (url.pathname.endsWith('/auth/v1/logout')) {revoked=true;return json({});}
      if (!allowed) return json({message:'Acesso restrito ao organizador.'},403);
      if (url.pathname.endsWith('/reservations')) return json(bookings);
      if (url.pathname.endsWith('/admin_update_reservation')) {
        const b = bookings.find(b=>b.id===body.p_id);if (!b||b.status!=='pending'||Date.parse(b.expires_at)<=Date.now())return json({message:'Reserva indisponível.'},400);
        b.status=body.p_status;return json(null);
      }
      return json({message:'Operação não disponível no teste.'},400);
    }
    const path = resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep))return json({},403);
    const data = await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{json({message:'Arquivo não encontrado.'},404);}
});
server.listen(4176,'127.0.0.1',()=>console.log('Teste isolado: http://127.0.0.1:4176 — login organizador@example.test / qualquer senha fictícia.'));
