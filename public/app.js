const config = window.RIFA_CONFIG;
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const fmt = n => String(n).padStart(2, '0');
const demo = !config.supabaseUrl || !config.supabasePublicKey;
function remembered(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function remember(key, value) { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* Reserva continua disponível no banco quando armazenamento local é bloqueado. */ } }
let buyerAuth = remembered('rifa-buyer-session');
let session = buyerAuth, admin = false, loading = false, rows = [], selected = new Set();
let toastTimer, lastReceipt = null, adminBookings = [], refreshingSession, finishConfirmation;
function confirmAction(label, booking) {
  $('action-title').textContent = label + '?';
  $('action-details').textContent = `${booking.name} · Números ${booking.numbers.map(fmt).join(', ')} · ${money(booking.numbers.length * 10)}`;
  $('action-confirm').textContent = label;
  $('action-dialog').showModal();
  return new Promise(resolve => { finishConfirmation = resolve; });
}
function closeConfirmation(accepted) {
  $('action-dialog').close(); finishConfirmation?.(accepted); finishConfirmation = null;
}
$('action-cancel').onclick = () => closeConfirmation(false);
$('action-confirm').onclick = () => closeConfirmation(true);
$('action-dialog').addEventListener('cancel', event => { event.preventDefault(); closeConfirmation(false); });
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
    if (response.status === 401 && path.startsWith('/rest/')) { leaveAdmin(); }
    throw new Error(data?.message || data?.msg || data?.error_description || 'Não foi possível conectar. Tente novamente.');
  }
  return data;
}
const rpc = (name, args = {}) => request(`/rest/v1/rpc/${name}`, args);
async function buyerSession() {
  if (refreshingSession) return refreshingSession;
  if (session && (!session.expires_at || session.expires_at * 1000 > Date.now() + 30000)) return;
  if (session?.refresh_token) {
    refreshingSession = (async () => {
      try {
        session = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
        if (admin) remember('rifa-admin-session',session);
        else { buyerAuth = session; remember('rifa-buyer-session',session); }
      } catch {
        if (admin) { leaveAdmin(); throw new Error('Seu acesso expirou. Entre novamente no painel.'); }
        session = null; buyerAuth = null; remember('rifa-buyer-session',null);
        throw new Error('Seu acesso expirou. Tente reservar novamente.');
      } finally { refreshingSession = null; }
    })();
    return refreshingSession;
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
  for (const row of rows) {
    let button = $('numbers').querySelector(`[data-number="${row.number}"]`);
    if (!button) { button = document.createElement('button'); $('numbers').append(button); }
    const state = selected.has(row.number) ? 'selected' : row.status;
    button.className = `number ${state}`; button.textContent = fmt(row.number);
    button.dataset.number = row.number; button.disabled = row.status !== 'available' || loading;
    button.setAttribute('aria-label', `Número ${fmt(row.number)}, ${ { available: 'disponível', selected: 'selecionado', reserved: 'reservado', paid: 'pago' }[state]}`);
    button.setAttribute('aria-pressed', String(selected.has(row.number)));
  }
  $('selected-list').replaceChildren();
  if (!selected.size) $('selected-list').textContent = 'Escolha um número para começar.';
  for (const n of [...selected].sort((a,b) => a-b)) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'chip';
    chip.textContent = fmt(n); chip.dataset.remove = n;
    chip.setAttribute('aria-label', `Remover número ${fmt(n)} da seleção`);
    const icon = document.createElement('i'); icon.className = 'bi bi-x-lg'; icon.setAttribute('aria-hidden','true'); chip.append(icon);
    $('selected-list').append(chip);
  }
  $('total').textContent = money(selected.size * 10);
  $('reserve-button').disabled = admin || !selected.size || loading || (!demo && config.reservationsEnabled === false);
  $('reserve-button').textContent = admin ? 'Você está no acesso organizador' : !demo && config.reservationsEnabled === false ? 'Reservas em configuração' : loading ? 'Registrando…' : demo ? 'Simular reserva' : 'Reservar meus números';
  $('clear-selection').disabled = !selected.size || loading;
  $('lucky-pick').disabled = selected.size >= 10 || loading || !rows.some(r => r.status === 'available' && !selected.has(r.number));
  $('mobile-cart').hidden = admin || !selected.size || !$('receipt').hidden;
  $('mobile-selection').textContent = `${selected.size} número${selected.size === 1 ? '' : 's'}`;
  $('mobile-total').textContent = money(selected.size * 10);
}
async function refresh() {
  if (demo) {
    const bookings = demoRead().filter(active);
    rows = Array.from({ length:100 }, (_, i) => { const booking = bookings.find(b => b.numbers.includes(i+1)); return { number:i+1, status: booking ? (booking.status === 'paid' ? 'paid' : 'reserved') : 'available' }; });
  } else rows = await rpc('get_numbers');
  selected = new Set([...selected].filter(n => rows.some(r => r.number === n && r.status === 'available')));
  render();
  if (admin && !$('organizer-view').hidden) renderBookings();
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
  event.preventDefault(); if (admin || loading || !selected.size || (!demo && config.reservationsEnabled === false)) return;
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
function showView(organizer) {
  $('customer-view').hidden = organizer; $('organizer-view').hidden = !organizer;
  $('customer-nav').hidden = organizer;
  $('admin-open').querySelector('span').textContent = admin ? 'Meu painel' : 'Organizador';
  if (organizer && admin) {
    if ($('admin-dialog').open) $('admin-dialog').close();
    history.replaceState(null,'',location.pathname + location.search + '#painel');
    $('dashboard-title').focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  } else if (location.hash === '#painel') history.replaceState(null,'',location.pathname + location.search);
  render();
}
function leaveAdmin() {
  session = buyerAuth; admin = false; adminBookings = []; remember('rifa-admin-session',null);
  $('admin-bookings').replaceChildren(); $('admin-panel').hidden = true;
  showView(false);
}
$('admin-open').onclick = async () => {
  if (admin) return loadAdmin().catch(e => notice(e.message));
  if (demo) { admin = true; return loadAdmin().catch(e => notice(e.message)); }
  $('admin-dialog').showModal();
};
$('admin-close').onclick = () => $('admin-dialog').close();
const signupButton = document.createElement('button'); signupButton.type = 'button'; signupButton.className = 'secondary'; signupButton.textContent = 'Criar meu acesso';
signupButton.disabled = !demo && config.adminSignupEnabled === false;
signupButton.hidden = !demo && config.adminSignupEnabled === false;
$('login-form').append(signupButton);
signupButton.onclick = async () => {
  if (demo) return notice('O cadastro administrativo está disponível apenas com o banco conectado.');
  if (!$('login-form').reportValidity()) return;
  const email = $('admin-email').value.trim(); const password = $('admin-password').value;
  if (password.length < 8) return notice('Escolha uma senha com pelo menos 8 caracteres.');
  signupButton.disabled = true;
  try {
    const redirect = new URL('./',location.href).href;
    await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`,{email,password});
    $('admin-password').value = '';
    notice('Confira seu e-mail e confirme o cadastro. Depois entre com a senha escolhida. Somente o e-mail autorizado terá acesso ao painel.');
  } catch(error) { notice(error.message); }
  finally { signupButton.disabled = config.adminSignupEnabled === false; }
};
$('login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    session = await request('/auth/v1/token?grant_type=password', { email:$('admin-email').value.trim(), password:$('admin-password').value });
    $('admin-password').value = ''; admin = await rpc('is_admin');
    if (!admin) throw new Error('Esta conta não tem permissão de organizador.');
    remember('rifa-admin-session',session);
    await loadAdmin();
  } catch(error) { leaveAdmin(); notice(error.message); }
  finally { button.disabled = false; }
};
async function loadAdmin(navigate = true) {
  if (!admin) return;
  if (!demo) {
    await buyerSession();
    if (!await rpc('is_admin')) { leaveAdmin(); throw new Error('Acesso restrito ao organizador autorizado.'); }
  }
  adminBookings = demo ? demoRead().sort((a,b) => new Date(b.created_at)-new Date(a.created_at)) : await request('/rest/v1/reservations?select=*&order=created_at.desc', null, 'GET');
  $('admin-panel').hidden = false;
  $('admin-note').textContent = demo ? 'Painel de demonstração. Alterações ficam apenas neste navegador.' : 'Confirme pagamentos somente depois de verificar o recebimento do Pix.';
  renderBookings(); if (navigate) showView(true);
}
function renderBookings() {
  if (!admin) return;
  const pending = adminBookings.filter(b => b.status === 'pending' && active(b));
  const paidNumbers = adminBookings.filter(b => b.status === 'paid').reduce((sum,b) => sum + b.numbers.length,0);
  $('metric-pending').textContent = pending.length;
  $('metric-paid').textContent = paidNumbers;
  $('metric-revenue').textContent = money(paidNumbers * 10);
  const query = $('booking-search').value.trim().toLocaleLowerCase('pt-BR');
  const filter = $('booking-filter').value;
  const bookings = adminBookings.filter(b => {
    const state = b.status === 'pending' && !active(b) ? 'expired' : b.status;
    return (filter === 'all' || state === filter) && (!query || `${b.name} ${b.phone} ${b.numbers.map(fmt).join(' ')} ${b.id}`.toLocaleLowerCase('pt-BR').includes(query));
  });
  $('admin-stats').textContent = `${bookings.length} de ${adminBookings.length} reservas`;
  $('admin-bookings').replaceChildren();
  if (!bookings.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    const icon = document.createElement('i'); icon.className = 'bi bi-inbox'; icon.setAttribute('aria-hidden','true');
    empty.append(icon,document.createTextNode(adminBookings.length ? 'Nenhuma reserva encontrada. Tente outro filtro.' : 'As primeiras participações vão aparecer aqui. Compartilhe sua rifa!'));
    $('admin-bookings').append(empty);
  }
  for (const b of bookings) {
    const card = document.createElement('article'); card.className = 'booking-card';
    const heading = document.createElement('div'); heading.className = 'booking-heading';
    const title = document.createElement('strong'); title.textContent = b.name;
    const state = b.status === 'pending' && !active(b) ? 'expired' : b.status;
    const badge = document.createElement('span'); badge.className = `status-pill ${state}`;
    badge.textContent = {pending:'Aguardando Pix',expired:'Expirada',paid:'Pagamento confirmado',cancelled:'Cancelada'}[state];
    heading.append(title,badge);
    const info = document.createElement('p'); info.className = 'booking-numbers'; info.textContent = `Números ${b.numbers.map(fmt).join(', ')} · ${money(b.numbers.length*10)}`;
    const contact = document.createElement('p'); contact.textContent = `WhatsApp: ${b.phone}`;
    const status = document.createElement('p'); status.textContent = `Código ${b.id} · Prazo ${new Date(b.expires_at).toLocaleString('pt-BR')}`;
    card.append(heading, info, contact, status);
    if (b.status === 'pending' && active(b)) for (const [value,label] of [['paid','Confirmar pagamento'],['cancelled','Cancelar reserva']]) {
      const button = document.createElement('button'); button.className = value === 'paid' ? 'primary' : 'secondary'; button.textContent = label;
      button.onclick = async () => {
        if (!await confirmAction(label,b)) return;
        button.disabled = true;
        try { if (demo) { const list = demoRead(); list.find(r => r.id === b.id).status = value; localStorage.setItem(DEMO_KEY,JSON.stringify(list)); } else await rpc('admin_update_reservation', { p_id:b.id, p_status:value }); await loadAdmin(); await refresh(); }
        catch(error) { notice(error.message); button.disabled = false; }
      }; card.append(button);
    }
    $('admin-bookings').append(card);
  }
}
$('admin-refresh').onclick = () => loadAdmin().catch(e => notice(e.message));
$('booking-search').oninput = renderBookings;
$('booking-filter').onchange = renderBookings;
$('view-store').onclick = () => { showView(false); window.scrollTo({top:0,behavior:'instant'}); };
$('logout').onclick = async () => {
  try { if (!demo && admin) await request('/auth/v1/logout?scope=local',{}); }
  catch { notice('A sessão local foi encerrada.'); }
  finally { leaveAdmin(); notice('Você saiu do painel.'); }
};
$('clear-selection').onclick = () => { selected.clear(); render(); };
$('lucky-pick').onclick = () => {
  const choices = rows.filter(r => r.status === 'available' && !selected.has(r.number));
  if (loading || selected.size >= 10 || !choices.length) return;
  selected.add(choices[Math.floor(Math.random() * choices.length)].number); render();
};
$('selected-list').onclick = event => {
  const chip = event.target.closest('[data-remove]'); if (!chip || loading) return;
  selected.delete(Number(chip.dataset.remove)); render(); $('numbers').querySelector(`[data-number="${chip.dataset.remove}"]`)?.focus();
};
document.title = config.title; $('title').textContent = config.title; $('description').textContent = config.description; $('prize').textContent = config.prize; $('draw').textContent = config.draw;
if (demo) { $('mode-banner').hidden = false; $('mode-banner').textContent = 'MODO DEMONSTRAÇÃO · As reservas são simulações salvas apenas neste navegador. Nenhum pagamento deve ser feito. Configure o banco de dados para compartilhar as reservas.'; }
else if (config.reservationsEnabled === false) { $('mode-banner').hidden = false; $('mode-banner').textContent = 'As reservas serão abertas assim que o organizador concluir a configuração. Aguarde a abertura antes de fazer qualquer pagamento.'; }
async function start() {
  const callback = new URLSearchParams(location.hash.slice(1));
  const savedAdmin = remembered('rifa-admin-session');
  if (savedAdmin && !demo && !callback.has('access_token') && !callback.has('error_description')) {
    try {
      session = savedAdmin; admin = true;
      await buyerSession();
      if (!await rpc('is_admin')) throw new Error('Acesso não autorizado.');
      await loadAdmin();
    } catch { leaveAdmin(); notice('Entre novamente para acessar seu painel.'); }
  }
  if (callback.has('access_token') || callback.has('error_description')) {
    history.replaceState(null,'',location.pathname+location.search);
    if (callback.has('error_description')) notice(callback.get('error_description'));
    else {
      session = {access_token:callback.get('access_token'),refresh_token:callback.get('refresh_token'),expires_at:Number(callback.get('expires_at')) || Math.floor(Date.now()/1000)+Number(callback.get('expires_in')||3600)};
      await request('/auth/v1/user',null,'GET');
      admin = await rpc('is_admin');
      if (admin) { remember('rifa-admin-session',session); await loadAdmin(); }
      else { leaveAdmin(); notice('E-mail verificado. Esta conta não está autorizada como organizador.'); }
    }
  }
  await refresh();
  if (admin) return;
  if (location.hash === '#painel') $('admin-dialog').showModal();
  const id = remembered('rifa-receipt-id'); if (!id) return;
  let booking;
  if (demo) booking = demoRead().find(b => b.id === id);
  else if (buyerAuth) { await buyerSession(); const list = await request(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}&select=*`,null,'GET'); booking = list[0]; }
  if (booking?.status === 'pending' && active(booking)) showReceipt(booking);
  else { remember('rifa-receipt-id',null); if (booking?.status === 'paid') notice('Seu pagamento foi confirmado pelo organizador!'); }
}
start().catch(e => notice(e.message));
setInterval(() => {
  if (document.hidden || loading || $('action-dialog').open) return;
  if (admin && !$('organizer-view').hidden) loadAdmin(false).catch(() => {});
  else refresh().catch(() => {});
},15000);
window.addEventListener('storage', event => { if (demo && event.key === DEMO_KEY) refresh().catch(e => notice(e.message)); });
