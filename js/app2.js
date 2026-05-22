// ===== DASHBOARD =====
function renderDashboard() {
  let totSold=0, totRev=0, totStock=0, totRem=0;
  const active = PRODUCTS.filter(p=>p.isActive);
  active.forEach(p => {
    const s=getStock(p.id), so=getSold(p.id);
    totStock+=s; totSold+=so; totRev+=so*p.price; totRem+=Math.max(0,s-so);
  });
  document.getElementById('statTotalSold').textContent = totSold;
  document.getElementById('statRevenue').textContent = formatRp(totRev);
  document.getElementById('statStockIn').textContent = totStock;
  document.getElementById('statRemaining').textContent = totRem;

  const el = document.getElementById('productBreakdown');
  const hasData = active.some(p=>getStock(p.id)>0);
  if (!hasData) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>Belum ada stok untuk hari ini.</p><p>Input stok di tab <strong>Stok</strong> terlebih dahulu.</p></div>`;
  } else {
    el.innerHTML = active.map(p => {
      const s=getStock(p.id), so=getSold(p.id), rem=Math.max(0,s-so);
      const pct = s>0 ? Math.min(100,Math.round(so/s*100)) : 0;
      return `<div class="product-card" style="--product-color:${p.color}">
        <div class="product-card-header">
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-info"><h3>${p.name}</h3><p>${formatRp(so*p.price)}</p></div>
          <div class="product-pct">${pct}%</div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${p.color}"></div></div>
        <div class="product-stats">
          <div class="pstat"><span class="pstat-val">${s}</span><span class="pstat-label">Stok</span></div>
          <div class="pstat"><span class="pstat-val" style="color:${p.color}">${so}</span><span class="pstat-label">Terjual</span></div>
          <div class="pstat"><span class="pstat-val">${rem}</span><span class="pstat-label">Sisa</span></div>
        </div></div>`;
    }).join('');
  }
  const notes = document.getElementById('notesInput');
  if (notes) notes.value = dailyData.notes || '';
  // hide notes card for GKM
  const nc = document.getElementById('notesCard');
  if (nc) nc.style.display = currentUser?.role === 'gkm' ? 'none' : 'block';

  // Show/hide reset button (admin only)
  const rb = document.getElementById('resetHarianBtn');
  if (rb) {
    const hasSales = PRODUCTS.some(p => getSold(p.id) > 0);
    rb.style.display = (currentUser?.role === 'admin' && hasSales) ? 'block' : 'none';
  }
}

async function saveNotes() {
  const v = document.getElementById('notesInput')?.value.trim() || '';
  try {
    await db.collection(GKM_COL).doc(currentDate).set({ notes:v, updatedAt:firebase.firestore.FieldValue.serverTimestamp() },{ merge:true });
    showToast('✅ Catatan disimpan!');
  } catch(e){ showToast('Gagal simpan catatan.','error'); }
}

async function resetHarian(dateStr) {
  const label = dateStr === getTodayString() ? 'hari ini' : dateStr;
  if (!confirm(`Reset semua data JUAL untuk ${label}?\nStok tidak berubah, hanya penjualan yang direset ke 0.`)) return;
  try {
    const zeroed = {};
    PRODUCTS.forEach(p => zeroed[p.id] = 0);
    await db.collection(GKM_COL).doc(dateStr).set(
      { sold: zeroed, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    showToast('✅ Data jual direset!');
    // Reload history if on riwayat tab
    const histEl = document.getElementById('historyContainer');
    if (histEl && histEl.children.length) loadHistory();
  } catch(e) { showToast('Gagal reset: ' + e.message, 'error'); }
}

// ===== STOCK INPUT =====
function renderStockInputs(carryover = null) {
  const el = document.getElementById('stockInputContainer'); if (!el) return;

  // Banner notif carryover
  let banner = '';
  if (carryover) {
    banner = `<div class="carryover-banner">
      📦 Stok otomatis dari sisa <strong>${fmtShort(carryover.fromDate)}</strong>. Sesuaikan jika ada tambahan, lalu klik Simpan.
    </div>`;
  }

  el.innerHTML = banner + PRODUCTS.filter(p=>p.isActive).map(p => {
    const val = carryover ? (carryover.values[p.id] ?? 0) : getStock(p.id);
    return `<div class="stock-input-card">
      <div class="stock-emoji">${p.emoji}</div>
      <div class="stock-info"><h3>${p.name}</h3><p>${formatRp(p.price)} / cup</p></div>
      <div class="stock-number-input">
        <button class="qty-btn" onclick="adjQty('sk-${p.id}',-1)">−</button>
        <input type="number" class="qty-value" id="sk-${p.id}" value="${val}" min="0">
        <button class="qty-btn" onclick="adjQty('sk-${p.id}',1)">+</button>
      </div>
    </div>`;
  }).join('');
}

function adjQty(inputId, delta) {
  const el = document.getElementById(inputId); if(!el) return;
  el.value = Math.max(0,(parseInt(el.value)||0)+delta);
}

async function saveStock() {
  const btn = document.getElementById('saveStockBtn');
  if(btn){ btn.textContent='⏳ Menyimpan...'; btn.disabled=true; }
  const stockData = {};
  PRODUCTS.filter(p=>p.isActive).forEach(p => {
    const el = document.getElementById(`sk-${p.id}`);
    stockData[p.id] = parseInt(el?.value||0)||0;
  });
  try {
    await db.collection(GKM_COL).doc(currentDate).set(
      { date:currentDate, stock:stockData, updatedAt:firebase.firestore.FieldValue.serverTimestamp() },
      { merge:true }
    );
    showToast('✅ Stok berhasil disimpan!');
  } catch(e){ showToast('Gagal simpan stok.','error'); }
  finally { if(btn){ btn.textContent='💾 Simpan Stok'; btn.disabled=false; } }
}

// ===== CARRYOVER STOCK =====
async function fetchCarryoverStock(dateStr) {
  try {
    const snap = await db.collection(GKM_COL)
      .where('date', '<', dateStr)
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const prev = snap.docs[0].data();
    const values = {};
    let hasAny = false;
    PRODUCTS.forEach(p => {
      const s  = Number(prev.stock?.[p.id] || 0);
      const so = Number(prev.sold?.[p.id]  || 0);
      values[p.id] = Math.max(0, s - so);
      if (values[p.id] > 0) hasAny = true;
    });
    return hasAny ? { values, fromDate: prev.date } : null;
  } catch(e) {
    console.error('Carryover error:', e);
    return null;
  }
}

// ===== SALES INPUT — BUG FIX: use full sold object =====
function renderSalesInputs() {
  const el = document.getElementById('salesInputContainer'); if(!el) return;
  const active = PRODUCTS.filter(p=>p.isActive);
  const withStock = active.filter(p=>getStock(p.id)>0);
  if (!withStock.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Stok belum diinput untuk tanggal ini.</p><p>Minta Admin input stok di tab <strong>Stok</strong>.</p></div>`;
    return;
  }
  el.innerHTML = withStock.map(p => {
    const stock=getStock(p.id), sold=getSold(p.id), rem=Math.max(0,stock-sold);
    return `<div class="sales-card" style="--product-color:${p.color}">
      <div class="sales-card-top">
        <div class="sales-emoji">${p.emoji}</div>
        <div class="sales-info"><h3>${p.name}</h3><p class="sales-price">${formatRp(p.price)} / cup</p></div>
        <div class="sales-remaining">
          <span class="remaining-val" id="rem-${p.id}" style="color:${p.color}">${rem}</span>
          <span class="remaining-label">Sisa</span>
        </div>
      </div>
      <div class="sales-controls">
        <div class="sales-sold-info">Terjual: <span id="sd-${p.id}" style="color:${p.color}">${sold}</span></div>
        <div class="sales-qty-controls">
          <button class="sales-qty-btn minus" onclick="updateSold('${p.id}',-1)">−</button>
          <span class="sales-qty-display" id="sq-${p.id}">${sold}</span>
          <button class="sales-qty-btn plus"  onclick="updateSold('${p.id}',1)">+</button>
        </div>
      </div></div>`;
  }).join('');
  updateOmset();
}

