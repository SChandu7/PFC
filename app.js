/* =========================================================================
   PFC — Palnadu Fried Chicken · storefront + shop admin
   Single-file app. No framework. Talks to the Django REST backend.
   Auth: Firebase Phone Auth (OTP via Firebase, no server SMS needed)
   Payment: Cash on Delivery only
   ========================================================================= */
'use strict';

const CONFIG = {
  API: (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8001/api'
    : 'https://api.maheshp.in/api',
  CURRENCY: '₹',
  IMG: 'images/',                  // food illustrations folder
  SLIDE_MS: 5500,
  // ── Firebase config ─────────────────────────────────────────────────────
  // Replace ALL values below with your Firebase project's web config.
  // Firebase Console → Project Settings → Your apps → Web app → SDK setup
    apiKey:            'AIzaSyBEGbFLFx45Sk3MAV3B8E8ahXkMsptZX-w',
    authDomain:        'pfc-b8398.firebaseapp.com.', 
    projectId:         'pfc-b8398',
    storageBucket:     'pfc-b8398.firebasestorage.app',
    messagingSenderId: '660338865620',
    appId:             '1:660338865620:web:93bd2d6b061582cdce1241',
  },
};

/* ---------------------------------------------------------------- storage (safe) */
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { } },
};

/* ---------------------------------------------------------------- state */
const S = {
  access: store.get('pfc_access', ''),
  refresh: store.get('pfc_refresh', ''),
  user: JSON.parse(store.get('pfc_user', 'null')),
  shop: null, categories: [], products: [], addons: [], banners: [],
  cart: null, addresses: [],
  favs: new Set(JSON.parse(store.get('pfc_favs', '[]'))),
  filter: { cat: '', sub: '', food: '', size: '', q: '' },
  pickedVariant: {},                 // productId -> variantId
  admin: { tab: 'live', seen: new Set(), timer: null, sound: true },
};

/* ---------------------------------------------------------------- utils */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => CONFIG.CURRENCY + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FOOD_ICON = { VEG: '🥗', NONVEG: '🍗', EGG: '🥚' };
const icon = (id, cls = '') => '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + id + '"/></svg>';
const slugify = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const kfmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K+' : String(n);
const vegCls = t => 'veg-dot' + (t === 'NONVEG' ? ' is-nonveg' : t === 'EGG' ? ' is-egg' : '');

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind ? 'is-' + kind : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); }, 2800);
}
let busy = 0;
const loading = on => { busy += on ? 1 : -1; busy = Math.max(0, busy); $('#loader').hidden = busy === 0; };
const timeAgo = iso => {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  return h < 24 ? h + ' hr ago' : Math.floor(h / 24) + ' d ago';
};

/* ---------------------------------------------------------------- food photos
   Uploaded product/category photos (admin dashboard) always win. Until the
   shop uploads its own, each item shows the closest stock photo from
   images/food/ — matched on the product name first, then its category.   */
const PHOTO = n => CONFIG.IMG + 'food/' + n + '.webp';
const PHOTO_RULES = [
  [/party|mixed.*bucket/, 'party-bucket'], [/bucket/, 'bucket'], [/popcorn/, 'popcorn'],
  [/peri.?peri wing/, 'peri-wings'], [/wing/, 'hot-wings'],
  [/chicken.*fries/, 'fries-chicken'], [/cheese.*fries|loaded fries/, 'fries-cheese'], [/peri.*fries|masala fries/, 'fries-peri'], [/fries/, 'fries'],
  [/strip|tender|boneless|nugget/, 'strips'], [/leg|drum/, 'leg'],
  [/double patty|double burger/, 'burger-double'], [/zinger|spicy.*burger/, 'burger-zinger'], [/paneer burger/, 'burger-paneer'],
  [/veg.*burger|aloo/, 'burger-veg'], [/burger/, 'burger-crispy'],
  [/margherita/, 'pizza-margherita'], [/veg pizza|farm|veggie/, 'pizza-veg'], [/tikka.*pizza|bbq.*pizza/, 'pizza-tikka'], [/pizza|overloaded/, 'pizza-loaded'],
  [/club/, 'sandwich-club'], [/veg.*sandwich/, 'sandwich-veg'], [/sandwich|sub\b/, 'sandwich-grilled'],
  [/shawarma/, 'roll-shawarma'], [/paneer roll/, 'roll-paneer'], [/egg roll/, 'roll-egg'], [/roll|wrap|kathi|frankie/, 'roll-kathi'],
  [/ice ?cream waffle/, 'waffle-icecream'], [/double chocolate waffle/, 'waffle-double'], [/fruit waffle/, 'waffle-fruit'], [/waffle/, 'waffle-belgian'],
  [/sundae|brownie/, 'sundae'], [/choc.*scoop/, 'icecream-choc'], [/scoop|vanilla/, 'icecream-vanilla'], [/ice ?cream|cone|kulfi/, 'icecream'],
  [/strawberry/, 'shake-strawberry'], [/mango/, 'shake-mango'], [/oreo/, 'shake-oreo'], [/choc.*shake/, 'shake-choc'], [/shake|frappe|cold coffee/, 'shake'],
  [/mojito|mint/, 'mojito'], [/lagoon|blue/, 'blue-lagoon'], [/lime|lemon|nimbu/, 'juice-lime'], [/melon/, 'juice-melon'],
  [/mixed fruit|mix fruit/, 'juice-mixed'], [/juice|mocktail/, 'juice'],
  [/water/, 'water'], [/soft drink|soda|cola|pepsi|coke|sprite|thums|drink/, 'soft-drink'],
  [/chicken/, 'chicken-plate'],
];
const CAT_RULES = [
  [/chicken/, 'bucket'], [/burger/, 'burger-crispy'], [/pizza/, 'pizza-loaded'], [/sandwich/, 'sandwich-club'],
  [/roll|wrap/, 'roll-kathi'], [/fries/, 'fries'], [/waffle/, 'waffle-belgian'], [/\bice/, 'icecream'],
  [/shake/, 'shake'], [/juice/, 'juice-melon'], [/drink|beverage|mocktail/, 'blue-lagoon'], [/dessert/, 'sundae'],
];
const matchRule = (rules, txt) => { const t = String(txt || '').toLowerCase(); for (const [re, n] of rules) if (re.test(t)) return n; return ''; };
function artByText(txt, extra = '') {
  return PHOTO(matchRule(PHOTO_RULES, txt) || matchRule(PHOTO_RULES, txt + ' ' + extra) || matchRule(CAT_RULES, extra) || 'chicken-plate');
}
const artFor = p => p.image || artByText(p.name, (p.subcategory_name || '') + ' ' + (p.category_name || ''));
const catArt = c => c.image || PHOTO(matchRule(CAT_RULES, c.name + ' ' + (c.slug || '')) || 'chicken-plate');
const imgTag = (src, alt = '', eager) =>
  '<img src="' + esc(src) + '" alt="' + esc(alt) + '"' + (eager ? '' : ' loading="lazy"') +
  (/\.svg($|\?)/.test(src) ? '' : ' class="is-photo"') + '>';
const bubbleImg = (name, cls = '') => '<img class="bubble ' + cls + '" src="' + PHOTO(name) + '" alt="">';

/* ---------------------------------------------------------------- api */
async function api(path, { method = 'GET', body, auth = true, isForm = false } = {}, retry = true) {
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (auth && S.access) headers['Authorization'] = 'Bearer ' + S.access;

  const res = await fetch(CONFIG.API + path, {
    method, headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && retry && S.refresh) {
    const ok = await refreshToken();
    if (ok) return api(path, { method, body, auth, isForm }, false);
    signOut(true);
  }
  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch (_) { }
  if (!res.ok) {
    const msg = data?.detail
      || (data && typeof data === 'object' && Object.values(data).flat()[0])
      || 'Something went wrong. Please try again.';
    throw new Error(typeof msg === 'string' ? msg : 'Request failed');
  }
  return data;
}

async function refreshToken() {
  try {
    const r = await fetch(CONFIG.API + '/auth/token/refresh/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: S.refresh }),
    });
    if (!r.ok) return false;
    const d = await r.json();
    S.access = d.access;
    store.set('pfc_access', d.access);
    return true;
  } catch (_) { return false; }
}

function saveSession(d) {
  S.access = d.access; S.refresh = d.refresh; S.user = d.user;
  const ds = $('#demoStrip'); if (ds) ds.hidden = true;
  store.set('pfc_access', d.access);
  store.set('pfc_refresh', d.refresh);
  store.set('pfc_user', JSON.stringify(d.user));
  paintUser();
}
function signOut(silent) {
  api('/auth/logout/', { method: 'POST', body: { refresh: S.refresh } }).catch(() => { });
  S.access = S.refresh = ''; S.user = null; S.cart = null;
  ['pfc_access', 'pfc_refresh', 'pfc_user'].forEach(k => store.del(k));
  paintUser(); paintCartBadge();
  if (!silent) toast('Logged out.');
  if (location.hash.startsWith('#/admin')) location.hash = '#/';
  else if (location.hash.startsWith('#/profile')) paintProfile();
}

/* ---------------------------------------------------------------- preview menu */
/* no demo data — all content comes from the backend */

/* ---------------------------------------------------------------- boot */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  $('#year').textContent = new Date().getFullYear();
  bindChrome();
  initSlider();
  paintUser();
  paintSkeletons();
  await loadHome();
  if (S.user) { loadCart(); loadAddresses(); }
  window.addEventListener('hashchange', route);
  route();
}

async function loadHome() {
  let d = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(CONFIG.API + '/home/', { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) d = await res.json();
  } catch (_) { /* offline / not deployed yet */ }

  if (!d) {
    // Backend unreachable — show offline message, do not load demo data
    document.querySelector('#bestsellers').innerHTML =
      '<div style="text-align:center;padding:40px 20px;color:#888">' +
      '<div style="font-size:2rem">🔌</div>' +
      '<h3 style="margin:12px 0 6px">Server is unreachable</h3>' +
      '<p style="margin:0;font-size:0.9rem">Please try again in a moment.</p></div>';
    return;
  }
  S.shop = d.shop; S.categories = d.categories; S.products = d.products;
  S.banners = d.banners || []; S.addons = d.addons || [];
  paintShop(); paintHome(); paintCartBadge();
}

function paintSkeletons() {
  ['#bestsellers', '#newArrivals', '#sweetRow'].forEach(id => {
    $(id).innerHTML = '<div class="skel"></div>'.repeat(4);
  });
}

/* ---------------------------------------------------------------- chrome */
function bindChrome() {
  const nav = $('#nav'), scrim = $('#navScrim');
  const openNav = on => { nav.classList.toggle('is-open', on); scrim.hidden = !on; };
  $('#navToggle').onclick = () => openNav(true);
  $('#navClose').onclick = () => openNav(false);
  scrim.onclick = () => openNav(false);

  $('#cartBtn').onclick = openCart;
  $('#tabCart').onclick = openCart;
  $('#cartBar').onclick = openCart;
  $('#authBtn').onclick = () => openAuth();
  $('#logoutBtn').onclick = () => signOut();
  $('#filterBtn').onclick = () => {
    if (!location.hash.startsWith('#/menu')) location.hash = '#/menu';
    setTimeout(() => {
      const f = $('#filters');
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      f.classList.add('flash'); setTimeout(() => f.classList.remove('flash'), 1200);
    }, 80);
  };

  let t;
  $('#searchInput').oninput = e => {
    clearTimeout(t);
    t = setTimeout(() => {
      S.filter.q = e.target.value.trim().toLowerCase();
      if (!location.hash.startsWith('#/menu')) location.hash = '#/menu';
      else paintMenu();
    }, 220);
  };
  $('#searchInput').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close-cart]') || e.target.id === 'cartDrawer') closeCart();
    if (e.target.id === 'modal' || e.target.closest('[data-close-modal]')) closeModal();
    if (e.target.closest('.nav a')) openNav(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeCart(); openNav(false); } });

  const head = $('#header');
  const onScroll = () => head.classList.toggle('is-scrolled', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}

function paintShop() {
  const s = S.shop; if (!s) return;
  const open = s.is_open && s.accepting_orders;
  const pill = $('#shopPill'); pill.hidden = false;
  pill.classList.toggle('is-closed', !open);
  $('#shopPillText').textContent = open ? 'Open now' : 'Closed';
  $('#statEta').textContent = s.avg_delivery_minutes;
  $('#statItems').textContent = S.products.length;
  $('#callBtn').href = 'tel:' + (s.phone || '');
  $('#waBtn').href = 'https://wa.me/91' + (s.whatsapp || s.phone || '').replace(/\D/g, '') +
    '?text=' + encodeURIComponent('Hi PFC, please send me the menu.');
  $('#footAddr').textContent = s.address || '';
  $('#aboutInfo').innerHTML = [
    ['Call us', s.phone], ['WhatsApp', s.whatsapp || s.phone], ['Address', s.address],
    ['Hours', (s.opens_at || '').slice(0, 5) + ' – ' + (s.closes_at || '').slice(0, 5)],
    ['Delivery radius', s.delivery_radius_km + ' km'],
    ['Free delivery above', money(s.free_delivery_above)],
    ['Minimum order', money(s.min_order_value)],
    ['Average delivery', s.avg_delivery_minutes + ' min'],
  ].map(([k, v]) => '<div class="info-card"><h4>' + esc(k) + '</h4><p>' + esc(v || '—') + '</p></div>').join('');
}

