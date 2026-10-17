const $ = s => document.querySelector(s);
const state = { products: [], cart: JSON.parse(localStorage.getItem('modon_cart') || '[]'), config: { whatsapp: '212654283265', storeName: 'MODONSTORE' }, search: '' };
const money = n => `${Number(n || 0).toLocaleString('fr-MA', { maximumFractionDigits: 2 })} DH`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'وقع مشكل، عاود المحاولة.');
  return data;
}
function saveCart() { localStorage.setItem('modon_cart', JSON.stringify(state.cart)); renderCart(); }
function cartCount() { return state.cart.reduce((n, i) => n + i.quantity, 0); }
function cartTotal() { return state.cart.reduce((n, i) => n + (Number(i.price) * i.quantity), 0); }
function renderProducts() {
  const term = state.search.toLocaleLowerCase();
  const category = $('#categoryFilter').value;
  let products = state.products.filter(p => `${p.name} ${p.category} ${p.description}`.toLocaleLowerCase().includes(term) && (!category || p.category === category));
  if ($('#sortFilter').value === 'low') products.sort((a,b) => a.price-b.price);
  if ($('#sortFilter').value === 'high') products.sort((a,b) => b.price-a.price);
  $('#productGrid').innerHTML = products.map(p => `
    <article class="product-card">
      <div class="product-image"><img src="${esc(p.image || '/assets/product-watch.png')}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='/assets/product-watch.png'">${p.oldPrice && p.oldPrice > p.price ? '<span class="product-badge">تخفيض</span>' : ''}</div>
      <div class="product-body"><span class="product-category">${esc(p.category || 'عام')}</span><h3 class="product-title">${esc(p.name)}</h3><p class="product-description">${esc(p.description || 'منتج مختار من MODONSTORE.')}</p>
      <div class="price-row"><b class="price">${money(p.price)}</b>${p.oldPrice && p.oldPrice > p.price ? `<span class="old-price">${money(p.oldPrice)}</span>` : ''}<span class="stock-note">${p.stock > 0 ? `متوفر: ${p.stock}` : 'نفد المخزون'}</span></div>
      <button class="add-cart" data-add="${esc(p.id)}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock > 0 ? '＋ زيد للسلة' : 'غير متوفر حاليا'}</button></div>
    </article>`).join('');
  $('#emptyProducts').classList.toggle('hidden', products.length !== 0);
  if (!products.length) $('#productGrid').innerHTML = '';
  $('#productGrid').querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToCart(btn.dataset.add)));
}
function addToCart(id) {
  const p = state.products.find(x => x.id === id); if (!p) return;
  const existing = state.cart.find(x => x.id === id);
  if ((existing?.quantity || 0) >= p.stock) return toast('ما كايناش كمية أكثر فالمخزون.');
  if (existing) existing.quantity++; else state.cart.push({ id: p.id, name: p.name, price: p.price, image: p.image, quantity: 1, stock: p.stock });
  saveCart(); toast('تزادت السلعة للسلة.');
}
function renderCart() {
  $('#cartCount').textContent = cartCount();
  $('#cartTotal').textContent = money(cartTotal());
  $('#checkoutTotal').textContent = money(cartTotal());
  const el = $('#cartItems');
  if (!state.cart.length) { el.innerHTML = '<div class="cart-empty">🛍️<p>السلة ديالك مازال خاوية.</p><small>اختار شي منتجات وزيدها هنا.</small></div>'; $('#checkoutBtn').disabled = true; return; }
  $('#checkoutBtn').disabled = false;
  el.innerHTML = state.cart.map(i => `<div class="cart-item"><img src="${esc(i.image || '/assets/product-watch.png')}" alt=""><div><b>${esc(i.name)}</b><small>${money(i.price)} للواحدة</small><div class="quantity"><button data-minus="${esc(i.id)}">−</button><span>${i.quantity}</span><button data-plus="${esc(i.id)}">＋</button></div></div><button class="remove-item" data-remove="${esc(i.id)}">حذف</button></div>`).join('');
  el.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => changeQty(b.dataset.minus, -1));
  el.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => changeQty(b.dataset.plus, 1));
  el.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { state.cart = state.cart.filter(i => i.id !== b.dataset.remove); saveCart(); });
}
function changeQty(id, delta) {
  const item = state.cart.find(i => i.id === id), product = state.products.find(p => p.id === id);
  if (!item) return;
  const max = product ? product.stock : item.stock;
  if (item.quantity + delta < 1) state.cart = state.cart.filter(i => i.id !== id);
  else if (item.quantity + delta > max) return toast('وصلتي للكمية المتوفرة فالمخزون.');
  else item.quantity += delta;
  saveCart();
}
function showCart() { $('#overlay').classList.remove('hidden'); $('#cartDrawer').classList.add('open'); }
function hideCart() { $('#overlay').classList.add('hidden'); $('#cartDrawer').classList.remove('open'); }
async function load() {
  try {
    [state.products, state.config] = await Promise.all([api('/api/products'), api('/api/config')]);
    const cats = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    $('#categoryFilter').innerHTML = '<option value="">جميع الأصناف</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#contactWhatsApp').href = `https://wa.me/${state.config.whatsapp}`;
    // Keep cart entries aligned with current catalogue and inventory.
    state.cart = state.cart.filter(i => state.products.some(p => p.id === i.id)).map(i => { const p = state.products.find(p => p.id === i.id); return {...i, name:p.name, price:p.price, image:p.image, stock:p.stock, quantity:Math.min(i.quantity, p.stock)}; }).filter(i => i.quantity > 0);
    saveCart(); renderProducts();
  } catch (e) { $('#productGrid').innerHTML = `<div class="loading">ما قدرناش نحملو المنتجات: ${esc(e.message)}</div>`; }
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); state.search = $('#searchInput').value.trim(); renderProducts(); $('#products').scrollIntoView({behavior:'smooth'}); });
$('#searchInput').addEventListener('input', e => { state.search = e.target.value.trim(); renderProducts(); });
$('#categoryFilter').addEventListener('change', renderProducts);
$('#sortFilter').addEventListener('change', renderProducts);
$('#openCart').onclick = showCart; $('#closeCart').onclick = hideCart; $('#overlay').onclick = hideCart;
$('#checkoutBtn').onclick = () => {
  if (!state.cart.length) return;
  hideCart(); $('#checkoutError').textContent = ''; $('#checkoutDialog').showModal();
};
$('#closeCheckout').onclick = () => $('#checkoutDialog').close();
$('#checkoutForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!state.cart.length) return;
  const form = new FormData(e.currentTarget);
  const customer = Object.fromEntries(form.entries());
  const btn = $('#submitOrder'); btn.disabled = true; btn.textContent = 'كنسجلو الطلب...'; $('#checkoutError').textContent = '';
  // Open the tab synchronously from the user's click to reduce popup-blocking.
  const waTab = window.open('about:blank', '_blank');
  try {
    const result = await api('/api/orders', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ customer, items: state.cart.map(i => ({id:i.id, quantity:i.quantity})) }) });
    state.cart = []; saveCart(); $('#checkoutDialog').close();
    if (waTab) { waTab.opener = null; waTab.location.href = result.whatsappUrl; }
    else { window.location.href = result.whatsappUrl; }
    await load();
  } catch (err) { if (waTab) waTab.close(); $('#checkoutError').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'تسجيل الطلب وفتح واتساب'; }
});
$('#year').textContent = new Date().getFullYear();
load(); renderCart();
