// Testes de autorização e sessão do código real, com DOM e API isolados.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const html = await readFile(new URL('../public/index.html',import.meta.url),'utf8');
class Element {
  constructor(){this.hidden=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this.dataset={};this.style={};this.children=[];this.handlers={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,handler){this.handlers[name]=handler;}
  querySelector(selector){
    if(selector==='span')return this.span ||= new Element();
    const match=selector.match(/data-number="(\d+)"/);return match?this.children.find(el=>Number(el.dataset.number)===Number(match[1])):null;
  }
  showModal(){this.open=true;}close(){this.open=false;}focus(){}
  reportValidity(){return true;}
}
const store = new Map();
const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
for(const id of ['receipt','organizer-view','admin-panel','mode-banner','mobile-cart'])elements[id].hidden=true;
elements['booking-filter'].value='all';
const requests=[];let authorization=false;let refreshes=0;
const authSession={access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
const bookings=[{id:'booking-test',name:'Teste',phone:'41999990000',numbers:[1],status:'pending',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()}];
const context=vm.createContext({
  window:{RIFA_CONFIG:{title:'Rifa',description:'Teste',prize:'Cesta',draw:'A definir',supabaseUrl:'https://example.test',supabasePublicKey:'test-key',reservationsEnabled:true,adminSignupEnabled:false},scrollTo(){},addEventListener(){}},
  document:{getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),hidden:false},
  sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
  localStorage:{getItem:()=>null},location:{pathname:'/',search:'',hash:'',href:'https://example.test/'},
  history:{replaceState(){}},navigator:{clipboard:{writeText:async()=>{}}},
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,Intl,Date,URL,URLSearchParams,console,
  fetch:async(url,options)=>{
    requests.push({url,options});
    if(url.includes('grant_type=refresh_token')){refreshes++;return{ok:true,status:200,json:async()=>authSession};}
    if(url.includes('grant_type=password'))return{ok:true,status:200,json:async()=>authSession};
    if(url.endsWith('/is_admin'))return{ok:true,status:200,json:async()=>authorization};
    if(url.endsWith('/get_numbers'))return{ok:true,status:200,json:async()=>Array.from({length:100},(_,i)=>({number:i+1,status:'available'}))};
    if(url.includes('/reservations?'))return{ok:true,status:200,json:async()=>bookings};
    if(url.endsWith('/admin_update_reservation')){
      const body=JSON.parse(options.body);bookings.find(b=>b.id===body.p_id).status=body.p_status;
      return{ok:true,status:200,json:async()=>null};
    }
    return{ok:true,status:204,json:async()=>null};
  }
});
vm.runInContext(source,context);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(elements['organizer-view'].hidden,true);
elements['admin-email'].value='cliente@example.test';elements['admin-password'].value='senha-ficticia';
const submit=()=>elements['login-form'].onsubmit({preventDefault(){},submitter:new Element()});
await submit();
assert.equal(elements['organizer-view'].hidden,true);
assert.equal(store.has('rifa-admin-session'),false);
assert.equal(requests.some(r=>r.url.includes('/reservations?')),false,'Cliente não pode buscar reservas do painel');
authorization=true;elements['admin-email'].value='organizador@example.test';elements['admin-password'].value='senha-ficticia';
await submit();
assert.equal(elements['customer-view'].hidden,true);
assert.equal(elements['organizer-view'].hidden,false);
assert.equal(store.has('rifa-admin-session'),true);
assert.equal(elements['metric-pending'].textContent,1);
assert.equal(elements['reserve-button'].disabled,true);
elements['booking-filter'].value='paid';elements['booking-filter'].onchange();
assert.equal(elements['admin-bookings'].children[0].className,'empty-state');
elements['booking-filter'].value='all';elements['booking-filter'].onchange();
const before= requests.length;
const confirmation=vm.runInContext("confirmAction('Confirmar pagamento',{name:'Teste',numbers:[1]})",context);
assert.equal(elements['action-dialog'].open,true);
elements['action-cancel'].onclick();assert.equal(await confirmation,false);
assert.equal(requests.length,before,'Cancelar revisão não envia mudança ao banco');
const approval=vm.runInContext("confirmAction('Confirmar pagamento',{name:'Teste',numbers:[1]})",context);
elements['action-confirm'].onclick();assert.equal(await approval,true);
const paymentButton=elements['admin-bookings'].children[0].children.find(el=>el.textContent==='Confirmar pagamento');
const update=paymentButton.onclick();
assert.equal(elements['action-dialog'].open,true);
elements['action-confirm'].onclick();await update;
assert.equal(bookings[0].status,'paid');
assert.equal(elements['metric-paid'].textContent,1);
assert.equal(requests.find(r=>r.url.endsWith('/admin_update_reservation')).options.headers.Authorization,'Bearer test-token');
vm.runInContext('session.expires_at = 1',context);
await Promise.all([vm.runInContext('buyerSession()',context),vm.runInContext('buyerSession()',context)]);
assert.equal(refreshes,1,'Refresh concorrente deve usar uma única troca de token');
assert.equal(JSON.parse(store.get('rifa-admin-session')).access_token,'test-token');
await elements.logout.onclick();
assert.equal(store.has('rifa-admin-session'),false);
assert.equal(elements['organizer-view'].hidden,true);
assert.equal(elements['admin-bookings'].children.length,0);
assert.equal(elements['customer-view'].hidden,false);
vm.runInContext('selected.add(1);render()',context);
assert.equal(elements['mobile-cart'].hidden,false);
assert.match(elements['mobile-total'].textContent,/10,00/);
assert.ok(requests.some(r=>r.url.includes('/logout?scope=local')));
console.log('PASS: cliente bloqueado sem consulta privada, organizador autorizado, telas separadas, confirmação/cancelamento, renovação única e saída com limpeza de dados.');