async function updateSold(pid, delta) {
  const stock = getStock(pid);
  const cur   = getSold(pid);
  const next  = Math.max(0, Math.min(stock, cur + delta));
  if (next === cur) { if(delta>0) showToast('⚠️ Stok sudah habis!','warning'); return; }

  // Optimistic UI
  dailyData.sold = { ...(dailyData.sold||{}), [pid]: next };
  const sd=document.getElementById(`sd-${pid}`), sq=document.getElementById(`sq-${pid}`), rem=document.getElementById(`rem-${pid}`);
  if(sd) sd.textContent=next; if(sq) sq.textContent=next;
  if(rem) rem.textContent=Math.max(0,stock-next);
  updateOmset();

  try {
    // FIX: write full sold object — dot notation doesn't work with set()+merge for nested fields
    const updatedSold = { ...(dailyData.sold||{}) };
    await db.collection(GKM_COL).doc(currentDate).set(
      { date:currentDate, sold:updatedSold, updatedAt:firebase.firestore.FieldValue.serverTimestamp() },
      { merge:true }
    );
  } catch(e) {
    showToast('Gagal update.','error');
    dailyData.sold[pid] = cur;
    if(sd) sd.textContent=cur; if(sq) sq.textContent=cur;
    if(rem) rem.textContent=Math.max(0,stock-cur);
    updateOmset();
  }
}