function paintUser() {
  const u = S.user;
  $('#authBtn').hidden = !!u;
  $('#userChip').hidden = !u;
  const first = u ? (u.full_name || '').split(' ')[0] : '';
  $('#helloLine').textContent = first ? 'Hello, ' + first + '! 👋' : 'Hello, Chicken Lover! 👋';
  if (u) {
    $('#userName').textContent = first || (u.phone || 'Guest');
    $('#userAvatar').textContent = (u.full_name || u.phone || 'G')[0].toUpperCase();
    $('#adminLink').hidden = !u.is_shop_admin;
    $('#riderLink').hidden = !u.is_rider;
  }
}

/* ---------------------------------------------------------------- router */
function route() {
  const parts = location.hash.replace(/^#\//, '').split('/');
  let view = parts[0] || 'home';
  const arg = decodeURIComponent(parts[1] || '');
  const known = ['home', 'menu', 'offers', 'orders', 'order', 'profile', 'addresses', 'about', 'admin', 'rider'];
  if (!known.includes(view)) view = 'home';

  $$('.route').forEach(r => r.hidden = r.dataset.route !== view);
  $$('.nav a').forEach(a => a.classList.toggle('is-on', a.dataset.nav === view));
  $$('[data-tab-nav]').forEach(a => a.classList.toggle('is-on', a.dataset.tabNav === (view === 'order' ? 'orders' : view === 'addresses' ? 'profile' : view)));
  document.body.classList.toggle('is-admin', view === 'admin');
  document.body.classList.toggle('is-rider', view === 'rider');
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'home') paintHome();
  else if (view === 'menu') { S.filter.cat = arg; S.filter.sub = ''; paintMenu(); }
  else if (view === 'offers') paintOffers();
  else if (view === 'orders') loadOrders();
  else if (view === 'order') loadOrderDetail(arg);
  else if (view === 'profile') paintProfile();
  else if (view === 'addresses') loadAddresses(true);
  else if (view === 'admin') openAdmin();
  else if (view === 'rider') openRider();

  if (view !== 'admin' && S.admin.timer) { clearInterval(S.admin.timer); S.admin.timer = null; stopAlarm(); }
  if (view !== 'rider' && S.riderTimer) { clearInterval(S.riderTimer); S.riderTimer = null; }
  paintCartBar();
}

/* ---------------------------------------------------------------- hero slider */
let slideIdx = 0, slideTimer = null;
function initSlider() {
  const track = $('#heroTrack'), dots = $('#heroDots');
  const paintDots = () => {
    const n = $$('.slide', track).length;
    dots.innerHTML = Array.from({ length: n }, (_, i) =>
      '<button aria-label="Slide ' + (i + 1) + '"' + (i === slideIdx ? ' class="is-on"' : '') + ' data-slide="' + i + '"></button>').join('');
  };
  window.goSlide = i => {
    const slides = $$('.slide', track);
    if (!slides.length) return;
    slideIdx = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle('is-on', k === slideIdx));
    $('#hero').classList.toggle('is-gold', slides[slideIdx].classList.contains('slide--gold'));
    paintDots();
  };
  const auto = () => { clearInterval(slideTimer); slideTimer = setInterval(() => goSlide(slideIdx + 1), CONFIG.SLIDE_MS); };
  dots.onclick = e => { const b = e.target.closest('[data-slide]'); if (b) { goSlide(+b.dataset.slide); auto(); } };

  let x0 = null;
  track.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { goSlide(slideIdx + (dx < 0 ? 1 : -1)); auto(); }
  });
  $('#hero').addEventListener('mouseenter', () => clearInterval(slideTimer));
  $('#hero').addEventListener('mouseleave', auto);
  document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(slideTimer) : auto());
  goSlide(0); auto();
}
function paintBannerSlides() {
  const track = $('#heroTrack');
  $$('.slide--photo', track).forEach(s => s.remove());
  S.banners.filter(b => b.image).forEach(b => {
    const a = document.createElement('a');
    a.className = 'slide slide--photo';
    a.href = '#/menu' + (b.target_category ? '/' + catSlug(b.target_category) : '');
    a.innerHTML = '<div class="slide__bg"><img src="' + esc(b.image) + '" alt="" loading="lazy"></div>' +
      '<div class="slide__glass"><span class="eyebrow"><i class="live-dot"></i>PFC special</span><h1>' + esc(b.title) + '</h1>' +
      (b.subtitle ? '<p>' + esc(b.subtitle) + '</p>' : '') +
      '<div class="slide__cta"><span class="btn btn--primary">Order now ' + icon('arrow') + '</span></div></div>';
    track.appendChild(a);
  });
  goSlide(slideIdx);
}

/* ---------------------------------------------------------------- home */
function paintHome() {
  if (!S.products.length) return;
  paintBannerSlides();

  $('#catRail').innerHTML =
    '<a class="cat cat--all is-on" href="#/menu"><span class="cat__ico">' + icon('grid') + '</span><span>All</span></a>' +
    S.categories.map(c =>
      '<a class="cat" href="#/menu/' + esc(c.slug) + '"><span class="cat__ico">' + imgTag(catArt(c), c.name) + '</span>' +
      '<span>' + esc(c.name) + '</span></a>').join('');

  const avail = S.products.filter(p => p.is_available !== false);
  const best = avail.filter(p => p.is_bestseller);
  $('#bestsellers').innerHTML = (best.length ? best : avail).slice(0, 10).map(cardHTML).join('');
  const fresh = avail.filter(p => p.is_new);
  $('#newArrivals').innerHTML = fresh.slice(0, 10).map(cardHTML).join('');
  $('#newArrivals').previousElementSibling.hidden = !fresh.length;
  const sweet = avail.filter(p => /waffle|ice|shake|sundae|dessert/i.test(p.category_name + ' ' + p.name));
  $('#sweetRow').innerHTML = sweet.slice(0, 10).map(cardHTML).join('');
  $('#sweetRow').previousElementSibling.hidden = !sweet.length;
}
const countIn = id => S.products.filter(p => p.category === id).length;
const catSlug = id => (S.categories.find(c => c.id === id) || {}).slug || '';

/* ---------------------------------------------------------------- cards */
const activeVariants = p => (p.variants || []).filter(v => v.is_active);
function variantOf(p) {
  const list = activeVariants(p);
  const picked = S.pickedVariant[p.id];
  return list.find(v => v.id === picked) || list.find(v => v.is_default) || list[0];
}
const cheapest = p => activeVariants(p).slice().sort((a, b) => a.price - b.price)[0];

function badgeFor(p, v) {
  if (v && v.discount_percent >= 5) return '<span class="card__badge card__badge--save">Save ' + v.discount_percent + '%</span>';
  if (p.is_bestseller) return '<span class="card__badge">Bestseller</span>';
  if (p.is_new) return '<span class="card__badge card__badge--new">New</span>';
  return '';
}

function cardHTML(p) {
  const list = activeVariants(p);
  const v = cheapest(p) || variantOf(p);
  const out = p.is_available === false || !v || v.in_stock === false;
  const many = list.length > 1;
  const fav = S.favs.has(String(p.id));
  const rating = Number(p.rating || 0);

  return '<article class="card' + (out ? ' is-out' : '') + '" data-pid="' + esc(p.id) + '">' +
    '<div class="card__media" data-open="' + esc(p.id) + '">' + badgeFor(p, v) +
    '<button class="fav' + (fav ? ' is-on' : '') + '" data-fav="' + esc(p.id) + '" aria-label="Save to favourites">' + icon('heart') + '</button>' +
    imgTag(artFor(p), p.name) + '</div>' +
    '<div class="card__body">' +
    '<div class="card__title" data-open="' + esc(p.id) + '"><i class="' + vegCls(p.food_type) + '"></i><h3>' + esc(p.name) + '</h3></div>' +
    (p.short_description ? '<p class="card__desc">' + esc(p.short_description) + '</p>' : '') +
    '<div class="card__meta">' + (rating ? '<span class="rating">' + rating.toFixed(1) + '</span>' : '') +
    (p.rating_count ? '<span>(' + kfmt(p.rating_count) + ')</span>' : '') +
    (many ? '<span>· ' + list.length + ' sizes</span>' : (v && v.label ? '<span>· ' + esc(v.label) + '</span>' : '')) + '</div>' +
    '<div class="card__foot">' +
    '<span class="price">' + (many ? '<span class="from">from</span>' : '') + money(v ? v.price : 0) +
    (v && v.mrp && Number(v.mrp) > Number(v.price) ? '<small>' + money(v.mrp) + '</small>' : '') + '</span>' +
    (out ? '<span class="sold-out">Sold out</span>'
      : '<button class="add-btn" data-add="' + (v ? v.id : '') + '" data-p="' + esc(p.id) + '" aria-label="Add ' + esc(p.name) + '">' + icon('plus') + '</button>') +
    '</div></div></article>';
}

document.addEventListener('click', e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    e.stopPropagation();
    const id = fav.dataset.fav;
    S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    store.set('pfc_favs', JSON.stringify([...S.favs]));
    $$('[data-fav="' + CSS.escape(id) + '"]').forEach(b => { b.classList.toggle('is-on', S.favs.has(id)); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); });
    toast(S.favs.has(id) ? 'Saved to favourites' : 'Removed from favourites');
    return;
  }
  const add = e.target.closest('[data-add]');
  if (add) {
    const p = S.products.find(x => String(x.id) === add.dataset.p);
    if (p && ((p.addons || []).length || activeVariants(p).length > 1)) openProduct(p);
    else addToCart(Number(add.dataset.add), 1);
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) {
    const p = S.products.find(x => String(x.id) === open.dataset.open);
    if (p) openProduct(p);
  }
});
function repaintCards() {
  if (location.hash.startsWith('#/menu')) paintMenu(); else paintHome();
}

/* ---------------------------------------------------------------- menu */
function paintMenu() {
  const f = S.filter;
  $('#filterCats').innerHTML =
    '<button class="cat cat--all' + (f.cat ? '' : ' is-on') + '" data-cat=""><span class="cat__ico">' + icon('grid') + '</span><span>All</span></button>' +
    S.categories.map(c => '<button class="cat' + (f.cat === c.slug ? ' is-on' : '') + '" data-cat="' + esc(c.slug) + '">' +
      '<span class="cat__ico">' + imgTag(catArt(c), c.name) + '</span><span>' + esc(c.name) + '</span></button>').join('');
  const on = $('#filterCats .cat.is-on');
  if (on && f.cat) on.scrollIntoView({ block: 'nearest', inline: 'center' });

  const cat = S.categories.find(c => c.slug === f.cat);
  $('#subRail').innerHTML = cat && cat.subcategories.length > 1
    ? '<button class="chip' + (f.sub ? '' : ' is-on') + '" data-sub="">All ' + esc(cat.name) + '</button>' +
    cat.subcategories.map(s => '<button class="chip' + (f.sub === s.slug ? ' is-on' : '') + '" data-sub="' + esc(s.slug) + '">' +
      esc(s.name) + '</button>').join('')
    : '';

  $$('#filterFood .chip').forEach(b => b.classList.toggle('is-on', b.dataset.food === f.food));
  $$('#filterPrice .chip').forEach(b => b.classList.toggle('is-on', b.dataset.price === f.size));

  let list = S.products.slice();
  if (f.cat) list = list.filter(p => catSlug(p.category) === f.cat);
  if (f.sub) list = list.filter(p => p.subcategory_name && subSlug(p) === f.sub);
  if (f.food) list = list.filter(p => p.food_type === f.food);
  if (f.size) list = list.filter(p => activeVariants(p).some(v => v.size === f.size));
  if (f.q) list = list.filter(p => (p.name + ' ' + p.short_description + ' ' + p.category_name + ' ' + p.subcategory_name).toLowerCase().includes(f.q));

  $('#menuTitle').textContent = cat ? cat.name : (f.q ? 'Results for "' + f.q + '"' : 'Full menu');
  $('#menuCount').textContent = list.length + ' item' + (list.length === 1 ? '' : 's') + (cat && cat.tagline ? ' · ' + cat.tagline : '');
  $('#menuGrid').innerHTML = list.map(cardHTML).join('');
  $('#menuEmpty').hidden = list.length > 0;
}
function subSlug(p) {
  for (const c of S.categories) {
    const s = c.subcategories.find(x => x.id === p.subcategory);
    if (s) return s.slug;
  }
  return '';
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cat]');
  if (c) { const slug = c.dataset.cat; location.hash = '#/menu' + (slug ? '/' + slug : ''); if (S.filter.cat === slug) paintMenu(); }
  const s = e.target.closest('[data-sub]');
  if (s) { S.filter.sub = s.dataset.sub; paintMenu(); }
  const fd = e.target.closest('[data-food]');
  if (fd) { S.filter.food = fd.dataset.food; paintMenu(); }
  const pr = e.target.closest('[data-price]');
  if (pr) { S.filter.size = pr.dataset.price; paintMenu(); }
  if (e.target.id === 'clearFilters') {
    S.filter = { cat: '', sub: '', food: '', size: '', q: '' }; $('#searchInput').value = '';
    if (location.hash !== '#/menu') location.hash = '#/menu'; else paintMenu();
  }
});

