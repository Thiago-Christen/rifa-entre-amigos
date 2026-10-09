const config = window.RIFA_CONFIG;
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const fmt = n => String(n).padStart(2, '0');
const demo = !config.supabaseUrl || !config.supabasePublicKey;
function remembered(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function remember(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* Reserva continua disponível no banco quando armazenamento local é bloqueado. */ } }
let buyerAuth = remembered('rifa-buyer-session');
let session = buyerAuth, admin = false, loading = false, rows = [], selected = new Set();
let toastTimer, lastReceipt = null;
const DEMO_KEY = 'rifa-demo-v1';
function notice(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function demoRead() { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { throw new Error('Não foi possível ler as reservas de demonstração neste navegador.'); } }
function active(b) { return b.status === 'paid' || (b.status === 'pending' && new Date(b.expires_at) > new Date()); }
async function request(path, body, method = 'POST') {
  const headers = { apikey:config.supabasePublicKey, 'Content-Type':'application/json' };
  if (session?.access_token && path !== '/rest/v1/rpc/get_numbers') headers.Authorization = `Bearer ${session.access_token}`;
  else if (config.supabasePublicKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.supabasePublicKey}`;
  const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/rest/')) { session = admin ? null : buyerAuth; admin = false; }
    throw new Error(data?.message || data?.msg || data?.error_description || 'Não foi possível conectar. Tente novamente.');
  }
  return data;
}
const rpc = (name, args = {}) => request(`/rest/v1/rpc/${name}`, args);
async function buyerSession() {
  if (session && (!session.expires_at || session.expires_at * 1000 > Date.now() + 30000)) return;
  if (session?.refresh_token) {
    try { session = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }); if (!admin) { buyerAuth = session; remember('rifa-buyer-session',session); } return; } catch { if (admin) { admin = false; session = buyerAuth; throw new Error('Seu acesso expirou. Entre novamente no painel.'); } session = null; }
  }
  session = await request('/auth/v1/signup', {});
  if (!session?.access_token) throw new Error('O organizador precisa ativar o acesso anônimo no Supabase.');
  buyerAuth = session; remember('rifa-buyer-session',session);
}
function render() {
  const available = rows.filter(r => r.status === 'available').length;
  const paid = rows.filter(r => r.status === 'paid').length;
  $('availability').textContent = `${available} de 100 números disponíveis`;
  $('paid-count').textContent = `${paid} pagos`;
  $('progress-fill').style.width = `${100 - available}%`;
  $('numbers').replaceChildren(...rows.map(row => {
    const button = document.createElement('button');
    const state = selected.has(row.number) ? 'selected' : row.status;
    button.className = `number ${state}`; button.textContent = fmt(row.number);
    button.dataset.number = row.number; button.disabled = row.status !== 'available' || loading;
    button.setAttribute('aria-label', `Número ${fmt(row.number)}, ${ { available: 'disponível', selected: 'selecionado', reserved: 'reservado', paid: 'pago' }[state]}`);
    button.setAttribute('aria-pressed', String(selected.has(row.number)));
    return button;
  }));
  $('selected-list').replaceChildren();
  if (!selected.size) $('selected-list').textContent = 'Escolha um número ao lado para começar.';
  for (const n of [...selected].sort((a,b) => a-b)) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = fmt(n); $('selected-list').append(chip); }
  $('total').textContent = money(selected.size * 10);
  $('reserve-button').disabled = !selected.size || loading || (!demo && config.reservationsEnabled === false);
  $('reserve-button').textContent = !demo && config.reservationsEnabled === false ? 'Reservas em configuração' : loading ? 'Registrando…' : demo ? 'Simular reserva →' : 'Reservar meus números →';
}
async function refresh() {
  if (demo) {
    const bookings = demoRead().filter(active);
    rows = Array.from({ length:100 }, (_, i) => { const booking = bookings.find(b => b.numbers.includes(i+1)); return { number:i+1, status: booking ? (booking.status === 'paid' ? 'paid' : 'reserved') : 'available' }; });
  } else rows = await rpc('get_numbers');
  selected = new Set([...selected].filter(n => rows.some(r => r.number === n && r.status === 'available')));
  render();
}
function showReceipt(booking) {
  lastReceipt = booking;
  remember('rifa-receipt-id',booking.id);
  $('reserve-form').hidden = true; $('receipt').hidden = false;
  $('receipt-details').textContent = `${demo ? 'Simulação: ' : ''}números ${booking.numbers.map(fmt).join(', ')} · ${money(booking.numbers.length * 10)}. Pague até ${new Date(booking.expires_at).toLocaleString('pt-BR')}.`;
  $('receipt-reference').textContent = `Código: ${booking.id}`;
  $('pix-key').textContent = demo ? 'Demonstração — não faça pagamentos' : config.pixKey || 'Chave ainda não informada pelo organizador';
  $('pix-recipient').textContent = demo ? '' : config.pixRecipient;
  $('copy-pix').disabled = demo || !config.pixKey;
}
$('numbers').addEventListener('click', event => {
  const button = event.target.closest('button[data-number]'); if (!button || button.disabled) return;
  const number = Number(button.dataset.number);
  if (selected.has(number)) selected.delete(number); else { if (selected.size >= 10) return notice('Escolha no máximo 10 números por reserva.'); selected.add(number); }
  render();
});
$('reserve-form').addEventListener('submit', async event => {
  event.preventDefault(); if (loading || !selected.size || (!demo && config.reservationsEnabled === false)) return;
  const name = $('buyer-name').value.trim(); const phone = $('buyer-phone').value.replace(/\D/g, '');
  if (name.length < 2 || !/^\d{10,13}$/.test(phone)) return notice('Informe seu nome e um telefone válido com DDD.');
  if (!demo && !config.pixKey) return notice('O organizador ainda precisa cadastrar a chave Pix.');
  loading = true; render();
  try {
    const numbers = [...selected].sort((a,b) => a-b); let booking;
    if (demo) {
      const bookings = demoRead();
      if (bookings.filter(active).some(b => b.numbers.some(n => numbers.includes(n)))) throw new Error('Um desses números acabou de ser reservado. Escolha outro.');
      booking = { id: crypto.randomUUID(), name, phone, numbers, status:'pending', created_at:new Date().toISOString(), expires_at:new Date(Date.now()+86400000).toISOString() };
      bookings.push(booking); localStorage.setItem(DEMO_KEY, JSON.stringify(bookings));
    } else { await buyerSession(); booking = await rpc('reserve_numbers', { p_numbers:numbers, p_name:name, p_phone:phone }); }
    selected.clear(); showReceipt(booking); notice(demo ? 'Reserva simulada neste navegador.' : 'Reserva registrada. Faça o Pix para garantir sua participação.');
  } catch(error) { notice(error.message); }
  finally { loading = false; try { await refresh(); } catch { render(); notice('Não foi possível atualizar os números. Clique em Atualizar.'); } }
});
$('refresh').onclick = () => refresh().catch(e => notice(e.message));
$('new-reservation').onclick = () => { $('receipt').hidden = true; $('reserve-form').hidden = false; lastReceipt = null; remember('rifa-receipt-id',null); };
$('copy-pix').onclick = async () => { try { await navigator.clipboard.writeText(config.pixKey); notice('Chave Pix copiada.'); } catch { notice('Selecione a chave Pix e copie manualmente.'); } };
$('admin-open').onclick = async () => { $('admin-dialog').showModal(); if (demo) { admin = true; await loadAdmin().catch(e => notice(e.message)); } };
$('admin-close').onclick = () => $('admin-dialog').close();
$('login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { session = await request('/auth/v1/token?grant_type=password', { email:$('admin-email').value.trim(), password:$('admin-password').value }); $('admin-password').value = ''; admin = await rpc('is_admin'); if (!admin) { session = buyerAuth; throw new Error('Esta conta não tem permissão de administrador.'); } await loadAdmin(); }
  catch(error) { notice(error.message); } finally { button.disabled = false; }
};
async function loadAdmin() {
  if (!admin) return;
  if (!demo) await buyerSession();
  const bookings = demo ? demoRead() : await request('/rest/v1/reservations?select=*&order=created_at.desc', null, 'GET');
  $('login-form').hidden = true; $('admin-panel').hidden = false;
  $('admin-note').textContent = demo ? 'Painel de demonstração. Alterações ficam apenas neste navegador.' : 'Confirme pagamentos somente depois de verificar o recebimento do Pix.';
  $('admin-stats').textContent = `${bookings.filter(b => b.status === 'pending' && active(b)).length} reservas pendentes · ${money(bookings.filter(b => b.status === 'paid').reduce((sum,b) => sum+b.numbers.length*10,0))} confirmados`;
  $('admin-bookings').replaceChildren();
  if (!bookings.length) $('admin-bookings').textContent = 'Nenhuma reserva registrada ainda.';
  for (const b of bookings) {
    const card = document.createElement('article'); card.className = 'booking-card';
    const title = document.createElement('strong'); title.textContent = b.name;
    const info = document.createElement('p'); info.textContent = `${b.phone} · Números ${b.numbers.map(fmt).join(', ')} · ${money(b.numbers.length*10)}`;
    const status = document.createElement('p'); status.textContent = `${ { pending: active(b) ? 'Aguardando Pix' : 'Expirada', paid:'Pagamento confirmado', cancelled:'Cancelada' }[b.status]} · Código ${b.id} · Prazo ${new Date(b.expires_at).toLocaleString('pt-BR')}`;
    card.append(title, info, status);
    if (b.status === 'pending' && active(b)) for (const [value,label] of [['paid','Confirmar pagamento'],['cancelled','Cancelar reserva']]) {
      const button = document.createElement('button'); button.className = value === 'paid' ? 'primary' : 'secondary'; button.textContent = label;
      button.onclick = async () => {
        if (!confirm(`${label} dos números ${b.numbers.map(fmt).join(', ')} de ${b.name}?`)) return;
        button.disabled = true;
        try { if (demo) { const list = demoRead(); list.find(r => r.id === b.id).status = value; localStorage.setItem(DEMO_KEY,JSON.stringify(list)); } else await rpc('admin_update_reservation', { p_id:b.id, p_status:value }); await loadAdmin(); await refresh(); }
        catch(error) { notice(error.message); button.disabled = false; }
      }; card.append(button);
    }
    $('admin-bookings').append(card);
  }
}
$('admin-refresh').onclick = () => loadAdmin().catch(e => notice(e.message));
$('logout').onclick = () => { session = buyerAuth; admin = false; $('login-form').hidden = false; $('admin-panel').hidden = true; $('admin-dialog').close(); };
document.title = config.title; $('title').textContent = config.title; $('description').textContent = config.description; $('prize').textContent = config.prize; $('draw').textContent = config.draw;
if (demo) { $('mode-banner').hidden = false; $('mode-banner').textContent = 'MODO DEMONSTRAÇÃO · As reservas são simulações salvas apenas neste navegador. Nenhum pagamento deve ser feito. Configure o banco de dados para compartilhar as reservas.'; }
else if (config.reservationsEnabled === false) { $('mode-banner').hidden = false; $('mode-banner').textContent = 'As reservas serão abertas assim que o organizador concluir a configuração. Aguarde a abertura antes de fazer qualquer pagamento.'; }
async function start() {
  await refresh();
  const id = remembered('rifa-receipt-id'); if (!id) return;
  let booking;
  if (demo) booking = demoRead().find(b => b.id === id);
  else if (buyerAuth) { await buyerSession(); const list = await request(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}&select=*`,null,'GET'); booking = list[0]; }
  if (booking?.status === 'pending' && active(booking)) showReceipt(booking);
  else { remember('rifa-receipt-id',null); if (booking?.status === 'paid') notice('Seu pagamento foi confirmado pelo organizador!'); }
}
start().catch(e => notice(e.message));
setInterval(() => { if (!document.hidden && !loading) refresh().catch(() => {}); },15000);
window.addEventListener('storage', event => { if (demo && event.key === DEMO_KEY) refresh().catch(e => notice(e.message)); });