function updateOmset() {
  let total=0;
  PRODUCTS.filter(p=>p.isActive).forEach(p => total+=getSold(p.id)*p.price);
  const el=document.getElementById('currentOmset'); if(el) el.textContent=formatRp(total);
}

// ===== HISTORY =====
function setDefaultFilter() {
  const today=getTodayString(), wa=new Date();
  wa.setDate(wa.getDate()-6);
  const from=wa.toISOString().split('T')[0];
  const f=document.getElementById('filterFrom'), t=document.getElementById('filterTo');
  if(f&&!f.value) f.value=from; if(t&&!t.value) t.value=today;
}

async function loadHistory() {
  const el=document.getElementById('historyContainer'); if(!el) return;
  const from=document.getElementById('filterFrom')?.value||'';
  const to=document.getElementById('filterTo')?.value||getTodayString();
  el.innerHTML=`<div class="loading"><div class="spinner"></div>Memuat...</div>`;
  try {
    let q=db.collection(GKM_COL).orderBy('date','desc');
    if(from) q=q.where('date','>=',from); if(to) q=q.where('date','<=',to);
    const snap=await q.get();
    if(snap.empty){ el.innerHTML=`<div class="empty-state"><div class="empty-icon">📭</div><p>Tidak ada data.</p></div>`; return; }
    historyData=snap.docs.map(d=>d.data());
    el.innerHTML=historyData.map(data => {
      const sold=data.sold||{};
      let totS=0,totR=0;
      PRODUCTS.forEach(p=>{totS+=Number(sold[p.id]||0);totR+=Number(sold[p.id]||0)*p.price;});
      const chips=PRODUCTS.filter(p=>Number(sold[p.id]||0)>0).map(p=>`<span class="history-chip">${p.emoji} ${sold[p.id]}</span>`).join('');
      const hasSales = PRODUCTS.some(p => Number(sold[p.id]||0) > 0);
      const resetBtn = currentUser?.role === 'admin' && hasSales
        ? `<button class="btn-sm danger" style="margin-top:10px" onclick="resetHarian('${data.date}')">🔄 Reset Jual</button>`
        : '';
      return `<div class="history-card">
        <div class="history-card-header"><div class="history-date">📅 ${fmtShort(data.date)}</div><div class="history-revenue">${formatRp(totR)}</div></div>
        <div class="history-products">${chips||'<span style="color:var(--text-muted);font-size:12px">Tidak ada penjualan</span>'}</div>
        ${data.notes?`<p style="margin-top:8px;font-size:12px;color:var(--text-muted)">💬 ${data.notes}</p>`:''}
        ${resetBtn}
      </div>`;
    }).join('');
  } catch(e){ el.innerHTML=`<div class="empty-state"><div class="empty-icon">❌</div><p>Gagal muat: ${e.message}</p></div>`; }
}