/* ---------------------------------------------------------------- offers */
function paintOffers() {
  const deals = S.products.filter(p => activeVariants(p).some(v => v.discount_percent > 0));
  const coupons = [
    ['PFC50', 'Flat ₹50 OFF', 'On your first order above ₹299', 'bucket'],
    ['', 'Free delivery', 'On every order above ' + money(S.shop?.free_delivery_above || 499), 'burger-crispy'],
  ];
  $('#couponList').innerHTML = coupons.map(([code, h, p, img]) =>
    '<div class="coupon-card"><img src="' + PHOTO(img) + '" alt="">' +
    '<div><h4>' + esc(h) + '</h4><p>' + esc(p) + '</p>' + (code ? '<code>' + code + '</code>' : '') + '</div>' +
    (code ? '<button class="btn btn--ghost btn--sm" data-copy="' + code + '">Copy</button>' : '') + '</div>').join('');
  $$('[data-copy]').forEach(b => b.onclick = () => {
    navigator.clipboard?.writeText(b.dataset.copy).catch(() => { });
    toast('Code ' + b.dataset.copy + ' copied — apply it in your cart', 'ok');
  });
  $('#offerGrid').innerHTML = deals.map(cardHTML).join('') ||
    '<p class="muted">No discounts running right now — check back soon.</p>';
}

/* ---------------------------------------------------------------- profile */
function paintProfile() {
  const u = S.user;
  const favs = S.products.filter(p => S.favs.has(String(p.id)));
  const li = (href, ico, label, end = '', id = '') =>
    '<a href="' + href + '"' + (id ? ' id="' + id + '"' : '') + '><span class="ico">' + icon(ico) + '</span>' + label +
    '<span class="end">' + end + icon('chev') + '</span></a>';
  $('#profileBody').innerHTML =
    '<div class="profile-card"><span class="avatar">' + esc(u ? (u.full_name || u.phone || 'G')[0].toUpperCase() : '🍗') + '</span>' +
    '<div><h2>' + esc(u ? (u.full_name || 'PFC fan') : 'Welcome to PFC') + '</h2><p>' +
    esc(u ? ('+91 ' + (u.phone || '')) : 'Sign in to order, save addresses and track deliveries.') + '</p>' +
    (u ? '' : '<button class="btn btn--light btn--sm" id="pfSignIn" style="margin-top:10px">Sign in with mobile</button>') +
    '</div>' + bubbleImg('bucket') + '</div>' +
    '<div class="menu-list">' +
    li('#/orders', 'receipt', 'My orders') +
    li('#/addresses', 'pin', 'Saved addresses', S.addresses.length ? S.addresses.length + '' : '') +
    li('#/offers', 'tag', 'Offers & coupons') +
    (u && u.is_shop_admin ? li('#/admin', 'cog', 'Admin dashboard') : '') +
    (u && u.is_rider ? li('#/rider', 'bike', 'My deliveries') : '') +
    '</div>' +
    '<div class="menu-list">' +
    li('tel:' + (S.shop?.phone || ''), 'phone', 'Call the shop', esc(S.shop?.phone || '')) +
    li($('#waBtn').href || '#', 'chat', 'Order on WhatsApp') +
    li('#/about', 'flame', 'About PFC') +
    (u ? '<button id="pfLogout"><span class="ico">' + icon('logout') + '</span>Log out</button>' : '') +
    '</div>' +
    (favs.length ? '<div class="section-head"><h2>Your favourites ❤️</h2></div><div class="grid">' + favs.map(cardHTML).join('') + '</div>' : '');
  const si = $('#pfSignIn'); if (si) si.onclick = () => openAuth(paintProfile);
  const lo = $('#pfLogout'); if (lo) lo.onclick = () => signOut();
}

/* ---------------------------------------------------------------- product sheet */
function openProduct(p) {
  const variants = activeVariants(p);
  let vid = (variantOf(p) || variants[0] || {}).id;
  let qty = 1;
  const chosen = new Set();
  const addons = p.addons || [];

  const render = () => {
    const v = variants.find(x => x.id === vid) || {};
    const addTotal = [...chosen].reduce((a, id) => a + Number((addons.find(x => x.id === id) || {}).price || 0), 0);
    modal(
      '<button class="icon-btn icon-btn--soft modal-x" data-close-modal aria-label="Close">' + icon('close') + '</button>' +
      '<div class="sheet__media">' + badgeFor(p, v) + imgTag(artFor(p), p.name, true) + '</div>' +
      '<div class="sheet__title"><i class="' + vegCls(p.food_type) + '"></i><h3>' + esc(p.name) + '</h3></div>' +
      '<div class="sheet__meta">' + (Number(p.rating) ? '<span class="rating">' + Number(p.rating).toFixed(1) + '</span>' : '') +
      (p.rating_count ? '<span>' + kfmt(p.rating_count) + ' ratings</span>' : '') + '<span>' + esc(p.category_name || '') + '</span></div>' +
      '<p class="sub">' + esc(p.short_description || p.description || '') + '</p>' +
      (variants.length > 1 ? '<div class="field"><label>Choose your size</label><div class="opt-list" id="pvChips">' +
        variants.map(x => '<button class="opt' + (x.id === vid ? ' is-on' : '') + '" data-v="' + x.id + '"><span>' +
          esc(x.label || x.size_display) + '</span><span>' +
          (x.mrp && Number(x.mrp) > Number(x.price) ? '<small>' + money(x.mrp) + '</small>' : '') + money(x.price) + '</span></button>').join('') +
        '</div></div>' : '') +
      (addons.length ? '<div class="field"><label>Add-ons</label><div class="chips" id="pvAddons">' +
        addons.map(a => '<button class="chip' + (chosen.has(a.id) ? ' is-on' : '') + '" data-a="' + a.id + '">' +
          esc(a.name) + ' +' + money(a.price) + '</button>').join('') + '</div></div>' : '') +
      '<div class="field"><label>Cooking note (optional)</label><input id="pvNote" placeholder="Extra spicy, no onion…" maxlength="140"></div>' +
      '<div class="sheet__foot"><div class="qty qty--lg"><button id="pvMinus" aria-label="Less">−</button><span>' + qty + '</span><button id="pvPlus" aria-label="More">+</button></div>' +
      '<button class="btn btn--primary btn--lg" id="pvAdd">Add · ' + money((Number(v.price || 0) + addTotal) * qty) + '</button></div>'
    );
    const note = $('#pvNote'); note.value = render.note || ''; note.oninput = () => render.note = note.value;
    $$('#pvChips .opt').forEach(b => b.onclick = () => { vid = Number(b.dataset.v); S.pickedVariant[p.id] = vid; render(); });
    $$('#pvAddons .chip').forEach(b => b.onclick = () => {
      const id = Number(b.dataset.a);
      chosen.has(id) ? chosen.delete(id) : chosen.add(id);
      render();
    });
    $('#pvMinus').onclick = () => { if (qty > 1) { qty--; render(); } };
    $('#pvPlus').onclick = () => { if (qty < 20) { qty++; render(); } };
    $('#pvAdd').onclick = () => addToCart(vid, qty, [...chosen], note.value.trim());
  };
  render();
}

/* ---------------------------------------------------------------- preview cart (no server) */

