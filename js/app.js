// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyCAOvfUmpytTA30lu0a3c-IYIvL8sk0Jmc",
  authDomain: "fruttein-b3a41.firebaseapp.com",
  projectId: "fruttein-b3a41",
  storageBucket: "fruttein-b3a41.firebasestorage.app",
  messagingSenderId: "278970143189",
  appId: "1:278970143189:web:5fa6462abdf907b38ead5c"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const GKM_COL = 'gkm_daily';
const PROD_COL = 'gkm_products';
const CFG_DOC = 'gkm_config/auth';

// ===== STATE =====
let PRODUCTS = [];
let currentUser = null;
let currentDate = getTodayString();
let dailyData = { stock: {}, sold: {}, notes: '' };
let historyData = [];
let unsubListener = null;
let salesChart = null, productChart = null;
let selectedRole = null;

const DEFAULT_CREDS = { gkm: 'gkm123', admin: 'fruttein2026' };

const ROLE_TABS = {
  gkm:   ['dashboard', 'jual'],
  admin: ['stok', 'riwayat', 'analitik', 'produk']
};

const DEFAULT_PRODUCTS = [
  { id: 'nanamango', name: 'Nanamango', price: 17000, emoji: '🥭', color: '#E8215A', isActive: true, order: 1 },
  { id: 'stropis',   name: 'Stropis',   price: 17000, emoji: '🍓', color: '#FF8FA3', isActive: true, order: 2 },
  { id: 'banavoca',  name: 'Banavoca',  price: 17000, emoji: '🥑', color: '#5DBB7A', isActive: true, order: 3 }
];

// ===== HELPERS =====
function getTodayString() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function formatRp(n) { return 'Rp\u00A0' + Number(n||0).toLocaleString('id-ID'); }

function fmtDate(s) {
  if (!s) return '';
  return new Date(s+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}

function fmtShort(s) {
  if (!s) return '';
  return new Date(s+'T00:00:00').toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'});
}

function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.className='toast', 3000);
}

function getStock(id) { return Number(dailyData.stock?.[id] || 0); }
function getSold(id)  { return Number(dailyData.sold?.[id]  || 0); }

// ===== AUTH =====
async function initAuth() {
  const saved = sessionStorage.getItem('gkm_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    await loadProducts();
    showApp();
  } else {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appContainer').style.display  = 'none';
  }
}

function selectRole(role) {
  selectedRole = role;
  const labels = { gkm: '🛒 GKM', admin: '🍹 Fruttein Admin' };
  document.getElementById('roleSelect').style.display = 'none';
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('loginFormRole').textContent = labels[role];
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  setTimeout(() => document.getElementById('loginPassword').focus(), 100);
}

function backToSelect() {
  document.getElementById('roleSelect').style.display = 'block';
  document.getElementById('loginForm').style.display = 'none';
  selectedRole = null;
}

async function doLogin() {
  const pass = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const snap = await db.doc(CFG_DOC).get();
    const creds = snap.exists ? snap.data() : DEFAULT_CREDS;
    if (creds[selectedRole] !== pass) {
      errEl.textContent = '❌ Password salah, coba lagi.';
      return;
    }
  } catch(e) {
    if (DEFAULT_CREDS[selectedRole] !== pass) {
      errEl.textContent = '❌ Password salah, coba lagi.';
      return;
    }
  }
  const labels = { gkm: 'GKM', admin: 'Fruttein Admin' };
  currentUser = { role: selectedRole, label: labels[selectedRole] };
  sessionStorage.setItem('gkm_user', JSON.stringify(currentUser));
  await loadProducts();
  showApp();
}

function logout() {
  sessionStorage.removeItem('gkm_user');
  if (unsubListener) unsubListener();
  currentUser = null; PRODUCTS = [];
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('appContainer').style.display  = 'none';
  document.getElementById('roleSelect').style.display = 'block';
  document.getElementById('loginForm').style.display  = 'none';
}

function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appContainer').style.display  = 'block';
  applyRoleUI();
  initApp();
}

function applyRoleUI() {
  const allowed = ROLE_TABS[currentUser.role];
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    btn.style.display = allowed.includes(tab) ? 'flex' : 'none';
  });
  const badge = document.getElementById('userBadge');
  if (badge) badge.textContent = currentUser.label;
}

// ===== PRODUCTS FROM FIRESTORE =====
async function loadProducts() {
  try {
    const snap = await db.collection(PROD_COL).orderBy('order','asc').get();
    if (snap.empty) {
      await seedProducts();
      PRODUCTS = [...DEFAULT_PRODUCTS];
    } else {
      PRODUCTS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch(e) { PRODUCTS = [...DEFAULT_PRODUCTS]; }
}

async function seedProducts() {
  const batch = db.batch();
  DEFAULT_PRODUCTS.forEach(p => {
    batch.set(db.collection(PROD_COL).doc(p.id), p);
  });
  await batch.commit();
}

// ===== APP INIT =====
function initApp() {
  const today = getTodayString();
  ['dashDate','stokDate','jualDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = today;
  });
  updateDateLabels();
  subscribeToDate(today);
  showTab(ROLE_TABS[currentUser.role][0]);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) showTab(tab);
    });
  });

  const picker = document.getElementById('prodColorPicker');
  const colorIn = document.getElementById('prodColor');
  if (picker && colorIn) {
    picker.addEventListener('input', () => colorIn.value = picker.value);
    colorIn.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(colorIn.value)) picker.value = colorIn.value; });
  }
}

// ===== NAVIGATION =====
function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`tab-${tabId}`);
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'analitik') loadAnalytics();
  if (tabId === 'riwayat') { setDefaultFilter(); loadHistory(); }
  if (tabId === 'produk') renderProdukList();
}

// ===== DATE =====
function changeDate(dateStr) {
  if (!dateStr) return;
  currentDate = dateStr;
  ['dashDate','stokDate','jualDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = dateStr;
  });
  updateDateLabels();
  subscribeToDate(dateStr);
}

function goToToday() { changeDate(getTodayString()); }

function updateDateLabels() {
  const isToday = currentDate === getTodayString();
  const el = document.getElementById('headerDateLabel');
  if (el) el.textContent = isToday ? '📅 Hari Ini' : fmtDate(currentDate);
  const dl = document.getElementById('dashDateLabel');
  if (dl) dl.textContent = fmtDate(currentDate);
}

// ===== FIRESTORE LISTENER =====
function subscribeToDate(dateStr) {
  if (unsubListener) unsubListener();
  unsubListener = db.collection(GKM_COL).doc(dateStr).onSnapshot(async doc => {
    if (doc.exists) {
      dailyData = doc.data();
      renderDashboard();
      renderStockInputs(null);
      renderSalesInputs();
    } else {
      dailyData = { stock:{}, sold:{}, notes:'' };
      // Fetch sisa stok dari hari sebelumnya
      const carryover = await fetchCarryoverStock(dateStr);
      renderDashboard();
      renderStockInputs(carryover);
      renderSalesInputs();
    }
  }, err => { console.error(err); showToast('Gagal memuat data.','error'); });
}
