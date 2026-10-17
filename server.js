require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(PUBLIC, 'uploads');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const STORE_WHATSAPP = String(process.env.STORE_WHATSAPP || '212654283265').replace(/\D/g, '');
const STORE_NAME = process.env.STORE_NAME || 'MODONSTORE';

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.startsWith('CHANGE-') || !SESSION_SECRET || SESSION_SECRET.startsWith('CHANGE-')) {
  console.warn('WARNING: Set ADMIN_PASSWORD and SESSION_SECRET in your .env file before using the admin panel publicly.');
}
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ products: [], orders: [] }, null, 2));

function readDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.products) || !Array.isArray(db.orders)) throw new Error('Invalid DB');
    return db;
  } catch (e) {
    console.error('Could not read data/db.json:', e.message);
    throw new Error('Store data could not be read.');
  }
}
function writeDB(db) {
  const temp = DB_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_FILE);
}
function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function makeId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET || 'development-only-secret').update(value).digest('hex');
}
function isAdmin(req) {
  const token = req.cookies?.modon_admin;
  if (!token || !SESSION_SECRET) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.user === ADMIN_USERNAME && data.exp > Date.now();
  } catch { return false; }
}
function cookieParse(req, res, next) {
  const raw = req.headers.cookie || '';
  req.cookies = {};
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  next();
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'خاصك تسجل الدخول من جديد.' });
  next();
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(5).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) return cb(new Error('الصورة خاصها تكون JPG أو PNG أو WEBP أو GIF.'));
    cb(null, true);
  }
});

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParse);
app.use(express.static(PUBLIC));
app.use('/assets', express.static(path.join(ROOT, 'assets')));