/* ---------------------------------------------------------------- cart */
async function loadCart() {
  if (!S.user) return;
  try { S.cart = await api('/cart/'); paintCartBadge(); paintCart(); } catch (_) { }
}
function paintCartBadge() {
  const n = S.cart ? S.cart.item_count : 0;
  const b = $('#cartBadge'); b.hidden = !n; b.textContent = n;
  const t = $('#tabCartCount'); t.hidden = !n; t.textContent = n;
  paintCartBar();
}
function paintCartBar() {
  const c = S.cart, n = c ? c.item_count : 0;
  const hide = !n || ['#/admin', '#/order/'].some(h => location.hash.startsWith(h)) || !$('#cartDrawer').hidden;
  $('#cartBar').hidden = hide;
  if (n) {
    $('#cartBarCount').textContent = n + ' item' + (n === 1 ? '' : 's') + ' added';
    $('#cartBarTotal').textContent = money(c.totals.subtotal) + ' + taxes';
  }
}
function bumpCart() {
  const f = $('.tabbar__fab'); f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump');
}
async function addToCart(variantId, qty = 1, addon_ids = [], note = '') {
  if (!variantId) return;
  if (!S.user) { openAuth(() => addToCart(variantId, qty, addon_ids, note)); return; }
  if (S.shop && !(S.shop.is_open && S.shop.accepting_orders)) { toast(S.shop.closed_message, 'err'); return; }
  try {
    loading(true);
    S.cart = await api('/cart/', { method: 'POST', body: { variant: variantId, quantity: qty, addon_ids, note } });
    paintCartBadge(); paintCart(); closeModal(); bumpCart(); toast('Added to cart', 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}
async function setQty(itemId, qty) {
  try {
    S.cart = await api('/cart/items/' + itemId + '/', { method: 'PATCH', body: { quantity: qty } });
    paintCartBadge(); paintCart();
  } catch (e) { toast(e.message, 'err'); }
}
function openCart() {
  if (!S.user) { openAuth(openCart); return; }
  $('#cartDrawer').hidden = false; document.body.classList.add('no-scroll'); paintCart(); paintCartBar();
}
function closeCart() { $('#cartDrawer').hidden = true; document.body.classList.remove('no-scroll'); paintCartBar(); }

function paintCart() {
  const c = S.cart;
  const body = $('#cartBody');
  if (!c || !c.items.length) {
    body.innerHTML = '<div class="empty">' + bubbleImg('bucket', 'empty__img float-a') +
      '<h3>Your cart is empty</h3><p>Add something crispy.</p>' +
      '<a class="btn btn--primary" href="#/menu" data-close-cart>Browse the menu</a></div>';
    $('#cartFoot').hidden = true; return;
  }
  body.innerHTML = c.items.map(i =>
    '<div class="cart-row">' +
    '<div class="cart-row__img">' + imgTag(i.product_image || artByText(i.product_name), '') + '</div>' +
    '<div class="cart-row__mid"><h4>' + esc(i.product_name) + '</h4>' +
    '<small>' + esc(i.variant_label) + (i.addons.length ? ' · ' + i.addons.map(a => esc(a.name)).join(', ') : '') + '</small>' +
    (i.note ? '<small>✎ ' + esc(i.note) + '</small>' : '') +
    (i.is_available ? '' : '<small style="color:var(--red)">Unavailable — remove to continue</small>') +
    '</div>' +
    '<div class="cart-row__right"><strong>' + money(i.line_total) + '</strong>' +
    '<div class="qty"><button data-q="' + i.id + '" data-n="' + (i.quantity - 1) + '" aria-label="Less">−</button>' +
    '<span>' + i.quantity + '</span>' +
    '<button data-q="' + i.id + '" data-n="' + (i.quantity + 1) + '" aria-label="More">+</button></div></div></div>').join('');

  const t = c.totals;
  const freeAt = Number(S.shop?.free_delivery_above || 0);
  const gap = freeAt - (Number(t.subtotal) - Number(t.discount));
  $('#cartBill').innerHTML =
    (gap > 0 && Number(t.delivery_fee) ? '<div class="row is-off" style="font-weight:600">Add ' + money(gap) + ' more for free delivery 🛵</div>' : '') +
    row('Item total', money(t.subtotal)) +
    (Number(t.discount) > 0 ? row('Coupon ' + (c.coupon_code || ''), '−' + money(t.discount), 'is-off') : '') +
    row('Delivery', Number(t.delivery_fee) ? money(t.delivery_fee) : 'FREE') +
    row('Packing', money(t.packing_fee)) +
    row('GST', money(t.tax)) +
    row('To pay', money(t.grand_total), 'is-total');
  $('#cartFoot').hidden = false;
  $$('[data-q]', body).forEach(b => b.onclick = () => setQty(b.dataset.q, Number(b.dataset.n)));
  $('#couponBtn').onclick = applyCoupon;
  $('#checkoutBtn').onclick = openCheckout;
  $('#couponInput').value = c.coupon_code || '';
}
const row = (k, v, cls = '') => '<div class="row ' + cls + '"><span>' + esc(k) + '</span><span>' + v + '</span></div>';

async function applyCoupon() {
  const code = $('#couponInput').value.trim();
  try {
    loading(true);
    S.cart = code
      ? await api('/cart/coupon/', { method: 'POST', body: { code } })
      : await api('/cart/coupon/', { method: 'DELETE' });
    paintCart(); toast(code ? 'Coupon applied' : 'Coupon removed', 'ok');
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}

/* ---------------------------------------------------------------- auth (Firebase Phone Auth) */
// Firebase is loaded via ES module imports below — no global window.firebase needed.
// index.html has NO script tags for Firebase; we import on demand.

const FB_CDN = ‘https://www.gstatic.com/firebasejs/10.12.0/’;

let _fbApp  = null;
let _fbAuth = null;
let _recaptchaVerifier = null;

async function initFirebase() {
  if (_fbAuth) return _fbAuth;
  const { initializeApp, getApps, getApp } = await import(FB_CDN + ‘firebase-app.js’);
  const { getAuth } = await import(FB_CDN + ‘firebase-auth.js’);
  _fbApp  = getApps().length ? getApp() : initializeApp(CONFIG.FIREBASE);
  _fbAuth = getAuth(_fbApp);
  return _fbAuth;
}

async function getRecaptchaVerifier(fbAuth) {
  // Always create a fresh verifier — reusing a cleared one causes errors
  if (_recaptchaVerifier) {
    try { _recaptchaVerifier.clear(); } catch (_) {}
    _recaptchaVerifier = null;
  }
  const { RecaptchaVerifier } = await import(FB_CDN + ‘firebase-auth.js’);
  let anchor = document.getElementById(‘recaptcha-container’);
  if (!anchor) {
    anchor = document.createElement(‘div’);
    anchor.id = ‘recaptcha-container’;
    document.body.appendChild(anchor);
  }
  _recaptchaVerifier = new RecaptchaVerifier(fbAuth, anchor, { size: ‘invisible’ });
  await _recaptchaVerifier.render();   // pre-render so it’s ready
  return _recaptchaVerifier;
}

function openAuth(after) {
  let phone = ‘’;
  let confirmationResult = null;

  const step1 = () => {
    modal(
      ‘<div class="sheet__media" style="aspect-ratio:16/7">’ + imgTag(PHOTO(‘chicken-plate’), ‘’, true) + ‘</div>’ +
      ‘<h3>Sign in to order</h3>’ +
      ‘<p class="sub">We\’ll send you a 6-digit OTP.</p>’ +
      ‘<div class="field"><label>Mobile number</label>’ +
      ‘<div style="display:flex;gap:8px;align-items:center">’ +
      ‘<span style="padding:10px 12px;background:var(--surface-2);border-radius:10px;font-weight:600">+91</span>’ +
      ‘<input id="auPhone" type="tel" maxlength="10" placeholder="10-digit number" inputmode="numeric" style="flex:1">’ +
      ‘</div></div>’ +
      ‘<button class="btn btn--primary btn--block btn--lg" id="auSend">Send OTP</button>’
    );
    $(‘#auPhone’).focus();
    $(‘#auSend’).onclick = async () => {
      phone = $(‘#auPhone’).value.replace(/\D/g, ‘’);
      if (!/^[6-9]\d{9}$/.test(phone)) return toast(‘Enter a valid 10-digit number’, ‘err’);
      try {
        loading(true);
        const fbAuth   = await initFirebase();
        const verifier = await getRecaptchaVerifier(fbAuth);
        const { signInWithPhoneNumber } = await import(FB_CDN + ‘firebase-auth.js’);
        confirmationResult = await signInWithPhoneNumber(fbAuth, ‘+91’ + phone, verifier);
        step2();
      } catch (e) {
        console.error(‘Firebase OTP send error:’, e);
        toast(e.message || ‘Failed to send OTP. Try again.’, ‘err’);
      } finally { loading(false); }
    };
    $(‘#auPhone’).onkeydown = e => { if (e.key === ‘Enter’) $(‘#auSend’).click(); };
  };

  const step2 = () => {
    modal(
      ‘<h3>Enter the OTP</h3>’ +
      ‘<p class="sub">Sent to +91 ‘ + esc(phone) + ‘</p>’ +
      ‘<div class="otp-boxes">’ +
      [0,1,2,3,4,5].map(i => ‘<input maxlength="1" inputmode="numeric" data-o="’ + i + ‘">’).join(‘’) +
      ‘</div>’ +
      ‘<div class="field"><label>Your name (new here?)</label><input id="auName" placeholder="Name (optional)"></div>’ +
      ‘<button class="btn btn--primary btn--block btn--lg" id="auVerify">Verify &amp; continue</button>’ +
      ‘<button class="btn btn--ghost btn--block btn--sm" style="margin-top:10px" id="auBack">Change number</button>’
    );
    const boxes = $$(‘[data-o]’);
    boxes[0].focus();
    boxes.forEach((b, i) => {
      b.oninput = () => {
        b.value = b.value.replace(/\D/g, ‘’);       // digits only
        if (b.value && i < boxes.length - 1) boxes[i + 1].focus();
        if (boxes.every(x => x.value)) $(‘#auVerify’).click();
      };
      b.onkeydown = e => {
        if (e.key === ‘Backspace’ && !b.value && i) boxes[i - 1].focus();
      };
      // allow pasting full OTP into first box
      b.onpaste = e => {
        const txt = (e.clipboardData || window.clipboardData).getData(‘text’).replace(/\D/g, ‘’);
        if (txt.length === 6) {
          e.preventDefault();
          boxes.forEach((x, j) => { x.value = txt[j] || ‘’; });
          $(‘#auVerify’).click();
        }
      };
    });
    $(‘#auBack’).onclick = step1;
    $(‘#auVerify’).onclick = async () => {
      const code = boxes.map(b => b.value).join(‘’);
      if (code.length < 6) return toast(‘Enter the full 6-digit OTP’, ‘err’);
      try {
        loading(true);
        const result  = await confirmationResult.confirm(code);
        const idToken = await result.user.getIdToken();
        const d = await api(‘/auth/firebase/’, {
          method: ‘POST’, auth: false,
          body: { id_token: idToken, full_name: ($(‘#auName’) ? $(‘#auName’).value.trim() : ‘’) },
        });
        saveSession(d); closeModal();
        toast(‘Welcome’ + (d.user.full_name ? ‘, ‘ + d.user.full_name.split(‘ ‘)[0] : ‘’) + ‘! 🎉’, ‘ok’);
        if (d.user.is_rider) { location.hash = ‘#/rider’; return; }
        await loadCart(); await loadAddresses();
        if (after) after();
      } catch (e) {
        console.error(‘Firebase OTP verify error:’, e);
        const msg = e.code === ‘auth/invalid-verification-code’
          ? ‘Wrong OTP — please check and try again.’
          : (e.message || ‘Verification failed. Try again.’);
        toast(msg, ‘err’);
        boxes.forEach(b => b.value = ‘’); boxes[0].focus();
      } finally { loading(false); }
    };
  };

  step1();
}

/* ---------------------------------------------------------------- addresses */
async function loadAddresses(paint) {
  if (!S.user) {
    if (paint) {
      $('#addressList').innerHTML = '<div class="empty">' + bubbleImg('leg', 'empty__img float-a') +
        '<h3>Sign in to save addresses</h3><p>We deliver hot within a few km of the shop.</p></div>';
      $('#addAddrBtn').onclick = () => openAuth(() => loadAddresses(true));
    }
    return;
  }
  try { S.addresses = await api('/addresses/'); if (paint) paintAddresses(); } catch (_) { }
}
function paintAddresses() {
  const el = $('#addressList');
  el.innerHTML = S.addresses.length ? S.addresses.map(a =>
    '<div class="addr-card' + (a.is_default ? ' is-on' : '') + '">' +
    '<div class="addr-card__b"><h4>' + esc(a.label) +
    (a.is_default ? ' <span class="pill">Default</span>' : '') + '</h4>' +
    '<p>' + esc(a.receiver_name) + ' · ' + esc(a.receiver_phone) + '<br>' + esc(a.one_line) + '</p></div>' +
    '<div class="cell-actions">' +
    (a.is_default ? '' : '<button class="btn btn--ghost btn--sm" data-adef="' + a.id + '">Set default</button>') +
    '<button class="btn btn--danger btn--sm" data-adel="' + a.id + '">Delete</button></div></div>').join('')
    : '<div class="empty"><h3>No addresses saved</h3><p>Add one to get delivery.</p></div>';
  $$('[data-adef]', el).forEach(b => b.onclick = async () => {
    await api('/addresses/' + b.dataset.adef + '/set_default/', { method: 'POST' });
    await loadAddresses(true);
  });
  $$('[data-adel]', el).forEach(b => b.onclick = async () => {
    await api('/addresses/' + b.dataset.adel + '/', { method: 'DELETE' });
    await loadAddresses(true); toast('Address removed');
  });
  $('#addAddrBtn').onclick = () => openAddressForm();
}

function openAddressForm(after) {
  modal(
    '<h3>Delivery address</h3><p class="sub">Drop a map pin so the rider finds you fast.</p>' +
    '<div class="row2">' +
    '<div class="field"><label>Name</label><input id="afName" value="' + esc(S.user?.full_name || '') + '"></div>' +
    '<div class="field"><label>Phone</label><input id="afPhone" maxlength="10" inputmode="numeric" value="' + esc(S.user?.phone || '') + '"></div>' +
    '</div>' +
    '<div class="field"><label>House / flat / building</label><input id="afL1"></div>' +
    '<div class="field"><label>Street / area</label><input id="afL2"></div>' +
    '<div class="row2">' +
    '<div class="field"><label>Landmark</label><input id="afLm"></div>' +
    '<div class="field"><label>Pincode</label><input id="afPin" maxlength="6" inputmode="numeric"></div>' +
    '</div>' +
    '<div class="row2">' +
    '<div class="field"><label>City</label><input id="afCity" value="Narasaraopet"></div>' +
    '<div class="field"><label>Label</label><select id="afLabel"><option value="HOME">Home</option><option value="WORK">Work</option><option value="OTHER">Other</option></select></div>' +
    '</div>' +
    '<button class="btn btn--outline btn--block" id="afLoc" style="margin-bottom:12px">📍 Use my current location</button>' +
    '<div class="muted small" id="afLocMsg" style="margin-bottom:12px"></div>' +
    '<button class="btn btn--primary btn--block btn--lg" id="afSave">Save address</button>'
  );
  let lat = null, lng = null;
  $('#afLoc').onclick = () => {
    if (!navigator.geolocation) return toast('Location not supported here', 'err');
    $('#afLocMsg').textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition(async pos => {
      lat = pos.coords.latitude.toFixed(6); lng = pos.coords.longitude.toFixed(6);
      try {
        const r = await api('/addresses/check_serviceable/?lat=' + lat + '&lng=' + lng);
        $('#afLocMsg').textContent = r.message + ' (' + r.distance_km + ' km away)';
      } catch (_) { $('#afLocMsg').textContent = 'Pin saved: ' + lat + ', ' + lng; }
    }, () => { $('#afLocMsg').textContent = 'Could not get your location. Type the address instead.'; },
      { enableHighAccuracy: true, timeout: 9000 });
  };
  $('#afSave').onclick = async () => {
    const body = {
      label: $('#afLabel').value, receiver_name: $('#afName').value.trim(),
      receiver_phone: $('#afPhone').value.replace(/\D/g, ''), line1: $('#afL1').value.trim(),
      line2: $('#afL2').value.trim(), landmark: $('#afLm').value.trim(),
      city: $('#afCity').value.trim(), pincode: $('#afPin').value.trim(),
      latitude: lat, longitude: lng,
    };
    if (!body.receiver_name || !body.line1 || !body.pincode) return toast('Fill name, house and pincode', 'err');
    try {
      loading(true);
      await api('/addresses/', { method: 'POST', body });
      await loadAddresses(location.hash.startsWith('#/addresses'));
      closeModal(); toast('Address saved', 'ok');
      if (after) after();
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };
}

/* ---------------------------------------------------------------- checkout */
async function openCheckout() {
  if (!S.cart || !S.cart.items.length) return;
  await loadAddresses();
  closeCart();

  let fulfilment = 'DELIVERY';
  let addrId = (S.addresses.find(a => a.is_default) || S.addresses[0] || {}).id;
  let pay = 'COD';   // COD only

  const render = () => {
    const t = S.cart.totals;
    modal(
      '<h3>Checkout</h3><p class="sub">' + S.cart.item_count + ' items · ready in about ' + S.shop.avg_delivery_minutes + ' min</p>' +
      '<div class="field"><label>How do you want it?</label><div class="chips" id="coMode">' +
      '<button class="chip' + (fulfilment === 'DELIVERY' ? ' is-on' : '') + '" data-m="DELIVERY">🛵 Home delivery</button>' +
      '<button class="chip' + (fulfilment === 'PICKUP' ? ' is-on' : '') + '" data-m="PICKUP">🏪 Takeaway</button></div></div>' +
      (fulfilment === 'DELIVERY'
        ? '<div class="field"><label>Deliver to</label><div class="addr-list">' +
        (S.addresses.length ? S.addresses.map(a =>
          '<div class="addr-card' + (a.id === addrId ? ' is-on' : '') + '" data-ad="' + a.id + '">' +
          '<div class="addr-card__b"><h4>' + esc(a.label) + '</h4><p>' + esc(a.one_line) + '</p></div></div>').join('')
          : '<p class="muted small">No address saved yet.</p>') +
        '</div><button class="btn btn--ghost btn--sm" id="coNewAddr">+ Add address</button></div>'
        : '<p class="muted small" style="margin-bottom:16px">Pick up at ' + esc(S.shop.address || 'the shop') + '.</p>') +
      '<div class="field"><label>Payment</label><div class="pay-opts" id="coPay">' +
      '<div class="pay-opt is-on" data-p="COD">💵<div><strong>Cash on delivery</strong><small>Pay the rider when it arrives</small></div></div>' +
      '</div></div>' +
      '<div class="field"><label>Note for the kitchen</label><input id="coNote" placeholder="Less spicy, extra napkins…" maxlength="200"></div>' +
      '<div class="bill">' +
      row('Item total', money(t.subtotal)) +
      (Number(t.discount) > 0 ? row('Discount', '−' + money(t.discount), 'is-off') : '') +
      row('Delivery', fulfilment === 'PICKUP' ? 'FREE' : (Number(t.delivery_fee) ? money(t.delivery_fee) : 'FREE')) +
      row('Packing', money(t.packing_fee)) + row('GST', money(t.tax)) +
      row('To pay', money(t.grand_total), 'is-total') + '</div>' +
      '<button class="btn btn--primary btn--block btn--lg" id="coPlace">Place order · ' + money(t.grand_total) + '</button>'
    );
    $$('#coMode .chip').forEach(b => b.onclick = () => { fulfilment = b.dataset.m; render(); });
    $$('[data-ad]').forEach(b => b.onclick = () => { addrId = Number(b.dataset.ad); render(); });
    $$('#coPay .pay-opt').forEach(b => b.onclick = () => { pay = b.dataset.p; render(); });
    const na = $('#coNewAddr'); if (na) na.onclick = () => openAddressForm(() => { addrId = S.addresses[0]?.id; render(); });
    $('#coPlace').onclick = placeOrder;
  };

  const placeOrder = async () => {
    if (fulfilment === 'DELIVERY' && !addrId) return toast('Add a delivery address first', 'err');
    const body = {
      fulfilment, payment_mode: pay, cooking_note: $('#coNote').value.trim(),
      ...(fulfilment === 'DELIVERY' ? { address_id: addrId } : {}),
    };
    try {
      loading(true);
      const res = await api('/checkout/place-order/', { method: 'POST', body });
      finishOrder(res.order);
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  };

  render();
}

// Razorpay removed — COD only

function finishOrder(order) {
  closeModal();
  S.cart = null; paintCartBadge(); loadCart();
  modal(
    '<div style="text-align:center">' +
    bubbleImg('bucket', 'empty__img float-a') +
    '<h3 style="margin-top:12px">Order placed!</h3>' +
    '<p class="sub">' + esc(order.code) + ' · ready in about ' + order.eta_minutes + ' min</p>' +
    '<a class="btn btn--primary btn--block btn--lg" href="#/order/' + esc(order.code) + '" id="okTrack">Track my order</a>' +
    '</div>'
  );
  $('#okTrack').onclick = closeModal;
}

/* ---------------------------------------------------------------- orders */
async function loadOrders() {
  if (!S.user) {
    $('#ordersList').innerHTML = '';
    $('#ordersEmpty').hidden = false;
    openAuth(loadOrders);
    return;
  }
  try {
    loading(true);
    const list = await api('/orders/');
    const rows = list.results || list;
    $('#ordersEmpty').hidden = rows.length > 0;
    $('#ordersList').innerHTML = rows.map(o =>
      '<a class="order-card" href="#/order/' + esc(o.code) + '">' +
      '<img class="order-card__img" src="' + esc(o.first_item?.image || artByText(o.first_item?.product_name || o.first_item?.name)) + '" alt="">' +
      '<div class="order-card__mid"><h4>' + esc(o.code) + ' · ' + o.total_items + ' items</h4>' +
      '<span class="status s-' + o.status + '">' + esc(o.status_display) + '</span> ' +
      '<span class="muted small">' + timeAgo(o.created_at) + '</span></div>' +
      '<strong>' + money(o.grand_total) + '</strong></a>').join('');
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}

const TRACK_STEPS = [
  ['PLACED', 'Order placed', 'We got your order'],
  ['ACCEPTED', 'Accepted', 'The shop confirmed it'],
  ['PREPARING', 'In the kitchen', 'Frying fresh for you'],
  ['READY', 'Ready', 'Packed and waiting'],
  ['OUT_FOR_DELIVERY', 'On the way', 'Rider has picked it up'],
  ['DELIVERED', 'Delivered', 'Enjoy your meal!'],
];

async function loadOrderDetail(code) {
  if (!S.user) { openAuth(() => loadOrderDetail(code)); return; }
  try {
    loading(true);
    const o = await api('/orders/' + code + '/');
    const done = TRACK_STEPS.findIndex(s => s[0] === o.status);
    const dead = ['CANCELLED', 'REJECTED'].includes(o.status);
    $('#orderDetail').innerHTML =
      '<a class="link" href="#/orders">← All orders</a>' +
      '<h1 class="page-title">' + esc(o.code) + '</h1>' +
      '<span class="status s-' + o.status + '">' + esc(o.status_display) + '</span>' +
      (dead ? '<p class="muted" style="margin-top:14px">' + esc(o.cancel_reason || 'This order was cancelled.') + '</p>'
        : '<div class="track">' + TRACK_STEPS.map(([k, t, d], i) =>
          '<div class="track__step' + (i <= done ? ' is-done' : '') + '"><div class="track__dot">' +
          (i <= done ? '✓' : i + 1) + '</div><div><h5>' + esc(t) + '</h5><small>' + esc(d) + '</small></div></div>').join('') + '</div>') +
      (o.rider_name && ['READY', 'OUT_FOR_DELIVERY'].includes(o.status)
        ? '<div class="rider-card"><span class="avatar">' + esc(o.rider_name[0].toUpperCase()) + '</span><div><strong>' +
        esc(o.rider_name) + (o.status === 'OUT_FOR_DELIVERY' ? ' is on the way' : ' will bring your order') + '</strong>' +
        '<small>Your PFC delivery partner · ' + esc(o.rider_phone) + '</small></div>' +
        '<a class="btn btn--green btn--sm" href="tel:' + esc(o.rider_phone) + '">' + icon('phone') + ' Call</a></div>' : '') +
      '<div class="info-card" style="margin-bottom:16px"><h4>' +
      (o.fulfilment === 'PICKUP' ? 'Pickup' : 'Delivering to') + '</h4><p>' +
      esc(o.receiver_name) + ' · ' + esc(o.receiver_phone) + '<br>' +
      '<span class="muted small">' + esc(o.address_text) + '</span></p></div>' +
      (o.cooking_note ? '<div class="info-card" style="margin-bottom:16px"><h4>Kitchen note</h4><p>' + esc(o.cooking_note) + '</p></div>' : '') +
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' +
      o.items.map(i => '<tr><td>' + esc(i.product_name) + '<br><span class="muted small">' + esc(i.variant_label) +
        (i.addons_json.length ? ' · ' + i.addons_json.map(a => esc(a.name)).join(', ') : '') + '</span></td>' +
        '<td>' + i.quantity + '</td><td>' + money(i.line_total) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="bill" style="margin-top:18px">' +
      row('Item total', money(o.subtotal)) +
      (Number(o.discount) > 0 ? row('Discount', '−' + money(o.discount), 'is-off') : '') +
      row('Delivery', money(o.delivery_fee)) + row('Packing', money(o.packing_fee)) +
      row('GST', money(o.tax)) +
      row(o.payment_mode_display + ' · ' + o.payment_status, money(o.grand_total), 'is-total') + '</div>' +
      '<div class="cell-actions" style="margin:22px 0 60px">' +
      '<button class="btn btn--ghost" id="odReorder">Order again</button>' +
      (['PENDING', 'PLACED', 'ACCEPTED'].includes(o.status) ? '<button class="btn btn--danger" id="odCancel">Cancel order</button>' : '') +
      '<a class="btn btn--outline" href="tel:' + esc(S.shop?.phone || '') + '">Call the shop</a></div>';

    $('#odReorder').onclick = async () => {
      const c = await api('/orders/' + code + '/reorder/', { method: 'POST' });
      S.cart = c; paintCartBadge(); openCart();
      if (c.skipped?.length) toast(c.skipped.length + ' item(s) unavailable', 'err');
    };
    const cb = $('#odCancel');
    if (cb) cb.onclick = async () => {
      if (!confirm('Cancel this order?')) return;
      await api('/orders/' + code + '/cancel/', { method: 'POST', body: { reason: 'Cancelled by customer' } });
      loadOrderDetail(code); toast('Order cancelled');
    };
    if (['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)) {
      setTimeout(() => { if (location.hash === '#/order/' + code) loadOrderDetail(code); }, 30000);
    }
  } catch (e) { toast(e.message, 'err'); }
  finally { loading(false); }
}

/* ---------------------------------------------------------------- modal */
function modal(html, wide) {
  $('#modalPanel').className = 'modal__panel' + (wide ? ' wide' : '');
  $('#modalPanel').innerHTML = html;
  $('#modal').hidden = false;
  document.body.classList.add('no-scroll');
}
function closeModal() { $('#modal').hidden = true; document.body.classList.remove('no-scroll'); }

/* =========================================================================
   ADMIN DASHBOARD
   ========================================================================= */
function openAdmin() {
  if (!S.user) { openAuth(openAdmin); return; }
  if (!S.user.is_shop_admin) { toast('This area is for shop staff only.', 'err'); location.hash = S.user.is_rider ? '#/rider' : '#/'; return; }

  $$('.admin__nav button').forEach(b => b.onclick = () => {
    S.admin.tab = b.dataset.tab;
    $$('.admin__nav button').forEach(x => x.classList.toggle('is-on', x === b));
    $('#adminTitle').textContent = b.textContent.replace(/[^\w\s&]/g, '').replace(/\d+$/, '').trim();
    renderAdmin();
  });
  $('#adminRefresh').onclick = renderAdmin;
  $('#soundToggle').onchange = e => { S.admin.sound = e.target.checked; if (!e.target.checked) stopAlarm(); };
  $('#acceptToggle').onchange = async e => {
    try {
      S.shop = await api('/shop-admin/settings/', { method: 'PATCH', body: { accepting_orders: e.target.checked } });
      paintShop(); toast(e.target.checked ? 'Now accepting orders' : 'Orders paused', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#acceptToggle').checked = !!S.shop?.accepting_orders;

  // Browsers only allow sound after a tap — unlock audio + notifications on the first one.
  armAudio();
  $('#alarmAccept').onclick = () => { const o = pendingOrders()[0]; if (o) setOrderStatus(o.code, 'ACCEPTED'); };
  $('#alarmView').onclick = () => { $('#orderAlarm').hidden = true; S.admin.popupHidden = true; $('.admin__nav [data-tab="live"]').click(); };
  $('#alarmMute').onclick = () => { S.admin.mutedUntil = Date.now() + 60000; stopAlarm(true); $('#orderAlarm').hidden = true; toast('Alarm silenced for 1 minute'); };

  loadTeam();
  renderAdmin();
  if (S.admin.timer) clearInterval(S.admin.timer);
  // Poll live orders in the background on every admin tab, so the alarm never misses an order.
  S.admin.timer = setInterval(async () => {
    $('#adminClock').textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    await pollLive();
    if (S.admin.tab === 'live') paintLive($('#adminBody'));
    else if (S.admin.tab === 'overview') renderAdmin(true);
  }, 10000);
}

async function renderAdmin(quiet) {
  const body = $('#adminBody');
  try {
    if (!quiet) loading(true);
    switch (S.admin.tab) {
      case 'live': await pollLive(); paintLive(body); break;
      case 'overview': await adminOverview(body); break;
      case 'products': await adminProducts(body); break;
      case 'cats': await adminCats(body); break;
      case 'addons': await adminAddons(body); break;
      case 'coupons': await adminCoupons(body); break;
      case 'history': await adminHistory(body); break;
      case 'team': await adminTeam(body); break;
      case 'customers': await adminCustomers(body); break;
      case 'settings': await adminSettings(body); break;
    }
  } catch (e) { if (!quiet) toast(e.message, 'err'); }
  finally { if (!quiet) loading(false); }
}

const nextStatus = o => ({
  PLACED: [['ACCEPTED', 'Accept'], ['REJECTED', 'Reject']],
  ACCEPTED: [['PREPARING', 'Start cooking']],
  PREPARING: [['READY', 'Mark ready']],
  READY: o.fulfilment === 'PICKUP' ? [['DELIVERED', 'Handed over']] : [['OUT_FOR_DELIVERY', 'Send out']],
  OUT_FOR_DELIVERY: [['DELIVERED', 'Delivered']],
}[o.status] || []);

const pendingOrders = () => (S.admin.live || []).filter(o => o.status === 'PLACED');

async function pollLive() {
  try {
    const data = await api('/shop-admin/orders/?live=1');
    S.admin.live = data.results || data;
  } catch (_) { return; }
  const live = S.admin.live;
  $('#liveCount').textContent = live.length;
  const pending = pendingOrders();
  const fresh = pending.filter(o => !S.admin.seen.has(o.code));
  live.forEach(o => S.admin.seen.add(o.code));
  if (fresh.length) {
    S.admin.popupHidden = false;
    notify('New PFC order ' + fresh[0].code.slice(-6), fresh[0].total_items + ' items · ' + money(fresh[0].grand_total));
  }
  if (pending.length) startAlarm(); else stopAlarm();
  paintAlarm();
}

function paintAlarm() {
  const o = pendingOrders()[0];
  const box = $('#orderAlarm');
  if (!o || S.admin.popupHidden || location.hash !== '#/admin') { box.hidden = true; return; }
  box.hidden = false;
  const more = pendingOrders().length - 1;
  $('#alarmTitle').textContent = 'New order!' + (more > 0 ? ' (+' + more + ' more)' : '');
  $('#alarmText').textContent = o.code + ' · ' + (o.fulfilment === 'PICKUP' ? 'Takeaway' : 'Delivery') + ' · ' +
    money(o.grand_total) + ' · ' + (o.payment_mode === 'COD' ? 'Cash' : 'Paid online') + ' · ' + timeAgo(o.created_at);
  $('#alarmItems').innerHTML = o.items.map(i => '<div><span>' + esc(i.product_name) + ' <span class="muted">(' + esc(i.variant_label) + ')</span></span><b>×' + i.quantity + '</b></div>').join('') +
    (o.cooking_note ? '<div class="muted">✎ ' + esc(o.cooking_note) + '</div>' : '');
}

/* ---- alarm sound: loud two-tone siren, repeats every 2.5s until every new order is accepted ---- */
function armAudio() {
  const unlock = () => {
    try {
      S.admin.ctx = S.admin.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (S.admin.ctx.state === 'suspended') S.admin.ctx.resume();
    } catch (_) { }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { });
    $('#soundStrip').hidden = true;
  };
  const needs = !S.admin.ctx || S.admin.ctx.state !== 'running';
  $('#soundStrip').hidden = !needs;
  $('#soundStrip').onclick = unlock;
  document.addEventListener('pointerdown', unlock, { once: true });
}
function siren() {
  const ctx = S.admin.ctx; if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (let k = 0; k < 6; k++) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = k % 2 ? 660 : 990;
    const t = now + k * 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.19);
  }
}
function beep() { siren(); }
function startAlarm() {
  if (S.admin.alarm) return;
  const tick = () => {
    if (!S.admin.sound || Date.now() < (S.admin.mutedUntil || 0)) return;
    siren();
    document.title = document.title.startsWith('🔔') ? 'PFC Admin' : '🔔 NEW ORDER — PFC';
  };
  tick(); S.admin.alarm = setInterval(tick, 2500);
}
function stopAlarm(keepPopup) {
  clearInterval(S.admin.alarm); S.admin.alarm = null;
  document.title = 'Palnadu Fried Chicken';
  if (!keepPopup && !pendingOrders().length) $('#orderAlarm').hidden = true;
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: CONFIG.IMG + 'drumstick.svg', tag: 'pfc-order' }); } catch (_) { }
}

async function setOrderStatus(code, status) {
  try {
    await api('/shop-admin/orders/' + code + '/status/', { method: 'POST', body: { status } });
    toast(status === 'ACCEPTED' ? 'Order accepted — start cooking!' : 'Order updated', 'ok');
    await pollLive();
    if (S.admin.tab === 'live') paintLive($('#adminBody'));
  } catch (e) { toast(e.message, 'err'); }
}

async function loadTeam() {
  try { S.admin.team = await api('/shop-admin/team/'); } catch (_) { S.admin.team = S.admin.team || []; }
  return S.admin.team;
}
const riders = () => (S.admin.team || []).filter(m => m.role === 'RIDER' && m.is_active);

function riderPicker(o) {
  if (o.fulfilment !== 'DELIVERY' || !['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(o.status)) return '';
  const list = riders();
  if (!list.length) return '<div class="kot__rider is-missing">' + icon('bike') + '<span>No riders yet — add them in <b>Team &amp; riders</b></span></div>';
  return '<label class="kot__rider' + (o.rider_id ? '' : ' is-missing') + '">' + icon('bike') +
    '<select data-rider="' + esc(o.code) + '"' + (o.status === 'OUT_FOR_DELIVERY' ? ' disabled' : '') + '>' +
    '<option value="">' + (o.rider_id ? 'Remove rider' : 'Assign a rider…') + '</option>' +
    list.map(r => '<option value="' + r.id + '"' + (r.id === o.rider_id ? ' selected' : '') + '>' + esc(r.full_name || r.phone) +
      (r.active_deliveries ? ' · ' + r.active_deliveries + ' on hand' : ' · free') + '</option>').join('') +
    '</select></label>';
}

function paintLive(body) {
  const orders = S.admin.live || [];
  body.innerHTML = orders.length ? '<div class="kot-grid">' + orders.map(o =>
    '<div class="kot' + (o.status === 'PLACED' ? ' is-new' : '') + '">' +
    '<div class="kot__head"><strong>#' + esc(o.code.slice(-6)) + '</strong>' +
    '<span class="status s-' + o.status + '">' + esc(o.status_display) + '</span></div>' +
    '<div class="kot__body"><div class="kot__items">' +
    o.items.map(i => '<div><span>' + esc(i.product_name) + ' <span class="muted">(' + esc(i.variant_label) + ')</span>' +
      (i.addons_json.length ? '<br><span class="muted" style="font-size:11.5px">+ ' + i.addons_json.map(a => esc(a.name)).join(', ') + '</span>' : '') +
      (i.note ? '<br><span class="muted" style="font-size:11.5px">✎ ' + esc(i.note) + '</span>' : '') +
      '</span><b>×' + i.quantity + '</b></div>').join('') + '</div>' +
    (o.cooking_note ? '<div class="kot__note">✎ ' + esc(o.cooking_note) + '</div>' : '') +
    '<div class="kot__meta">' + esc(o.receiver_name) + ' · <a href="tel:' + esc(o.receiver_phone) + '">' + esc(o.receiver_phone) + '</a><br>' +
    (o.fulfilment === 'PICKUP' ? '🏪 Takeaway' : '🛵 ' + esc(o.address_text)) +
    (o.latitude ? ' · <a class="link" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + o.latitude + ',' + o.longitude + '">Map</a>' : '') +
    '<br>' + timeAgo(o.created_at) + ' · <b>' + money(o.grand_total) + '</b> · ' +
    (o.payment_mode === 'COD' ? 'Cash' : 'Online') + ' (' + esc(o.payment_status) + ')</div>' +
    riderPicker(o) + '</div>' +
    '<div class="kot__foot">' +
    nextStatus(o).map(([st, l]) =>
      '<button class="btn ' + (st === 'REJECTED' ? 'btn--danger' : 'btn--primary') + ' btn--sm" data-st="' + o.code + '" data-v="' + st + '">' + l + '</button>').join('') +
    '<button class="btn btn--ghost btn--sm" data-print="' + o.code + '">Print</button>' +
    '</div></div>').join('') + '</div>'
    : '<div class="empty">' + bubbleImg('bucket', 'empty__img float-a') + '<h3>No live orders</h3><p>New orders appear here the moment they come in — with a loud alarm.</p></div>';

  $$('[data-st]', body).forEach(b => b.onclick = () => {
    if (b.dataset.v === 'OUT_FOR_DELIVERY') {
      const o = orders.find(x => x.code === b.dataset.st);
      if (o && !o.rider_id && riders().length && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'No rider — send anyway?'; return; }
    }
    if (b.dataset.v === 'REJECTED' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to reject'; return; }
    setOrderStatus(b.dataset.st, b.dataset.v);
  });
  $$('[data-rider]', body).forEach(sel => sel.onchange = async () => {
    try {
      await api('/shop-admin/orders/' + sel.dataset.rider + '/assign-rider/', { method: 'POST', body: { rider: sel.value || null } });
      toast(sel.value ? 'Rider assigned' : 'Rider removed', 'ok');
      await loadTeam(); await pollLive(); paintLive(body);
    } catch (e) { toast(e.message, 'err'); }
  });
  $$('[data-print]', body).forEach(b => b.onclick = () => printKOT(orders.find(o => o.code === b.dataset.print)));
}

/* ---- Team & riders ---- */
async function adminTeam(body) {
  const team = await loadTeam();
  const groups = [['OWNER', 'Owners'], ['STAFF', 'Shop staff'], ['RIDER', 'Delivery riders']];
  const card = m =>
    '<div class="member"><div class="member__top"><span class="avatar">' + esc((m.full_name || m.phone || '?')[0].toUpperCase()) + '</span>' +
    '<div><strong>' + esc(m.full_name || 'No name') + '</strong><a href="tel:' + esc(m.phone) + '">+91 ' + esc(m.phone) + '</a></div>' +
    '<span class="role-pill role-' + m.role + '">' + esc(m.role_display) + '</span></div>' +
    (m.role === 'RIDER' ? '<div class="member__stats"><span><b>' + m.active_deliveries + '</b>on hand now</span><span><b>' + m.delivered_today + '</b>delivered today</span></div>' : '') +
    (m.id === S.user.id ? '<p class="muted small">This is you.</p>' :
      '<div class="member__foot"><select data-role="' + m.id + '">' +
      groups.map(([r, l]) => '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + l.replace(/s$/, '').replace('Shop staff', 'Staff') + '</option>').join('') +
      '</select><button class="btn btn--danger btn--sm" data-remove="' + m.id + '">Remove</button></div>') + '</div>';

  body.innerHTML =
    '<form class="team-add" id="teamForm"><div><h3>Add someone to the team</h3>' +
    '<p>They sign in on this website with their mobile number (OTP). Owners and staff get the dashboard; riders get a “My deliveries” screen.</p></div>' +
    '<div class="row"><input id="tmPhone" type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit mobile" required>' +
    '<input id="tmName" placeholder="Name" maxlength="120">' +
    '<select id="tmRole"><option value="RIDER">Delivery rider</option><option value="STAFF">Staff</option><option value="OWNER">Owner</option></select>' +
    '<button class="btn btn--primary" type="submit">' + icon('plus') + ' Add</button></div></form>' +
    groups.map(([r, label]) => {
      const list = team.filter(m => m.role === r);
      return '<div class="team-group">' + label + ' · ' + list.length + '</div>' +
        (list.length ? '<div class="team-grid">' + list.map(card).join('') + '</div>'
          : '<p class="muted small">' + (r === 'RIDER' ? 'No riders yet. Add your delivery boys above so you can assign orders to them.' : 'Nobody yet.') + '</p>');
    }).join('');

  $('#teamForm').onsubmit = async e => {
    e.preventDefault();
    const phone = $('#tmPhone').value.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number', 'err');
    try {
      await api('/shop-admin/team/', { method: 'POST', body: { phone, full_name: $('#tmName').value.trim(), role: $('#tmRole').value } });
      toast('Added to the team', 'ok'); adminTeam(body);
    } catch (err) { toast(err.message, 'err'); }
  };
  $$('[data-role]', body).forEach(sel => sel.onchange = async () => {
    try { await api('/shop-admin/team/' + sel.dataset.role + '/', { method: 'PATCH', body: { role: sel.value } }); toast('Role updated', 'ok'); adminTeam(body); }
    catch (err) { toast(err.message, 'err'); adminTeam(body); }
  });
  $$('[data-remove]', body).forEach(b => b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap to confirm'; return; }
    try { await api('/shop-admin/team/' + b.dataset.remove + '/', { method: 'DELETE' }); toast('Removed from the team'); adminTeam(body); }
    catch (err) { toast(err.message, 'err'); }
  });
}

/* =========================================================================
   RIDER — "My deliveries" for the shop's delivery boys
   ========================================================================= */
function openRider() {
  if (!S.user) { openAuth(openRider); return; }
  if (!S.user.is_rider) { toast('This screen is for PFC delivery riders.', 'err'); location.hash = '#/'; return; }
  S.riderSeen = S.riderSeen || new Set();
  loadRider();
  clearInterval(S.riderTimer);
  S.riderTimer = setInterval(() => loadRider(true), 20000);
  document.addEventListener('pointerdown', () => { try { S.admin.ctx = S.admin.ctx || new (window.AudioContext || window.webkitAudioContext)(); S.admin.ctx.resume(); } catch (_) { } }, { once: true });
}

async function loadRider(quiet) {
  let d;
  try { if (!quiet) loading(true); d = await api('/rider/orders/'); }
  catch (e) { if (!quiet) toast(e.message, 'err'); return; }
  finally { if (!quiet) loading(false); }
  const fresh = d.active.filter(o => !S.riderSeen.has(o.code));
  if (quiet && fresh.length) { siren(); toast('New delivery assigned to you!', 'ok'); notify('New PFC delivery', fresh[0].address_text); }
  d.active.forEach(o => S.riderSeen.add(o.code));

  const u = S.user;
  const mapUrl = o => o.latitude ? 'https://www.google.com/maps/dir/?api=1&destination=' + o.latitude + ',' + o.longitude
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address_text);
  const drop = o => {
    const cod = o.payment_mode === 'COD' && o.payment_status !== 'PAID';
    const canPick = ['ACCEPTED', 'PREPARING', 'READY'].includes(o.status);
    return '<div class="drop' + (fresh.includes(o) ? ' is-new' : '') + '">' +
      '<div class="drop__top"><strong>#' + esc(o.code.slice(-6)) + '</strong><span class="status s-' + o.status + '">' + esc(o.status_display) + '</span></div>' +
      '<div class="drop__who"><span class="avatar">' + esc((o.receiver_name || '?')[0].toUpperCase()) + '</span><div><strong>' + esc(o.receiver_name) + '</strong>' +
      '<p>' + esc(o.address_text) + '</p></div></div>' +
      '<div class="drop__items">' + o.items.map(i => i.quantity + '× ' + esc(i.product_name)).join(' · ') + '</div>' +
      '<div class="drop__cash' + (cod ? '' : ' is-paid') + '">' + (cod ? '💵 Collect ' + money(o.grand_total) + ' cash' : '✓ Paid online — collect nothing') + '</div>' +
      '<div class="drop__actions">' +
      '<a class="btn btn--outline" href="tel:' + esc(o.receiver_phone) + '">' + icon('phone') + ' Call</a>' +
      '<a class="btn btn--outline" href="' + mapUrl(o) + '" target="_blank" rel="noopener">' + icon('nav') + ' Navigate</a>' +
      (canPick ? '<button class="btn btn--primary btn--block btn--lg" data-rs="' + o.code + '" data-v="OUT_FOR_DELIVERY">' + (o.status === 'READY' ? 'Picked up — start delivery' : 'Picked up (kitchen still marking ready)') + '</button>' : '') +
      (o.status === 'OUT_FOR_DELIVERY' ? '<button class="btn btn--green btn--block btn--lg" data-rs="' + o.code + '" data-v="DELIVERED">' + icon('check') + ' Delivered' + (cod ? ' · cash collected' : '') + '</button>' : '') +
      '</div></div>';
  };

  $('#riderBody').innerHTML =
    '<div class="rider-head"><span class="avatar">' + esc((u.full_name || u.phone || 'R')[0].toUpperCase()) + '</span>' +
    '<div><h2>Hi ' + esc((u.full_name || 'rider').split(' ')[0]) + ' 👋</h2><p>Your PFC deliveries · refreshes every 20 seconds</p></div></div>' +
    '<div class="rider-stats"><div><b>' + d.active.length + '</b><small>to deliver</small></div>' +
    '<div><b>' + d.delivered_today.length + '</b><small>delivered today</small></div>' +
    '<div><b>' + money(d.cash_collected_today) + '</b><small>cash today</small></div></div>' +
    (d.active.length ? d.active.map(drop).join('')
      : '<div class="empty">' + bubbleImg('bucket', 'empty__img float-a') + '<h3>No deliveries right now</h3><p>When the shop assigns you an order it shows up here with a sound.</p></div>') +
    (d.delivered_today.length ? '<div class="section-head"><h2>Delivered today</h2></div><div class="orders">' +
      d.delivered_today.map(o => '<div class="order-card"><div class="order-card__mid"><h4>#' + esc(o.code.slice(-6)) + ' · ' + esc(o.receiver_name) + '</h4>' +
        '<span class="muted small">' + esc(o.address_text) + '</span></div><strong>' + money(o.grand_total) + '</strong></div>').join('') + '</div>' : '');

  $$('[data-rs]').forEach(b => b.onclick = async () => {
    if (b.dataset.v === 'DELIVERED' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to confirm delivered'; return; }
    try {
      loading(true);
      await api('/rider/orders/' + b.dataset.rs + '/status/', { method: 'POST', body: { status: b.dataset.v } });
      toast(b.dataset.v === 'DELIVERED' ? 'Marked delivered. Great job!' : 'On the way — drive safe!', 'ok');
      loadRider(true);
    } catch (e) { toast(e.message, 'err'); }
    finally { loading(false); }
  });
}

function printKOT(o) {
  if (!o) return;
  const w = window.open('', '_blank', 'width=340,height=640');
  w.document.write('<pre style="font:13px/1.5 monospace;padding:10px">' +
    'PALNADU FRIED CHICKEN\n' + o.code + '\n' + new Date(o.created_at).toLocaleString('en-IN') +
    '\n--------------------------------\n' +
    o.items.map(i => (i.quantity + ' x ' + i.product_name + ' (' + i.variant_label + ')').padEnd(28) +
      Number(i.line_total).toFixed(2)).join('\n') +
    '\n--------------------------------\n' +
    'TOTAL'.padEnd(28) + Number(o.grand_total).toFixed(2) + '\n' +
    o.payment_mode + ' / ' + o.payment_status + '\n\n' +
    o.receiver_name + ' ' + o.receiver_phone + '\n' + o.address_text +
    (o.cooking_note ? '\nNOTE: ' + o.cooking_note : '') + '</pre>');
  w.document.close(); w.print();
}

async function adminOverview(body) {
  const d = await api('/shop-admin/stats/');
  const max = Math.max(...d.weekly_trend.map(x => x.revenue), 1);
  body.innerHTML =
    '<div class="stats">' +
    stat("Today's orders", d.today.orders, money(d.today.revenue) + ' earned') +
    stat('Live now', d.live_orders, d.new_orders + ' waiting to be accepted') +
    stat('Average order', money(d.today.avg_order_value), 'today') +
    stat('All-time revenue', money(d.totals.revenue), d.totals.orders + ' orders') +
    stat('Customers', d.totals.customers, 'registered') +
    stat('Products', d.totals.products, d.totals.out_of_stock + ' unavailable') +
    '</div>' +
    '<h3 style="margin-bottom:12px;font-size:16px">Last 7 days</h3>' +
    '<div class="chart">' + d.weekly_trend.map(x =>
      '<div class="chart__bar" title="' + money(x.revenue) + '">' +
      '<i style="height:' + Math.max(4, x.revenue / max * 130) + 'px"></i>' +
      '<span>' + new Date(x.date).toLocaleDateString('en-IN', { weekday: 'short' }) + '</span></div>').join('') + '</div>' +
    '<h3 style="margin-bottom:12px;font-size:16px">Top sellers this week</h3>' +
    '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Sold</th></tr></thead><tbody>' +
    (d.top_products.length ? d.top_products.map(p => '<tr><td>' + esc(p.product_name) + '</td><td>' + p.qty + '</td></tr>').join('')
      : '<tr><td colspan="2" class="muted">No sales yet this week.</td></tr>') +
    '</tbody></table></div>';
}
const stat = (h, v, s) => '<div class="stat"><h4>' + esc(h) + '</h4><strong>' + v + '</strong><small>' + esc(s) + '</small></div>';

async function adminProducts(body) {
  const data = await api('/shop-admin/products/');
  const list = data.results || data;
  body.innerHTML =
    '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">' +
    '<button class="btn btn--primary" id="apNew">+ New product</button>' +
    '<input id="apSearch" placeholder="Search products…" style="flex:1;min-width:180px;padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--ink-700);color:var(--text);outline:none">' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Sizes &amp; price</th><th>Status</th><th></th></tr></thead><tbody id="apRows">' +
    list.map(p => productRow(p)).join('') + '</tbody></table></div>';

  $('#apNew').onclick = () => productForm(null);
  $('#apSearch').oninput = e => {
    const q = e.target.value.toLowerCase();
    $('#apRows').innerHTML = list.filter(p => (p.name + p.category_name).toLowerCase().includes(q)).map(productRow).join('');
    wireProductRows(list);
  };
  wireProductRows(list);
}
const productRow = p =>
  '<tr><td><strong>' + esc(p.name) + '</strong><br><span class="muted small">' + esc(p.short_description || '') + '</span></td>' +
  '<td>' + esc(p.category_name) + (p.subcategory_name ? ' › ' + esc(p.subcategory_name) : '') + '</td>' +
  '<td>' + (p.variants || []).filter(v => v.is_active).map(v =>
    '<span class="size-chip">' + esc(v.label || v.size_display) + ' ' + money(v.price) + '</span>').join(' ') + '</td>' +
  '<td><span class="status ' + (p.is_available ? 's-DELIVERED' : 's-CANCELLED') + '">' +
  (p.is_available ? 'Live' : 'Off') + '</span></td>' +
  '<td><div class="cell-actions">' +
  '<button class="btn btn--ghost btn--sm" data-ped="' + p.id + '">Edit</button>' +
  '<button class="btn btn--ghost btn--sm" data-ptog="' + p.id + '">' + (p.is_available ? 'Hide' : 'Show') + '</button>' +
  '<button class="btn btn--danger btn--sm" data-pdel="' + p.id + '">Delete</button></div></td></tr>';

function wireProductRows(list) {
  $$('[data-ped]').forEach(b => b.onclick = () => productForm(list.find(p => p.id === b.dataset.ped)));
  $$('[data-ptog]').forEach(b => b.onclick = async () => {
    await api('/shop-admin/products/' + b.dataset.ptog + '/toggle_availability/', { method: 'POST' });
    renderAdmin(); loadHome();
  });
  $$('[data-pdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this product? Past orders keep their record.')) return;
    try {
      await api('/shop-admin/products/' + b.dataset.pdel + '/', { method: 'DELETE' });
      toast('Deleted'); renderAdmin(); loadHome();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function productForm(p) {
  const cats = S.categories;
  let variants = p ? (p.variants || []).map(v => ({ ...v })) : [{ size: 'REGULAR', label: '', price: '', mrp: '', is_default: true, is_active: true }];

  const subOptions = catId => {
    const c = cats.find(x => x.id === Number(catId));
    return '<option value="">— none —</option>' + (c ? c.subcategories.map(s =>
      '<option value="' + s.id + '"' + (p && p.subcategory === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') : '');
  };

  const draw = () => {
    modal(
      '<h3>' + (p ? 'Edit product' : 'New product') + '</h3>' +
      '<div class="field"><label>Name</label><input id="pfName" value="' + esc(p?.name || '') + '"></div>' +
      '<div class="row2">' +
      '<div class="field"><label>Category</label><select id="pfCat">' + cats.map(c =>
        '<option value="' + c.id + '"' + (p && p.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Sub category</label><select id="pfSub">' + subOptions(p?.category || cats[0]?.id) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Short description</label><input id="pfShort" maxlength="180" value="' + esc(p?.short_description || '') + '"></div>' +
      '<div class="field"><label>Full description</label><textarea id="pfDesc">' + esc(p?.description || '') + '</textarea></div>' +
      '<div class="row2">' +
      '<div class="field"><label>Type</label><select id="pfType">' +
      ['NONVEG', 'VEG', 'EGG'].map(t => '<option value="' + t + '"' + (p?.food_type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Serves</label><input id="pfServes" value="' + esc(p?.serves || '') + '" placeholder="Serves 1-2"></div>' +
      '</div>' +
      '<div class="field"><label>Photo</label><input type="file" id="pfImg" accept="image/*"></div>' +
      '<div class="field"><label>Sizes &amp; pricing (less · medium · more)</label><div id="pfVars"></div>' +
      '<button class="btn btn--ghost btn--sm" id="pfAddVar" style="margin-top:8px">+ Add a size</button></div>' +
      '<div class="chips" style="margin-bottom:16px">' +
      '<button class="chip' + (p?.is_bestseller ? ' is-on' : '') + '" id="pfBest">Bestseller</button>' +
      '<button class="chip' + (p?.is_new ? ' is-on' : '') + '" id="pfNew">New</button>' +
      '<button class="chip' + (p ? (p.is_available ? ' is-on' : '') : ' is-on') + '" id="pfAvail">Available</button>' +
      '</div>' +
      '<button class="btn btn--primary btn--block btn--lg" id="pfSave">' + (p ? 'Save changes' : 'Create product') + '</button>',
      true
    );

    const drawVars = () => {
      $('#pfVars').innerHTML = variants.map((v, i) =>
        '<div class="row2" style="align-items:end;margin-bottom:8px">' +
        '<div class="field" style="margin:0"><label>Size</label><select data-vs="' + i + '">' +
        ['REGULAR', 'MEDIUM', 'LARGE', 'FAMILY'].map(s => '<option value="' + s + '"' + (v.size === s ? ' selected' : '') + '>' +
          ({ REGULAR: 'Less / Regular', MEDIUM: 'Medium', LARGE: 'More / Large', FAMILY: 'Family bucket' })[s] + '</option>').join('') + '</select></div>' +
        '<div class="field" style="margin:0"><label>Label</label><input data-vl="' + i + '" value="' + esc(v.label || '') + '" placeholder="4 pc"></div>' +
        '<div class="field" style="margin:0"><label>Price</label><input data-vp="' + i + '" inputmode="decimal" value="' + esc(v.price || '') + '"></div>' +
        '<div class="field" style="margin:0"><label>MRP</label><input data-vm="' + i + '" inputmode="decimal" value="' + esc(v.mrp || '') + '"></div>' +
        (variants.length > 1 ? '<button class="btn btn--danger btn--sm" data-vx="' + i + '">Remove</button>' : '') +
        '</div>').join('');
      $$('[data-vx]').forEach(b => b.onclick = () => { variants.splice(Number(b.dataset.vx), 1); drawVars(); });
    };
    drawVars();

    $('#pfCat').onchange = e => { $('#pfSub').innerHTML = subOptions(e.target.value); };
    $('#pfAddVar').onclick = () => { variants.push({ size: 'MEDIUM', label: '', price: '', mrp: '', is_active: true }); drawVars(); };
    ['pfBest', 'pfNew', 'pfAvail'].forEach(id => $('#' + id).onclick = () => $('#' + id).classList.toggle('is-on'));

    $('#pfSave').onclick = async () => {
      variants.forEach((v, i) => {
        v.size = $('[data-vs="' + i + '"]').value;
        v.label = $('[data-vl="' + i + '"]').value.trim();
        v.price = $('[data-vp="' + i + '"]').value.trim();
        v.mrp = $('[data-vm="' + i + '"]').value.trim() || null;
        v.is_active = true;
        v.is_default = i === 0;
      });
      if (!$('#pfName').value.trim() || variants.some(v => !v.price)) return toast('Name and every price are required', 'err');

      const payload = {
        name: $('#pfName').value.trim(),
        category: Number($('#pfCat').value),
        subcategory: $('#pfSub').value ? Number($('#pfSub').value) : null,
        short_description: $('#pfShort').value.trim(),
        description: $('#pfDesc').value.trim(),
        food_type: $('#pfType').value,
        serves: $('#pfServes').value.trim(),
        is_bestseller: $('#pfBest').classList.contains('is-on'),
        is_new: $('#pfNew').classList.contains('is-on'),
        is_available: $('#pfAvail').classList.contains('is-on'),
        variants: variants.map(v => ({ ...(v.id ? { id: v.id } : {}), size: v.size, label: v.label, price: v.price, mrp: v.mrp, is_default: v.is_default, is_active: true })),
      };
      try {
        loading(true);
        const saved = p
          ? await api('/shop-admin/products/' + p.id + '/', { method: 'PATCH', body: payload })
          : await api('/shop-admin/products/', { method: 'POST', body: payload });
        const file = $('#pfImg').files[0];
        if (file) {
          const fd = new FormData(); fd.append('image', file);
          await api('/shop-admin/products/' + saved.id + '/', { method: 'PATCH', body: fd, isForm: true });
        }
        closeModal(); toast('Saved', 'ok'); renderAdmin(); loadHome();
      } catch (e) { toast(e.message, 'err'); }
      finally { loading(false); }
    };
  };
  draw();
}

async function adminCats(body) {
  const data = await api('/shop-admin/categories/');
  const cats = data.results || data;
  body.innerHTML =
    '<div style="display:flex;gap:10px;margin-bottom:16px">' +
    '<button class="btn btn--primary" id="acNew">+ New category</button>' +
    '<button class="btn btn--ghost" id="ascNew">+ New sub category</button></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Category</th><th>Sub categories</th><th>Status</th><th></th></tr></thead><tbody>' +
    cats.map(c => '<tr><td><strong>' + esc(c.name) + '</strong><br><span class="muted small">' + esc(c.tagline || '') + '</span></td>' +
      '<td>' + (c.subcategories.map(s => '<span class="size-chip">' + esc(s.name) + '</span>').join(' ') || '<span class="muted">—</span>') + '</td>' +
      '<td><span class="status ' + (c.is_active ? 's-DELIVERED' : 's-CANCELLED') + '">' + (c.is_active ? 'Live' : 'Off') + '</span></td>' +
      '<td><div class="cell-actions"><button class="btn btn--ghost btn--sm" data-ced="' + c.id + '">Edit</button>' +
      '<button class="btn btn--danger btn--sm" data-cdel="' + c.id + '">Delete</button></div></td></tr>').join('') +
    '</tbody></table></div>';

  $('#acNew').onclick = () => catForm(null);
  $('#ascNew').onclick = () => subCatForm(cats);
  $$('[data-ced]').forEach(b => b.onclick = () => catForm(cats.find(c => c.id === Number(b.dataset.ced))));
  $$('[data-cdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this category?')) return;
    try { await api('/shop-admin/categories/' + b.dataset.cdel + '/', { method: 'DELETE' }); renderAdmin(); loadHome(); }
    catch (e) { toast('Move its products to another category first.', 'err'); }
  });
}

function catForm(c) {
  modal('<h3>' + (c ? 'Edit category' : 'New category') + '</h3>' +
    '<div class="field"><label>Name</label><input id="cfName" value="' + esc(c?.name || '') + '"></div>' +
    '<div class="field"><label>Tagline</label><input id="cfTag" value="' + esc(c?.tagline || '') + '"></div>' +
    '<div class="row2"><div class="field"><label>Emoji</label><input id="cfIco" maxlength="4" value="' + esc(c?.icon_emoji || '') + '"></div>' +
    '<div class="field"><label>Sort order</label><input id="cfSort" inputmode="numeric" value="' + (c?.sort_order ?? 0) + '"></div></div>' +
    '<div class="field"><label>Image</label><input type="file" id="cfImg" accept="image/*"></div>' +
    '<button class="btn btn--primary btn--block btn--lg" id="cfSave">Save</button>');
  $('#cfSave').onclick = async () => {
    const body = {
      name: $('#cfName').value.trim(), tagline: $('#cfTag').value.trim(),
      icon_emoji: $('#cfIco').value.trim(), sort_order: Number($('#cfSort').value || 0), is_active: true,
    };
    if (!body.name) return toast('Name is required', 'err');
    try {
      const saved = c ? await api('/shop-admin/categories/' + c.id + '/', { method: 'PATCH', body })
        : await api('/shop-admin/categories/', { method: 'POST', body });
      const f = $('#cfImg').files[0];
      if (f) { const fd = new FormData(); fd.append('image', f); await api('/shop-admin/categories/' + saved.id + '/', { method: 'PATCH', body: fd, isForm: true }); }
      closeModal(); toast('Saved', 'ok'); renderAdmin(); loadHome();
    } catch (e) { toast(e.message, 'err'); }
  };
}

function subCatForm(cats) {
  modal('<h3>New sub category</h3>' +
    '<div class="field"><label>Parent category</label><select id="sfCat">' +
    cats.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Name</label><input id="sfName" placeholder="Boneless strips"></div>' +
    '<button class="btn btn--primary btn--block btn--lg" id="sfSave">Create</button>');
  $('#sfSave').onclick = async () => {
    try {
      await api('/shop-admin/subcategories/', {
        method: 'POST', body: { category: Number($('#sfCat').value), name: $('#sfName').value.trim(), is_active: true },
      });
      closeModal(); toast('Created', 'ok'); renderAdmin(); loadHome();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function adminAddons(body) {
  const data = await api('/shop-admin/addons/');
  const list = data.results || data;
  body.innerHTML = '<button class="btn btn--primary" id="aaNew" style="margin-bottom:16px">+ New add-on</button>' +
    '<div class="table-wrap"><table><thead><tr><th>Add-on</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>' +
    list.map(a => '<tr><td>' + esc(a.name) + '</td><td>' + money(a.price) + '</td>' +
      '<td><span class="status ' + (a.is_active ? 's-DELIVERED' : 's-CANCELLED') + '">' + (a.is_active ? 'Live' : 'Off') + '</span></td>' +
      '<td><button class="btn btn--danger btn--sm" data-adel2="' + a.id + '">Delete</button></td></tr>').join('') +
    '</tbody></table></div>';
  $('#aaNew').onclick = () => {
    modal('<h3>New add-on</h3><div class="field"><label>Name</label><input id="adName"></div>' +
      '<div class="field"><label>Price</label><input id="adPrice" inputmode="decimal"></div>' +
      '<button class="btn btn--primary btn--block btn--lg" id="adSave">Create</button>');
    $('#adSave').onclick = async () => {
      try {
        await api('/shop-admin/addons/', { method: 'POST', body: { name: $('#adName').value.trim(), price: $('#adPrice').value, is_active: true } });
        closeModal(); renderAdmin(); loadHome();
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  $$('[data-adel2]').forEach(b => b.onclick = async () => {
    await api('/shop-admin/addons/' + b.dataset.adel2 + '/', { method: 'DELETE' }); renderAdmin();
  });
}

async function adminCoupons(body) {
  const data = await api('/shop-admin/coupons/');
  const list = data.results || data;
  body.innerHTML = '<button class="btn btn--primary" id="acpNew" style="margin-bottom:16px">+ New coupon</button>' +
    '<div class="table-wrap"><table><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody>' +
    list.map(c => '<tr><td><strong>' + esc(c.code) + '</strong><br><span class="muted small">' + esc(c.description || '') + '</span></td>' +
      '<td>' + (c.kind === 'PERCENT' ? c.value + '%' : money(c.value)) + '</td>' +
      '<td>' + money(c.min_order_value) + '</td><td>' + c.used_count + (c.usage_limit ? ' / ' + c.usage_limit : '') + '</td>' +
      '<td><span class="status ' + (c.is_active ? 's-DELIVERED' : 's-CANCELLED') + '">' + (c.is_active ? 'Live' : 'Off') + '</span></td>' +
      '<td><button class="btn btn--danger btn--sm" data-cpdel="' + c.id + '">Delete</button></td></tr>').join('') +
    '</tbody></table></div>';
  $('#acpNew').onclick = () => {
    modal('<h3>New coupon</h3>' +
      '<div class="field"><label>Code</label><input id="cpCode" placeholder="PFC50" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Description</label><input id="cpDesc"></div>' +
      '<div class="row2"><div class="field"><label>Type</label><select id="cpKind"><option value="PERCENT">Percent</option><option value="FLAT">Flat amount</option></select></div>' +
      '<div class="field"><label>Value</label><input id="cpVal" inputmode="decimal"></div></div>' +
      '<div class="row2"><div class="field"><label>Max discount</label><input id="cpMax" inputmode="decimal"></div>' +
      '<div class="field"><label>Min order</label><input id="cpMin" inputmode="decimal" value="0"></div></div>' +
      '<div class="row2"><div class="field"><label>Total uses (0 = unlimited)</label><input id="cpLim" inputmode="numeric" value="0"></div>' +
      '<div class="field"><label>Per customer</label><input id="cpPer" inputmode="numeric" value="1"></div></div>' +
      '<button class="btn btn--primary btn--block btn--lg" id="cpSave">Create</button>');
    $('#cpSave').onclick = async () => {
      try {
        await api('/shop-admin/coupons/', {
          method: 'POST', body: {
            code: $('#cpCode').value.trim().toUpperCase(), description: $('#cpDesc').value.trim(),
            kind: $('#cpKind').value, value: $('#cpVal').value, max_discount: $('#cpMax').value || null,
            min_order_value: $('#cpMin').value || 0, usage_limit: Number($('#cpLim').value || 0),
            per_user_limit: Number($('#cpPer').value || 1), is_active: true,
          },
        });
        closeModal(); toast('Coupon created', 'ok'); renderAdmin();
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  $$('[data-cpdel]').forEach(b => b.onclick = async () => {
    await api('/shop-admin/coupons/' + b.dataset.cpdel + '/', { method: 'DELETE' }); renderAdmin();
  });
}

async function adminHistory(body) {
  const date = new Date().toISOString().slice(0, 10);
  body.innerHTML = '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">' +
    '<input type="date" id="ahDate" value="' + date + '" style="padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--ink-700);color:var(--text)">' +
    '<input id="ahQ" placeholder="Search code or phone…" style="flex:1;min-width:180px;padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--ink-700);color:var(--text);outline:none">' +
    '</div><div id="ahBody"></div>';
  const load = async () => {
    const q = $('#ahQ').value.trim();
    const d = await api('/shop-admin/orders/?' + (q ? 'search=' + encodeURIComponent(q) : 'date=' + $('#ahDate').value));
    const list = d.results || d;
    $('#ahBody').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>' +
      (list.length ? list.map(o => '<tr><td><strong>' + esc(o.code) + '</strong><br><span class="muted small">' + timeAgo(o.created_at) + '</span></td>' +
        '<td>' + esc(o.receiver_name) + '<br><span class="muted small">' + esc(o.receiver_phone) + '</span></td>' +
        '<td>' + o.total_items + '</td><td>' + money(o.grand_total) + '</td>' +
        '<td>' + esc(o.payment_mode) + '<br><span class="muted small">' + esc(o.payment_status) + '</span></td>' +
        '<td><span class="status s-' + o.status + '">' + esc(o.status_display) + '</span></td></tr>').join('')
        : '<tr><td colspan="6" class="muted">No orders found.</td></tr>') + '</tbody></table></div>';
  };
  $('#ahDate').onchange = load;
  let t; $('#ahQ').oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
  load();
}

async function adminCustomers(body) {
  const list = await api('/shop-admin/customers/');
  body.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Spent</th><th>Last order</th></tr></thead><tbody>' +
    (list.length ? list.map(c => '<tr><td>' + esc(c.full_name || '—') + '</td><td>' + esc(c.phone || '—') + '</td>' +
      '<td>' + c.order_count + '</td><td>' + money(c.spent) + '</td>' +
      '<td>' + (c.last_order_at ? timeAgo(c.last_order_at) : 'never') + '</td></tr>').join('')
      : '<tr><td colspan="5" class="muted">No customers yet.</td></tr>') + '</tbody></table></div>';
}

async function adminSettings(body) {
  const s = await api('/shop-admin/settings/');
  S.shop = s;
  const f = (id, label, val, type = 'text') =>
    '<div class="field"><label>' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(val ?? '') + '"></div>';
  body.innerHTML = '<div style="max-width:760px">' +
    '<div class="row2">' + f('stName', 'Shop name', s.name) + f('stPhone', 'Phone', s.phone) + '</div>' +
    '<div class="row2">' + f('stWa', 'WhatsApp number', s.whatsapp) + f('stTag', 'Tagline', s.tagline) + '</div>' +
    '<div class="field"><label>Address</label><input id="stAddr" value="' + esc(s.address || '') + '"></div>' +
    '<div class="row2">' + f('stLat', 'Shop latitude', s.latitude) + f('stLng', 'Shop longitude', s.longitude) + '</div>' +
    '<div class="row2">' + f('stOpen', 'Opens at', (s.opens_at || '').slice(0, 5), 'time') + f('stClose', 'Closes at', (s.closes_at || '').slice(0, 5), 'time') + '</div>' +
    '<div class="row2">' + f('stRadius', 'Delivery radius (km)', s.delivery_radius_km) + f('stFee', 'Delivery fee', s.delivery_fee) + '</div>' +
    '<div class="row2">' + f('stFree', 'Free delivery above', s.free_delivery_above) + f('stPack', 'Packing fee', s.packing_fee) + '</div>' +
    '<div class="row2">' + f('stGst', 'GST %', s.gst_percent) + f('stMin', 'Minimum order', s.min_order_value) + '</div>' +
    '<div class="row2">' + f('stEta', 'Average delivery (min)', s.avg_delivery_minutes) + f('stMsg', 'Closed message', s.closed_message) + '</div>' +
    '<div class="chips" style="margin-bottom:18px">' +
    '<button class="chip' + (s.is_open ? ' is-on' : '') + '" id="stIsOpen">Shop open</button>' +
    '<button class="chip' + (s.accepting_orders ? ' is-on' : '') + '" id="stAccept">Accepting orders</button>' +
    '<button class="chip' + (s.cod_enabled ? ' is-on' : '') + '" id="stCod">Cash on delivery</button>' +
    '<button class="chip' + (s.online_payment_enabled ? ' is-on' : '') + '" id="stOnline">Online payment</button>' +
    '</div><button class="btn btn--primary btn--lg" id="stSave">Save settings</button></div>';

  ['stIsOpen', 'stAccept', 'stCod', 'stOnline'].forEach(id => $('#' + id).onclick = () => $('#' + id).classList.toggle('is-on'));
  $('#stSave').onclick = async () => {
    try {
      S.shop = await api('/shop-admin/settings/', {
        method: 'PATCH', body: {
          name: $('#stName').value, phone: $('#stPhone').value, whatsapp: $('#stWa').value,
          tagline: $('#stTag').value, address: $('#stAddr').value,
          latitude: $('#stLat').value, longitude: $('#stLng').value,
          opens_at: $('#stOpen').value, closes_at: $('#stClose').value,
          delivery_radius_km: $('#stRadius').value, delivery_fee: $('#stFee').value,
          free_delivery_above: $('#stFree').value, packing_fee: $('#stPack').value,
          gst_percent: $('#stGst').value, min_order_value: $('#stMin').value,
          avg_delivery_minutes: Number($('#stEta').value), closed_message: $('#stMsg').value,
          is_open: $('#stIsOpen').classList.contains('is-on'),
          accepting_orders: $('#stAccept').classList.contains('is-on'),
          cod_enabled: $('#stCod').classList.contains('is-on'),
          online_payment_enabled: $('#stOnline').classList.contains('is-on'),
        },
      });
      paintShop(); toast('Settings saved', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
}
