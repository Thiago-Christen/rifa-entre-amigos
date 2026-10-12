const products = [
  ['taca','Taça decorada','Um brinde aos bons momentos. Taça transparente com decoração floral em tons de lilás.','Para brindar'],
  ['panos','Kit de panos','Panos claros com detalhes azuis, apresentados juntos com uma fita lilás. Um toque de carinho para a cozinha.','Para a casa'],
  ['pote','Pote decorado','Pote de vidro com tampa, alça de corda e laços lilás. Um detalhe delicado para guardar pequenas coisas.','Para a casa'],
  ['pringles','Pringles','A lata verde de Pringles que faz parte da cesta, para acompanhar seus momentos de pausa.','Para saborear'],
  ['chocolates-nestle','Chocolates Nestlé','Caixa Nestlé Especialidades: chocolates para compartilhar ou aproveitar aos poucos.','Para saborear'],
  ['chocolates-azul','Caixa de chocolates','A caixa de embalagem azul que acompanha a cesta. Mais um presente para quem gosta de um momento doce.','Para saborear'],
  ['vinho','Garrafa de vinho','A garrafa que acompanha o prêmio, para completar a cesta e celebrar uma ocasião especial.','Para brindar'],
  ['kaiak','Natura Kaiak','Item da linha Natura Kaiak, na embalagem clara com detalhes azuis apresentada na cesta.','Para se cuidar'],
  ['siage','Eudora Siàge','Produto da linha Eudora Siàge que integra o prêmio, em embalagem tipo refil.','Para se cuidar'],
  ['tododia','Natura Tododia','Conjunto de embalagens Natura Tododia em tons de rosa e branco, para completar os cuidados do dia a dia.','Para se cuidar'],
  ['pao-diario','Pão Diário','Livro devocional Pão Diário: uma companhia para seus momentos de leitura e reflexão.','Para inspirar'],
];
const $ = id => document.getElementById(id);
const dialog = $('items-dialog');
let current = 0, swipeStart;
function show(index, animate = true) {
  current = (index + products.length) % products.length;
  const [id, title, description, category] = products[current];
  $('item-image').src = `assets/item-${id}.webp`;
  $('item-image').alt = title;
  $('item-title').textContent = title;
  $('item-description').textContent = description;
  $('item-category').textContent = category;
  $('item-counter').textContent = `${current + 1} de ${products.length}`;
  $('item-announcement').textContent = `Item ${current + 1} de ${products.length}: ${title}. ${description}`;
  for (const [i, button] of [...$('item-thumbs').children].entries()) button.setAttribute('aria-pressed', String(i === current));
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) $('item-slide').animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
}
for (const [i, [id, title]] of products.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'item-thumb'; button.setAttribute('aria-label', `Ver ${title}`);
  const img = document.createElement('img'); img.src = `assets/item-${id}.webp`; img.alt = ''; img.loading = 'lazy'; img.width = 54; img.height = 54;
  button.append(img); button.onclick = () => show(i); $('item-thumbs').append(button);
}
$('items-open').onclick = () => { show(current,false); dialog.showModal(); };
$('items-close').onclick = () => dialog.close();
$('item-prev').onclick = () => show(current - 1);
$('item-next').onclick = () => show(current + 1);
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1)); }
});
$('item-slide').addEventListener('touchstart',event => { swipeStart = event.touches[0]?.clientX; },{passive:true});
$('item-slide').addEventListener('touchend',event => {
  const difference = event.changedTouches[0]?.clientX - swipeStart;
  if (Math.abs(difference) > 60) show(current + (difference < 0 ? 1 : -1));
  swipeStart = undefined;
},{passive:true});