function exportCSV() {
  if(!historyData.length){showToast('Tidak ada data.','warning');return;}
  const hdr=['Tanggal',...PRODUCTS.map(p=>p.name+' Stok'),...PRODUCTS.map(p=>p.name+' Terjual'),'Total Terjual','Omset (Rp)','Catatan'];
  const rows=historyData.map(d=>{
    const s=d.stock||{},so=d.sold||{};
    let ts=0,tr=0;
    PRODUCTS.forEach(p=>{ts+=Number(so[p.id]||0);tr+=Number(so[p.id]||0)*p.price;});
    return [d.date,...PRODUCTS.map(p=>s[p.id]||0),...PRODUCTS.map(p=>so[p.id]||0),ts,tr,d.notes||''];
  });
  const csv=[hdr,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`fruttein-gkm-${getTodayString()}.csv`; a.click();
  showToast('✅ CSV didownload!');
}

// ===== ANALYTICS =====
async function loadAnalytics() {
  try {
    const wa=new Date(); wa.setDate(wa.getDate()-6);
    const from=wa.toISOString().split('T')[0], to=getTodayString();
    const snap=await db.collection(GKM_COL).where('date','>=',from).where('date','<=',to).orderBy('date','asc').get();
    const docs=snap.docs.map(d=>d.data());
    const days=[];
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];days.push(docs.find(x=>x.date===ds)||{date:ds,stock:{},sold:{}});}
    const labels=days.map(d=>fmtShort(d.date));
    const totPerDay=days.map(d=>PRODUCTS.reduce((s,p)=>s+Number(d.sold?.[p.id]||0),0));

    const ctx1=document.getElementById('salesChart')?.getContext('2d');
    if(ctx1){if(salesChart)salesChart.destroy();salesChart=new Chart(ctx1,{type:'bar',data:{labels,datasets:[{label:'Terjual',data:totPerDay,backgroundColor:'rgba(232,33,90,0.6)',borderColor:'#E8215A',borderWidth:2,borderRadius:8}]},options:cOpts('cup')});}

    const ptotals=PRODUCTS.map(p=>days.reduce((s,d)=>s+Number(d.sold?.[p.id]||0),0));
    const ctx2=document.getElementById('productChart')?.getContext('2d');
    if(ctx2){if(productChart)productChart.destroy();productChart=new Chart(ctx2,{type:'doughnut',data:{labels:PRODUCTS.map(p=>`${p.emoji} ${p.name}`),datasets:[{data:ptotals,backgroundColor:PRODUCTS.map(p=>p.color+'CC'),borderColor:PRODUCTS.map(p=>p.color),borderWidth:2,hoverOffset:8}]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{color:'#8890AA',font:{family:'Inter',weight:'600'}}},tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed} cup`}}}}});}

    const sorted=[...PRODUCTS].map((p,i)=>({...p,total:ptotals[i]})).sort((a,b)=>b.total-a.total);
    const rc=['gold','silver','bronze'];
    const tp=document.getElementById('topProducts');
    if(tp) tp.innerHTML=sorted.map((p,i)=>`<div class="top-product-row"><div class="top-rank ${rc[i]||''}">${i+1}</div><div>${p.emoji}</div><div class="top-name">${p.name}</div><div class="top-sold">${p.total} cup</div></div>`).join('');
  } catch(e){console.error(e);showToast('Gagal load analitik.','error');}
}

function cOpts(unit){return{responsive:true,plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(17,18,29,0.95)',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#F0F2FF',bodyColor:'#8890AA',padding:12,callbacks:{label:c=>` ${c.parsed.y} ${unit}`}}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8890AA',font:{family:'Inter',size:11,weight:'600'}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8890AA',font:{family:'Inter',size:11},stepSize:1}}}};}

// ===== PRODUCT MANAGEMENT =====
function renderProdukList() {
  const el=document.getElementById('produkList'); if(!el) return;
  if(!PRODUCTS.length){el.innerHTML=`<div class="empty-state"><p>Belum ada produk.</p></div>`;return;}
  el.innerHTML=PRODUCTS.map(p=>`
    <div class="produk-item ${p.isActive?'':'inactive'}">
      <div class="produk-dot" style="background:${p.color}"></div>
      <div class="produk-item-emoji">${p.emoji}</div>
      <div class="produk-item-info"><h4>${p.name}</h4><span>${formatRp(p.price)} — ${p.isActive?'✅ Aktif':'⛔ Nonaktif'}</span></div>
      <div class="produk-actions">
        <button class="btn-sm" onclick="editProduk('${p.id}')">✏️ Edit</button>
        <button class="btn-sm ${p.isActive?'danger':'success'}" onclick="toggleProduk('${p.id}',${p.isActive})">${p.isActive?'Nonaktif':'Aktifkan'}</button>
        <button class="btn-sm danger" onclick="deleteProduk('${p.id}','${p.name}')">🗑️</button>
      </div>
    </div>`).join('');
}

function editProduk(id) {
  const p=PRODUCTS.find(x=>x.id===id); if(!p) return;
  document.getElementById('editProdukId').value=id;
  document.getElementById('prodName').value=p.name;
  document.getElementById('prodEmoji').value=p.emoji;
  document.getElementById('prodPrice').value=p.price;
  document.getElementById('prodColor').value=p.color;
  document.getElementById('prodColorPicker').value=p.color;
  document.getElementById('produkFormTitle').textContent='✏️ Edit Produk';
  document.getElementById('saveProdukBtn').textContent='💾 Simpan Perubahan';
  document.getElementById('cancelProdukBtn').style.display='inline-flex';
  document.getElementById('produkFormCard').scrollIntoView({behavior:'smooth'});
}

function resetProdukForm() {
  document.getElementById('editProdukId').value='';
  document.getElementById('prodName').value='';
  document.getElementById('prodEmoji').value='';
  document.getElementById('prodPrice').value='';
  document.getElementById('prodColor').value='';
  document.getElementById('produkFormTitle').textContent='✨ Tambah Produk Baru';
  document.getElementById('saveProdukBtn').textContent='✨ Tambah Produk';
  document.getElementById('cancelProdukBtn').style.display='none';
}

async function saveProduk() {
  const name=document.getElementById('prodName').value.trim();
  const emoji=document.getElementById('prodEmoji').value.trim()||'🧃';
  const price=parseInt(document.getElementById('prodPrice').value)||0;
  const color=document.getElementById('prodColor').value.trim()||'#E8215A';
  const editId=document.getElementById('editProdukId').value;
  if(!name||!price){showToast('Nama dan harga wajib diisi.','warning');return;}

  try {
    if(editId) {
      await db.collection(PROD_COL).doc(editId).update({name,emoji,price,color});
      showToast('✅ Produk diperbarui!');
    } else {
      const id=name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
      const order=PRODUCTS.length+1;
      await db.collection(PROD_COL).doc(id).set({id,name,emoji,price,color,isActive:true,order});
      showToast('✅ Produk ditambahkan!');
    }
    await loadProducts(); renderProdukList(); resetProdukForm();
  } catch(e){showToast('Gagal simpan produk: '+e.message,'error');}
}

async function toggleProduk(id, isActive) {
  try {
    await db.collection(PROD_COL).doc(id).update({isActive:!isActive});
    await loadProducts(); renderProdukList();
    showToast(isActive?'⛔ Produk dinonaktifkan':'✅ Produk diaktifkan');
  } catch(e){showToast('Gagal ubah status.','error');}
}

async function deleteProduk(id, name) {
  if(!confirm(`Hapus produk "${name}" secara permanen?`)) return;
  try {
    await db.collection(PROD_COL).doc(id).delete();
    await loadProducts(); renderProdukList();
    showToast('🗑️ Produk dihapus.');
  } catch(e){showToast('Gagal hapus produk.','error');}
}

async function savePasswords() {
  const gkm=document.getElementById('newPassGkm')?.value.trim();
  const admin=document.getElementById('newPassAdmin')?.value.trim();
  if(!gkm&&!admin){showToast('Masukkan password baru.','warning');return;}
  try {
    const snap=await db.doc(CFG_DOC).get();
    const cur=snap.exists?snap.data():DEFAULT_CREDS;
    const updated={gkm:gkm||cur.gkm, admin:admin||cur.admin};
    await db.doc(CFG_DOC).set(updated);
    if(gkm) document.getElementById('newPassGkm').value='';
    if(admin) document.getElementById('newPassAdmin').value='';
    showToast('✅ Password berhasil diubah!');
  } catch(e){showToast('Gagal ubah password.','error');}
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', initAuth);
