const $ = s => document.querySelector(s);
const money = n => `${Number(n || 0).toLocaleString('fr-MA', {maximumFractionDigits:2})} DH`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products = [], orders = [];
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'وقع مشكل.');
  return data;
}
function toast(msg) { const e = $('#adminToast'); e.textContent = msg; e.classList.add('show'); clearTimeout(window.__t); window.__t = setTimeout(() => e.classList.remove('show'), 2600); }
function showDashboard() { $('#loginPanel').classList.add('hidden'); $('#dashboard').classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden'); refreshAll(); }
async function checkLogin() { try { await api('/api/admin/me'); showDashboard(); } catch { $('#loginPanel').classList.remove('hidden'); $('#dashboard').classList.add('hidden'); $('#logoutBtn').classList.add('hidden'); } }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  const btn = e.currentTarget.querySelector('button'); btn.disabled = true;
  const fd = new FormData(e.currentTarget);
  try { await api('/api/admin/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(fd.entries()))}); showDashboard(); }
  catch(err) { $('#loginError').textContent = err.message; }
  finally { btn.disabled = false; }
});
$('#logoutBtn').onclick = async () => { await api('/api/admin/logout', {method:'POST'}); checkLogin(); };
async function refreshAll() {
  try { [products, orders] = await Promise.all([api('/api/admin/products'), api('/api/admin/orders')]); renderProducts(); renderOrders(); renderStats(); }
  catch(e) { if (e.message.includes('تسجل الدخول')) checkLogin(); else toast(e.message); }
}
function renderStats() {
  $('#productStat').textContent = products.length;
  $('#orderStat').textContent = orders.length;
  $('#newOrderStat').textContent = orders.filter(o => o.status === 'جديد').length;
}
function renderProducts() {
  if (!products.length) { $('#adminProducts').innerHTML = '<p class="muted">مازال ما زدتي حتى منتج. اضغط على «منتج جديد» باش تزيد أول سلعة.</p>'; return; }
  $('#adminProducts').innerHTML = `<table class="admin-table"><thead><tr><th>المنتج</th><th>الثمن</th><th>المخزون</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${products.map(p => `<tr><td><div class="product-cell"><img src="${esc(p.image || '/assets/product-watch.png')}" alt=""><div><b>${esc(p.name)}</b><small>${esc(p.category || 'عام')}</small></div></div></td><td>${money(p.price)}</td><td>${p.stock}</td><td>${p.active === false ? 'مخفي' : 'ظاهر'}</td><td><div class="table-actions"><button class="small-btn" data-edit="${esc(p.id)}">تعديل</button><button class="small-btn danger" data-delete="${esc(p.id)}">حذف</button></div></td></tr>`).join('')}</tbody></table>`;
  $('#adminProducts').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editProduct(b.dataset.edit));
  $('#adminProducts').querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteProduct(b.dataset.delete));
}
function renderOrders() {
  if (!orders.length) { $('#adminOrders').innerHTML = '<p class="muted">مازال ما توصلنا حتى طلب. ملي يشري شي زبون غادي يبان الطلب هنا.</p>'; return; }
  const statuses = ['جديد','تم التأكيد','قيد التوصيل','مكتمل','ملغي'];
  $('#adminOrders').innerHTML = `<table class="admin-table"><thead><tr><th>الطلب</th><th>الزبون</th><th>المنتجات</th><th>المجموع</th><th>الحالة</th><th>التواصل</th></tr></thead><tbody>${orders.map(o => `<tr><td><b>${esc(o.id)}</b><small style="display:block;color:#8792a6">${new Date(o.createdAt).toLocaleString('fr-MA')}</small></td><td><b>${esc(o.customer.name)}</b><small style="display:block">${esc(o.customer.phone)}</small><small style="display:block">${esc(o.customer.city)} — ${esc(o.customer.address)}</small></td><td class="order-items">${o.items.map(i => `${esc(i.name)} × ${i.quantity}`).join('<br>')}</td><td><b>${money(o.total)}</b></td><td><select class="status-select" data-status="${esc(o.id)}">${statuses.map(s => `<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></td><td><a class="small-btn" target="_blank" rel="noopener" href="https://wa.me/${String(o.customer.phone).replace(/\D/g,'').replace(/^0/,'212')}">واتساب</a></td></tr>`).join('')}</tbody></table>`;
  $('#adminOrders').querySelectorAll('[data-status]').forEach(s => s.onchange = async () => { try { await api('/api/admin/orders/'+encodeURIComponent(s.dataset.status), {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:s.value})}); toast('تحدّثات حالة الطلب.'); await refreshAll(); } catch(e) { toast(e.message); } });
}
function resetProductForm() { $('#productForm').reset(); $('#productForm').elements.id.value = ''; $('#productForm').elements.category.value = 'عام'; $('#productForm').elements.stock.value = '1'; $('#productFormTitle').textContent = 'إضافة منتج'; $('#productFormError').textContent = ''; $('#productFormWrap').classList.remove('hidden'); $('#productFormWrap').scrollIntoView({behavior:'smooth', block:'start'}); }
function editProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const f = $('#productForm'); f.reset(); f.elements.id.value = p.id; f.elements.name.value = p.name; f.elements.category.value = p.category || 'عام'; f.elements.price.value = p.price; f.elements.oldPrice.value = p.oldPrice ?? ''; f.elements.stock.value = p.stock; f.elements.description.value = p.description || '';
  $('#productFormTitle').textContent = 'تعديل المنتج'; $('#productFormError').textContent = ''; $('#productFormWrap').classList.remove('hidden'); $('#productFormWrap').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#newProductBtn').onclick = resetProductForm;
$('#cancelProductBtn').onclick = () => $('#productFormWrap').classList.add('hidden');
$('#productForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.currentTarget; const id = f.elements.id.value; const btn = $('#saveProductBtn');
  btn.disabled = true; btn.textContent = 'كنحفظو...'; $('#productFormError').textContent = '';
  try {
    const fd = new FormData(f); fd.delete('id');
    const url = id ? '/api/admin/products/'+encodeURIComponent(id) : '/api/admin/products';
    await api(url, {method:id?'PUT':'POST', body:fd});
    $('#productFormWrap').classList.add('hidden'); toast(id ? 'تحدّث المنتج.' : 'تزّاد المنتج.'); await refreshAll();
  } catch(err) { $('#productFormError').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'حفظ المنتج'; }
});
async function deleteProduct(id) {
  const p = products.find(x => x.id === id); if (!p || !confirm(`واش متأكد بغيتي تحذف "${p.name}"؟`)) return;
  try { await api('/api/admin/products/'+encodeURIComponent(id), {method:'DELETE'}); toast('تحذف المنتج.'); await refreshAll(); }
  catch(e) { toast(e.message); }
}
document.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
  $('#productsTab').classList.toggle('hidden', btn.dataset.tab !== 'products');
  $('#ordersTab').classList.toggle('hidden', btn.dataset.tab !== 'orders');
});
$('#refreshOrdersBtn').onclick = refreshAll;
checkLogin();