app.get('/api/config', (_req, res) => res.json({ storeName: STORE_NAME, whatsapp: STORE_WHATSAPP }));
app.get('/api/products', (_req, res) => {
  const db = readDB();
  res.json(db.products.filter(p => p.active !== false).map(({ id, name, category, price, oldPrice, stock, image, description }) =>
    ({ id, name, category, price, oldPrice, stock, image, description })));
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD || !SESSION_SECRET) return res.status(503).json({ error: 'الإعداد ناقص: عيّن ADMIN_PASSWORD و SESSION_SECRET فملف .env.' });
  const username = cleanText(req.body?.username, 100);
  const password = String(req.body?.password ?? '');
  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غير صحيحة.' });
  }
  const payload = Buffer.from(JSON.stringify({ user: ADMIN_USERNAME, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const token = payload + '.' + sign(payload);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `modon_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'modon_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAdmin, (_req, res) => res.json({ ok: true, username: ADMIN_USERNAME }));
app.get('/api/admin/products', requireAdmin, (_req, res) => res.json(readDB().products));
app.post('/api/admin/products', requireAdmin, upload.single('image'), (req, res) => {
  const name = cleanText(req.body.name, 150);
  const price = Number(req.body.price);
  const oldPrice = req.body.oldPrice === '' || req.body.oldPrice == null ? null : Number(req.body.oldPrice);
  const stock = Number(req.body.stock);
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'دخل اسم صحيح، ثمن صحيح، وكمية مخزون صحيحة.' });
  }
  const db = readDB();
  const product = {
    id: makeId('prd'), name,
    category: cleanText(req.body.category || 'عام', 80),
    price: Math.round(price * 100) / 100,
    oldPrice: Number.isFinite(oldPrice) && oldPrice >= 0 ? Math.round(oldPrice * 100) / 100 : null,
    stock,
    image: req.file ? '/uploads/' + req.file.filename : cleanText(req.body.image || '/assets/product-watch.png', 500),
    description: cleanText(req.body.description, 2000),
    active: req.body.active !== 'false',
    createdAt: new Date().toISOString()
  };
  db.products.unshift(product); writeDB(db);
  res.status(201).json(product);
});
app.put('/api/admin/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const db = readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'المنتج غير موجود.' });
  }
  const name = cleanText(req.body.name, 150);
  const price = Number(req.body.price);
  const stock = Number(req.body.stock);
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'راجع الاسم والثمن والمخزون.' });
  }
  product.name = name;
  product.category = cleanText(req.body.category || 'عام', 80);
  product.price = Math.round(price * 100) / 100;
  const oldPrice = req.body.oldPrice === '' || req.body.oldPrice == null ? null : Number(req.body.oldPrice);
  product.oldPrice = Number.isFinite(oldPrice) && oldPrice >= 0 ? Math.round(oldPrice * 100) / 100 : null;
  product.stock = stock;
  product.description = cleanText(req.body.description, 2000);
  product.active = req.body.active !== 'false';
  if (req.file) {
    const oldImage = product.image;
    product.image = '/uploads/' + req.file.filename;
    if (oldImage && oldImage.startsWith('/uploads/')) {
      const oldPath = path.join(UPLOAD_DIR, path.basename(oldImage));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  } else if (req.body.image) product.image = cleanText(req.body.image, 500);
  writeDB(db);
  res.json(product);
});
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود.' });
  db.products = db.products.filter(p => p.id !== req.params.id);
  if (product.image?.startsWith('/uploads/')) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(product.image));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  writeDB(db);
  res.json({ ok: true });
});

app.post('/api/orders', (req, res) => {
  const body = req.body || {};
  const customer = {
    name: cleanText(body.customer?.name, 120),
    phone: cleanText(body.customer?.phone, 30),
    city: cleanText(body.customer?.city, 100),
    address: cleanText(body.customer?.address, 500),
    note: cleanText(body.customer?.note, 1000)
  };
  if (!customer.name || !customer.phone || !customer.city || !customer.address) {
    return res.status(400).json({ error: 'الاسم والهاتف والمدينة والعنوان ضروريين.' });
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length || rawItems.length > 50) return res.status(400).json({ error: 'السلة فارغة أو فيها عدد كبير من المنتجات.' });
  const db = readDB();
  const items = [];
  for (const raw of rawItems) {
    const product = db.products.find(p => p.id === String(raw.id) && p.active !== false);
    const quantity = Number(raw.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ error: 'شي منتج ما بقاش متوفر أو الكمية غير صحيحة.' });
    if (product.stock < quantity) return res.status(409).json({ error: `الكمية المتوفرة من "${product.name}" هي ${product.stock} فقط.` });
    items.push({ productId: product.id, name: product.name, price: product.price, quantity, lineTotal: Math.round(product.price * quantity * 100) / 100 });
  }
  const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  const order = {
    id: makeId('ord').toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'جديد',
    paymentMethod: 'الدفع عند الاستلام',
    customer,
    items,
    subtotal,
    shipping: 0,
    total: subtotal
  };
  // Reserve stock at order creation. The store owner should confirm the order before dispatch.
  for (const item of items) {
    const p = db.products.find(x => x.id === item.productId);
    p.stock -= item.quantity;
  }
  db.orders.unshift(order);
  writeDB(db);
  const lines = [
    `طلب جديد من ${STORE_NAME}`,
    `رقم الطلب: ${order.id}`,
    `الاسم: ${customer.name}`,
    `الهاتف: ${customer.phone}`,
    `المدينة: ${customer.city}`,
    `العنوان: ${customer.address}`,
    `المنتجات:`,
    ...items.map(i => `- ${i.name} × ${i.quantity} = ${i.lineTotal} درهم`),
    `المجموع: ${order.total} درهم`,
    `الأداء: عند الاستلام`,
    customer.note ? `ملاحظة: ${customer.note}` : ''
  ].filter(Boolean);
  res.status(201).json({ orderId: order.id, total: order.total, whatsappUrl: `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}` });
});
app.get('/api/admin/orders', requireAdmin, (_req, res) => res.json(readDB().orders));
app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const allowed = ['جديد', 'تم التأكيد', 'قيد التوصيل', 'مكتمل', 'ملغي'];
  const status = cleanText(req.body?.status, 40);
  if (!allowed.includes(status)) return res.status(400).json({ error: 'حالة الطلب غير صحيحة.' });
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  if (status === 'ملغي' && order.status !== 'ملغي') {
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (product) product.stock += item.quantity;
    }
  }
  if (order.status === 'ملغي' && status !== 'ملغي') {
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (product && product.stock >= item.quantity) product.stock -= item.quantity;
      else return res.status(409).json({ error: 'المخزون ما كافيش لإعادة تفعيل هاد الطلب.' });
    }
  }
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(order);
});
app.get('/admin', (_req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'المسار غير موجود.' });
  res.sendFile(path.join(PUBLIC, 'index.html'), err => { if (err) next(err); });
});
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'الصورة كبيرة؛ الحد الأقصى 5MB.' : 'وقع مشكل فرفع الصورة.' });
  res.status(400).json({ error: err.message || 'وقع خطأ غير متوقع.' });
});

app.listen(PORT, () => console.log(`${STORE_NAME} running on http://localhost:${PORT}`));
