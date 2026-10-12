const products = [
  ["taca-real","Taça de vidro","Uma taça de vidro transparente com haste e acabamento liso. Um convite para brindar e celebrar as pequenas conquistas.","Para brindar"],
  ["trilho","Trilho de mesa · 1,80 m × 40 cm","Trilho de mesa de 1,80 m de comprimento por 40 cm de largura, com flores azuis, detalhes verdes e acabamento branco rendado com fita azul.","Para a casa"],
  ["pote-real","Pote decorado de Páscoa","Pote de vidro com tampa dourada, alça de corda e laços lilás. A decoração traz um coelho e a mensagem “Feliz Páscoa!”.","Para a casa"],
  ["pringles-real","Pringles · Creme e Cebola","Uma lata de batatas Pringles sabor Creme e Cebola. Um snack crocante para acompanhar um filme ou dividir um momento de pausa.","Para saborear"],
  ["nestle-real","Nestlé Especialidades · 220 g","Caixa Nestlé Especialidades com 220 g de chocolates variados. Diferentes sabores para saborear e compartilhar.","Para saborear"],
  ["lacta","Lacta Favoritos · 250,6 g","Caixa de chocolates sortidos Lacta Favoritos, com 250,6 g e a mensagem “Te adoro” na embalagem. Um presente doce para aproveitar com carinho.","Para saborear"],
  ["vinho-real","Vinho Invictas Carménère · 2025","Uma garrafa de vinho tinto chileno Invictas Carménère, safra 2025, da região do Valle Central. Para acompanhar uma ocasião especial.","Para brindar"],
  ["kaiak-real","Natura Kaiak · Refil 100 ml","Refil de 100 ml do desodorante corporal masculino em spray Natura Kaiak. Uma opção de cuidado para o dia a dia; a embalagem é de refil.","Para se cuidar"],
  ["siage-real","Eudora Siàge Cica-Therapy · 250 g","Refil de 250 g da máscara capilar Eudora Siàge Cica-Therapy, da etapa de reconstrução. Um cuidado para incluir na rotina dos cabelos.","Para se cuidar"],
  ["tododia-sabonetes","Tododia · Sabonetes Cereja e Avelã","Uma caixa Natura Tododia Cereja e Avelã com 5 sabonetes em barra de 90 g cada (450 g no total). Feitos com base vegetal e livres de gordura animal, conforme a embalagem.","Para se cuidar"],
  ["tododia-amora","Tododia · Amora Vermelha e Jabuticaba","Creme para o corpo Natura Tododia com nutrição prebiótica, fragrância Amora Vermelha e Jabuticaba, com 200 ml.","Para se cuidar"],
  ["tododia-noz","Tododia · Noz Pecã e Cacau","Creme para o corpo Natura Tododia com nutrição prebiótica, fragrância Noz Pecã e Cacau, com 200 ml.","Para se cuidar"],
  ["pao-real","Pão Diário · 365 devocionais","Livro Pão Diário com 365 devocionais para seu tempo com Deus. Uma leitura para reservar um momento de reflexão a cada dia.","Para inspirar"],
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
