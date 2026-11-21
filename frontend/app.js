/**
 * Shokh Restaurant - Main Frontend Application Logic
 */

// State
let currentTab = 'dashboard';
let currentPin = '';
let staffData = [];
let inventoryData = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  refreshAllData();

  setInterval(() => {
    if (currentTab === 'dashboard') loadStats();
    if (currentTab === 'attendance') loadAttendance();
  }, 15000);
});

// Role selection auto-fills hourly rate
function handleRoleChange(val) {
  const [role, rate] = val.split('|');
  const rateInput = document.getElementById('staff-rate-input');
  if (rateInput && rate) {
    rateInput.value = rate;
  }
}

// Tab Switcher
function switchTab(tabId) {
  currentTab = tabId;

  document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
  const activeTabEl = document.getElementById(`tab-${tabId}`);
  if (activeTabEl) activeTabEl.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/20');
    el.classList.add('text-slate-300');
  });
  const navBtn = document.getElementById(`nav-${tabId}`);
  if (navBtn) {
    navBtn.classList.remove('text-slate-300');
    navBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-500/20');
  }

  document.querySelectorAll('.mobile-nav-btn').forEach(el => {
    el.classList.remove('text-indigo-400', 'font-bold');
    el.classList.add('text-slate-400');
  });
  const mobBtn = document.getElementById(`mob-${tabId}`);
  if (mobBtn) {
    mobBtn.classList.remove('text-slate-400');
    mobBtn.classList.add('text-indigo-400', 'font-bold');
  }

  const titleMap = {
    dashboard: { title: "Boshqaruv Paneli", desc: "Shokh Restaurant — 10:00 - 23:00 (1-smena: 09:00 - 19:00 | 2-smena: 13:00 - 23:00)" },
    attendance: { title: "Kirdi-Chiqdi va Jarimalar", desc: "Smena vaqti nazorati, kechikishlar va 20 000 — 200 000 so'm jarimalar" },
    staff: { title: "Xodimlar Iyerarxiyasi", desc: "Stajor, Povur, Universal, Lider (1 & 2), Menejer, Direktor va Tozalik" },
    payroll: { title: "Soatbay Ish Haqi (Payroll)", desc: "Ishlangan soatlar va stavkalar bo'yicha toza hisoblangan oyliklar" },
    inventory: { title: "Ombor va Mahsulotlar Sifati", desc: "Go'sht, sabzavotlar, souslar zaxirasi va yaroqlilik muddati nazorati" },
    menu: { title: "Taomlar, Yarim Tayyor Issiq Ovqatlar va Souslar", desc: "Retseptura, porsiya va tayyorlanish muddatlari" },
    equipment: { title: "Jihozlar va Inventarlar Holati", desc: "Pechlar, fityur, sovutgich va oshxona inventarlarining ishga yaroqliligi" },
    ai: { title: "ShokhAI Aqlli Yordamchisi", desc: "Restoran strategiyasi va ma'lumotlar bazasi asosida jonli tahlil" },
    bot: { title: "Telegram Bot Boshqaruvi", desc: "Telegram orqali kirdi-chiqdi qilish va xabarnomalar" }
  };

  if (titleMap[tabId]) {
    document.getElementById('view-title').innerText = titleMap[tabId].title;
    document.getElementById('view-desc').innerText = titleMap[tabId].desc;
  }

  if (tabId === 'dashboard') loadStats();
  if (tabId === 'attendance') loadAttendance();
  if (tabId === 'staff') loadStaff();
  if (tabId === 'payroll') loadPayroll();
  if (tabId === 'inventory') { loadInventory(); loadTransactions(); }
  if (tabId === 'menu') loadMenu();
  if (tabId === 'equipment') loadEquipment();
}

async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadStaff(),
    loadInventory(),
    loadMenu(),
    loadEquipment()
  ]);
}

// 1. Load Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    document.getElementById('stat-active-staff').innerText = data.active_staff_now;
    document.getElementById('stat-total-staff').innerText = `/ ${data.total_staff} xodim`;
    document.getElementById('stat-today-hours').innerText = data.today_hours;
    document.getElementById('stat-low-stock').innerText = data.low_stock_count;
    document.getElementById('stat-inventory-val').innerText = Number(data.inventory_value).toLocaleString();

    loadDashboardActiveStaff();
    loadDashboardLowStock();
  } catch (err) {
    console.error("Stats load error:", err);
  }
}

async function loadDashboardActiveStaff() {
  try {
    const res = await fetch('/api/staff');
    staffData = await res.json();
    const working = staffData.filter(s => s.is_working > 0);
    const tbody = document.getElementById('dashboard-active-staff-table');
    
    if (working.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-500">Hozirda hech kim ishga kelmagan</td></tr>`;
      return;
    }

    tbody.innerHTML = working.map(s => `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3 flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
            ${s.name.charAt(0)}
          </div>
          <div>
            <span class="font-semibold text-white">${s.name}</span>
            <p class="text-[10px] text-slate-400">${s.shift_preference}</p>
          </div>
        </td>
        <td class="py-3 text-amber-300 font-medium text-xs">${s.role}</td>
        <td class="py-3 text-emerald-400 text-xs font-mono">
          🟢 ${s.current_clock_in ? s.current_clock_in.split(' ')[1].slice(0, 5) : 'Faol'}
        </td>
        <td class="py-3 text-slate-300 text-xs">${Number(s.hourly_rate).toLocaleString()} so'm/s</td>
        <td class="py-3 text-right">
          <button onclick="directClockOut(${s.id}, '${s.name}')" class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-semibold">
            Ketdi (Tugatish)
          </button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

async function loadDashboardLowStock() {
  try {
    const res = await fetch('/api/inventory');
    inventoryData = await res.json();
    const critical = inventoryData.filter(i => i.current_stock <= i.min_stock || i.freshness_status === 'muddati_yaqin');
    const container = document.getElementById('dashboard-low-stock-list');

    if (critical.length === 0) {
      container.innerHTML = `<p class="text-xs text-emerald-400">✅ Barcha go'sht, sabzavot va souslar me'yorda!</p>`;
      return;
    }

    container.innerHTML = critical.map(i => {
      const isExpiring = i.freshness_status === 'muddati_yaqin';
      return `
        <div class="p-2.5 rounded-xl ${isExpiring ? 'bg-amber-950/30 border border-amber-900/40' : 'bg-rose-950/20 border border-rose-900/30'} flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-white">${i.name}</p>
            <p class="text-[11px] text-slate-400">${isExpiring ? `Yaroqlilik: ${i.expiry_date}` : `Qoldiq: ${i.current_stock} ${i.unit}`}</p>
          </div>
          <div class="text-right">
            <span class="px-2 py-0.5 rounded-md ${isExpiring ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-400'} text-xs font-bold font-mono">
              ${isExpiring ? 'Muddati yaqin' : 'Kam qoldi'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

// 2. Load Attendance History & Penalties
async function loadAttendance() {
  try {
    const res = await fetch('/api/attendance');
    const records = await res.json();
    const tbody = document.getElementById('attendance-table-body');

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-500">Hech qanday davomat yozuvi yo'q</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const isOngoing = !r.clock_out;
      const earned = Math.round((r.total_hours || 0) * (r.hourly_rate || 0));
      const hasPenalty = r.penalty_amount > 0;

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3">
            <p class="font-semibold text-white">${r.staff_name}</p>
            <span class="text-[11px] text-indigo-400">${r.shift_name || '1-smena'}</span>
          </td>
          <td class="py-3 text-amber-300 text-xs">${r.staff_role}</td>
          <td class="py-3 text-xs font-mono text-slate-300">
            ${r.clock_in}
            ${r.is_late ? `<span class="ml-1 text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1 py-0.5 rounded">-${r.late_minutes} daq.</span>` : ''}
          </td>
          <td class="py-3 text-xs font-mono ${isOngoing ? 'text-amber-400 italic' : 'text-slate-300'}">
            ${r.clock_out || 'Hozir smenada'}
          </td>
          <td class="py-3 text-xs font-bold ${isOngoing ? 'text-emerald-400' : 'text-slate-200'}">
            ${isOngoing ? 'Davom etmoqda' : `${r.total_hours} soat`}
          </td>
          <td class="py-3 text-xs text-slate-200">
            ${isOngoing ? '—' : `${Number(earned).toLocaleString()} so'm`}
            ${hasPenalty ? `<p class="text-[10px] text-rose-400 font-bold">Jarima: -${Number(r.penalty_amount).toLocaleString()} so'm (${r.penalty_reason})</p>` : ''}
          </td>
          <td class="py-3 text-right flex items-center justify-end gap-1.5 pt-4">
            ${!hasPenalty ? `
              <button onclick="openPenaltyModal(${r.id}, '${r.staff_name}')" class="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-[11px] font-semibold" title="Jarima belgilash">
                ⚠️ Jarima
              </button>
            ` : `
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                Jarimada
              </span>
            `}
            ${isOngoing ? `
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30">
                🟢 Ishda
              </span>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Attendance load error:", e);
  }
}

// 3. Load Staff Grid
async function loadStaff() {
  try {
    const res = await fetch('/api/staff');
    staffData = await res.json();
    const grid = document.getElementById('staff-grid');

    grid.innerHTML = staffData.map(s => {
      const isWorking = s.is_working > 0;

      return `
        <div class="p-5 rounded-2xl glass-card space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div class="flex items-center justify-between">
            <div class="w-10 h-10 rounded-xl ${isWorking ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} font-bold flex items-center justify-center text-sm shadow">
              👑
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${isWorking ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}">
                ${isWorking ? '🟢 Smenada' : '⚪ Damda'}
              </span>
              <button onclick="deleteStaff(${s.id}, '${s.name}')" class="text-slate-500 hover:text-rose-400 font-bold text-sm px-1.5 py-0.5 rounded hover:bg-slate-800 transition-all" title="Xodimni o'chirish">
                ✕
              </button>
            </div>
          </div>

          <div>
            <h4 class="font-bold text-white text-base">${s.name}</h4>
            <p class="text-xs text-amber-300 font-bold">${s.role}</p>
            <p class="text-[11px] text-slate-400">${s.shift_preference}</p>
          </div>

          <div class="pt-2 border-t border-slate-800 text-xs space-y-1.5 text-slate-400">
            <div class="flex justify-between">
              <span>Telefon:</span>
              <span class="text-slate-200">${s.phone || '—'}</span>
            </div>
            <div class="flex justify-between">
              <span>PIN-Kodi:</span>
              <span class="font-mono text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">${s.pin_code}</span>
            </div>
            <div class="flex justify-between">
              <span>Soatlik stavkasi:</span>
              <span class="text-emerald-400 font-bold">${Number(s.hourly_rate).toLocaleString()} so'm/soat</span>
            </div>
          </div>

          <div class="pt-2">
            ${isWorking ? `
              <button onclick="directClockOut(${s.id}, '${s.name}')" class="w-full py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all">
                🔴 Smenani tugatish
              </button>
            ` : `
              <button onclick="directClockIn(${s.id}, '${s.name}')" class="w-full py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all">
                🟢 Smenaga keldi
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error("Staff load error:", e);
  }
}

// 4. Load Payroll Table
async function loadPayroll() {
  try {
    const res = await fetch('/api/payroll');
    const records = await res.json();
    const tbody = document.getElementById('payroll-table-body');
    let totalAll = 0;

    tbody.innerHTML = records.map(p => {
      totalAll += p.net_payable;

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3 font-semibold text-white">${p.name}</td>
          <td class="py-3 text-amber-300 font-semibold text-xs">${p.role}</td>
          <td class="py-3 text-slate-300 text-xs">${Number(p.hourly_rate).toLocaleString()} so'm/s</td>
          <td class="py-3 text-indigo-400 font-bold text-xs">${p.total_hours} soat</td>
          <td class="py-3 text-emerald-400 font-bold text-sm">${Number(p.net_payable).toLocaleString()} so'm</td>
          <td class="py-3 text-right">
            ${p.penalty > 0 ? `
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/30">
                -${Number(p.penalty).toLocaleString()} jarima
              </span>
            ` : `
              <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs border border-slate-700">
                Toza hisob
              </span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('payroll-total-amount').innerText = `${Number(totalAll).toLocaleString()} so'm`;
  } catch (e) {
    console.error("Payroll load error:", e);
  }
}

// 5. Load Inventory & Expiry
async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    inventoryData = await res.json();
    const tbody = document.getElementById('inventory-table-body');
    const select = document.getElementById('trans-product-select');

    select.innerHTML = inventoryData.map(i => `
      <option value="${i.id}">${i.name} (Qoldiq: ${i.current_stock} ${i.unit})</option>
    `).join('');

    tbody.innerHTML = inventoryData.map(i => {
      const isLow = i.current_stock <= i.min_stock;
      const isExpiring = i.freshness_status === 'muddati_yaqin';
      const totalVal = i.current_stock * i.unit_price;

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3">
            <p class="font-semibold text-white">${i.name}</p>
            <p class="text-[11px] text-slate-400">Yaroqlilik: <span class="${isExpiring ? 'text-amber-400 font-bold' : 'text-slate-300'}">${i.expiry_date || 'Tekshirilgan'}</span></p>
          </td>
          <td class="py-3 text-slate-400 text-xs">${i.category}</td>
          <td class="py-3 text-xs font-bold ${isLow ? 'text-rose-400' : 'text-slate-200'}">
            ${i.current_stock} ${i.unit}
          </td>
          <td class="py-3 text-slate-400 text-xs">${i.min_stock} ${i.unit}</td>
          <td class="py-3 text-slate-300 text-xs">${Number(i.unit_price).toLocaleString()} so'm</td>
          <td class="py-3 text-slate-200 text-xs font-semibold">${Number(totalVal).toLocaleString()} so'm</td>
          <td class="py-3 text-right flex items-center justify-end gap-2 pt-4">
            ${isExpiring ? `
              <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/30">
                🟡 Muddati yaqin
              </span>
            ` : isLow ? `
              <span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[11px] font-bold border border-rose-500/30">
                🔴 Kam qoldi
              </span>
            ` : `
              <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30">
                🟢 Yaroqli
              </span>
            `}
            <button onclick="deleteProduct(${i.id}, '${i.name}')" class="text-slate-500 hover:text-rose-400 font-bold text-sm px-1.5 py-0.5 rounded hover:bg-slate-800 transition-all" title="Mahsulotni o'chirish">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Inventory load error:", e);
  }
}

// 6. Load Menu Items (Yarim tayyor ovqatlar va souslar)
async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const items = await res.json();
    const grid = document.getElementById('menu-grid');
    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = `<p class="text-xs text-slate-500 col-span-3">Hozircha menyu taomlari kiritilmagan</p>`;
      return;
    }

    grid.innerHTML = items.map(m => `
      <div class="p-5 rounded-2xl glass-card space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[11px] border border-amber-500/30">
            ${m.category}
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-slate-400">⏱️ ~${m.prep_time_minutes} daq.</span>
            <button onclick="deleteMenu(${m.id}, '${m.name}')" class="text-slate-500 hover:text-rose-400 font-bold text-sm px-1.5 py-0.5 rounded hover:bg-slate-800 transition-all" title="O'chirish">
              ✕
            </button>
          </div>
        </div>
        <div>
          <h4 class="font-bold text-white text-base">${m.name}</h4>
          <p class="text-xs text-slate-300 leading-relaxed mt-1">${m.recipe_notes || 'Retseptura kiritilmagan'}</p>
        </div>
        <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
          <span class="text-xs text-slate-400">Porsiya narxi:</span>
          <span class="text-base font-extrabold text-amber-400">${Number(m.price).toLocaleString()} so'm</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("Menu load error:", e);
  }
}

// 7. Load Equipment & Assets
async function loadEquipment() {
  try {
    const res = await fetch('/api/equipment');
    const items = await res.json();
    const grid = document.getElementById('equipment-grid');
    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = `<p class="text-xs text-slate-500 col-span-3">Jihozlar ro'yxati bo'sh</p>`;
      return;
    }

    grid.innerHTML = items.map(eq => {
      const isGood = eq.condition === 'yaroqli';
      const isWarn = eq.condition === 'tamir_talab';

      return `
        <div class="p-5 rounded-2xl glass-card space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs text-indigo-400 font-semibold">${eq.category}</span>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isGood ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isWarn ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">
                ${isGood ? '🟢 Soz (Yaroqli)' : isWarn ? '🟡 Ta\'mir talab' : '🔴 Yaroqsiz'}
              </span>
              <button onclick="deleteEquipment(${eq.id}, '${eq.name}')" class="text-slate-500 hover:text-rose-400 font-bold text-sm px-1.5 py-0.5 rounded hover:bg-slate-800 transition-all" title="O'chirish">
                ✕
              </button>
            </div>
          </div>
          <div>
            <h4 class="font-bold text-white text-base">${eq.name}</h4>
            <p class="text-xs text-slate-400">Joylashuvi: <strong class="text-slate-200">${eq.location}</strong></p>
            <p class="text-xs text-slate-400 mt-1 italic">${eq.notes || 'Izoh yo\'q'}</p>
          </div>
          <div class="pt-2 border-t border-slate-800 text-[11px] text-slate-500">
            Oxirgi tekshiruv: ${eq.last_inspected || 'Bugun'}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error("Equipment load error:", e);
  }
}

async function loadTransactions() {
  try {
    const res = await fetch('/api/transactions');
    const list = await res.json();
    const tbody = document.getElementById('transactions-table-body');

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-500">Kirim/chiqim tarixi bo'sh</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const isKirim = t.type === 'kirim';
      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3 text-xs font-mono text-slate-400">${t.created_at}</td>
          <td class="py-3 text-xs">
            <span class="px-2 py-0.5 rounded-full font-bold ${isKirim ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}">
              ${isKirim ? '📥 Kirim' : '📤 Chiqim'}
            </span>
          </td>
          <td class="py-3 font-semibold text-white text-xs">${t.product_name}</td>
          <td class="py-3 text-xs font-mono font-bold ${isKirim ? 'text-emerald-400' : 'text-rose-400'}">
            ${isKirim ? '+' : '-'}${t.quantity} ${t.unit}
          </td>
          <td class="py-3 text-xs text-slate-200 font-semibold">${Number(t.total_cost).toLocaleString()} so'm</td>
          <td class="py-3 text-xs text-slate-400">${t.reason || '—'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error("Transactions load error:", e);
  }
}

// ================= PENALTY MODAL =================
function openPenaltyModal(attendanceId, staffName) {
  document.getElementById('penalty-att-id').value = attendanceId;
  document.getElementById('penalty-staff-name').value = staffName;
  document.getElementById('penalty-amount-input').value = 20000;
  document.getElementById('penalty-reason-input').value = "20 daqiqa sababsiz kechikish";
  document.getElementById('modal-penalty').classList.remove('hidden');
}

function closePenaltyModal() {
  document.getElementById('modal-penalty').classList.add('hidden');
}

async function handlePenaltySubmit(e) {
  e.preventDefault();
  const attendance_id = document.getElementById('penalty-att-id').value;
  const penalty_amount = document.getElementById('penalty-amount-input').value;
  const reason = document.getElementById('penalty-reason-input').value;

  try {
    const res = await fetch('/api/attendance/penalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendance_id, penalty_amount, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closePenaltyModal();
      loadAttendance();
      loadStats();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik yuz berdi", true);
  }
}

// ================= MENU MODAL =================
function openAddMenuModal() {
  document.getElementById('modal-add-menu').classList.remove('hidden');
}
function closeAddMenuModal() {
  document.getElementById('modal-add-menu').classList.add('hidden');
}
async function handleAddMenu(e) {
  e.preventDefault();
  const name = document.getElementById('menu-name-input').value;
  const category = document.getElementById('menu-cat-input').value;
  const price = document.getElementById('menu-price-input').value;
  const prep_time_minutes = document.getElementById('menu-time-input').value;
  const recipe_notes = document.getElementById('menu-recipe-input').value;

  try {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, prep_time_minutes, recipe_notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Taom/sous menyuga qo'shildi!");
      closeAddMenuModal();
      e.target.reset();
      loadMenu();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik", true);
  }
}

// ================= EQUIPMENT MODAL =================
function openAddEquipmentModal() {
  document.getElementById('modal-add-equipment').classList.remove('hidden');
}
function closeAddEquipmentModal() {
  document.getElementById('modal-add-equipment').classList.add('hidden');
}
async function handleAddEquipment(e) {
  e.preventDefault();
  const name = document.getElementById('eq-name-input').value;
  const category = document.getElementById('eq-cat-input').value;
  const condition = document.getElementById('eq-cond-input').value;
  const location = document.getElementById('eq-loc-input').value;
  const notes = document.getElementById('eq-notes-input').value;

  try {
    const res = await fetch('/api/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, condition, location, notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Jihoz ro'yxatga olindi!");
      closeAddEquipmentModal();
      e.target.reset();
      loadEquipment();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik", true);
  }
}

// ================= PIN KIOSK LOGIC =================
function openPinModal() {
  currentPin = '';
  updatePinDisplay();
  document.getElementById('modal-pin').classList.remove('hidden');
}

function closePinModal() {
  document.getElementById('modal-pin').classList.add('hidden');
  currentPin = '';
}

function pressPin(digit) {
  if (currentPin.length < 6) {
    currentPin += digit;
    updatePinDisplay();
  }
}

function clearPin() {
  currentPin = '';
  updatePinDisplay();
}

function updatePinDisplay() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < currentPin.length) {
      dot.classList.remove('bg-slate-700');
      dot.classList.add('bg-emerald-400', 'shadow', 'shadow-emerald-500/50');
    } else {
      dot.classList.add('bg-slate-700');
      dot.classList.remove('bg-emerald-400', 'shadow', 'shadow-emerald-500/50');
    }
  });
}

async function submitPinAction() {
  if (currentPin.length < 4) {
    showToast("PIN-kod kamida 4 xonali bo'lishi kerak!", true);
    return;
  }

  const action = document.querySelector('input[name="kiosk_action"]:checked').value;
  const endpoint = action === 'clock-in' ? '/api/attendance/clock-in' : '/api/attendance/clock-out';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_code: currentPin })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message);
      closePinModal();
      refreshAllData();
      if (currentTab === 'attendance') loadAttendance();
    } else {
      showToast(data.error || "Xatolik yuz berdi", true);
    }
  } catch (e) {
    showToast("Server bilan ulanishda xatolik", true);
  }
}

async function directClockIn(staffId, staffName) {
  try {
    const res = await fetch('/api/attendance/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      refreshAllData();
    } else {
      showToast(data.error, true);
    }
  } catch (e) {
    showToast("Xatolik", true);
  }
}

async function directClockOut(staffId, staffName) {
  try {
    const res = await fetch('/api/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🔴 ${staffName} smenani yakunladi! (${data.hours_worked} soat)`);
      refreshAllData();
    } else {
      showToast(data.error, true);
    }
  } catch (e) {
    showToast("Xatolik", true);
  }
}

// Add Staff Modal
function openAddStaffModal() {
  document.getElementById('modal-add-staff').classList.remove('hidden');
}
function closeAddStaffModal() {
  document.getElementById('modal-add-staff').classList.add('hidden');
}
async function handleAddStaff(e) {
  e.preventDefault();
  const name = document.getElementById('staff-name-input').value;
  const roleSelectVal = document.getElementById('staff-role-select').value;
  const role = roleSelectVal.split('|')[0];
  const shift_preference = document.getElementById('staff-shift-input').value;
  const phone = document.getElementById('staff-phone-input').value;
  const pin = document.getElementById('staff-pin-input').value;
  const rate = document.getElementById('staff-rate-input').value;

  try {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, phone, pin_code: pin, hourly_rate: rate, shift_preference })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Yangi xodim qo'shildi!");
      closeAddStaffModal();
      e.target.reset();
      loadStaff();
      loadStats();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik", true);
  }
}

// Add Product Modal
function openAddProductModal() {
  document.getElementById('modal-add-product').classList.remove('hidden');
}
function closeAddProductModal() {
  document.getElementById('modal-add-product').classList.add('hidden');
}
async function handleAddProduct(e) {
  e.preventDefault();
  const name = document.getElementById('product-name-input').value;
  const category = document.getElementById('product-cat-input').value;
  const unit = document.getElementById('product-unit-input').value;
  const current_stock = document.getElementById('product-stock-input').value;
  const min_stock = document.getElementById('product-min-input').value;
  const unit_price = document.getElementById('product-price-input').value;

  try {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, unit, current_stock, min_stock, unit_price })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Mahsulot omborga kiritildi!");
      closeAddProductModal();
      e.target.reset();
      loadInventory();
      loadStats();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik", true);
  }
}

// Transaction Modal
function openTransactionModal(defaultType = 'kirim') {
  if (defaultType === 'kirim') {
    document.getElementById('trans-type-kirim').checked = true;
  } else {
    document.getElementById('trans-type-chiqim').checked = true;
  }
  document.getElementById('modal-transaction').classList.remove('hidden');
}
function closeTransactionModal() {
  document.getElementById('modal-transaction').classList.add('hidden');
}
async function handleTransactionSubmit(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="trans_type"]:checked').value;
  const product_id = document.getElementById('trans-product-select').value;
  const quantity = document.getElementById('trans-qty-input').value;
  const reason = document.getElementById('trans-reason-input').value;

  try {
    const res = await fetch('/api/inventory/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id, type, quantity, reason })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      closeTransactionModal();
      e.target.reset();
      loadInventory();
      loadTransactions();
      loadStats();
    } else {
      showToast(data.error, true);
    }
  } catch (err) {
    showToast("Xatolik", true);
  }
}

// ================= AI ASSISTANT CHAT =================
async function askPresetAi(question) {
  document.getElementById('ai-prompt-input').value = question;
  await submitAiPrompt(question);
}

async function handleAiSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('ai-prompt-input');
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  await submitAiPrompt(prompt);
}

async function submitAiPrompt(prompt) {
  const chatBox = document.getElementById('ai-chat-box');

  chatBox.innerHTML += `
    <div class="flex gap-3 justify-end">
      <div class="p-3.5 rounded-2xl rounded-tr-none bg-indigo-600 text-sm text-white max-w-2xl leading-relaxed shadow">
        ${escapeHtml(prompt)}
      </div>
      <div class="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-sm shrink-0">
        👤
      </div>
    </div>
  `;

  const loadingId = 'ai-loading-' + Date.now();
  chatBox.innerHTML += `
    <div id="${loadingId}" class="flex gap-3">
      <div class="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-sm shrink-0 animate-pulse text-slate-950 font-bold">
        👑
      </div>
      <div class="p-3.5 rounded-2xl rounded-tl-none bg-slate-800 text-xs text-amber-400 border border-slate-700/60 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
        ShokhAI tahlil qilmoqda...
      </div>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    document.getElementById(loadingId)?.remove();

    chatBox.innerHTML += `
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm shrink-0 shadow">
          👑
        </div>
        <div class="p-4 rounded-2xl rounded-tl-none bg-slate-800/90 text-sm text-slate-200 border border-slate-700/60 max-w-2xl leading-relaxed whitespace-pre-wrap">
${renderMarkdownSimple(data.reply)}
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById(loadingId)?.remove();
    chatBox.innerHTML += `
      <div class="p-3 rounded-xl bg-rose-950/40 text-rose-400 text-xs">
        Xatolik: Javob olib bo'lmadi.
      </div>
    `;
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ================= TELEGRAM SIMULATOR =================
function sendSimMessage(msg) {
  document.getElementById('sim-input').value = msg;
  submitSim(msg);
}

function handleSimSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('sim-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  submitSim(msg);
}

async function submitSim(msg) {
  const container = document.getElementById('sim-messages');

  container.innerHTML += `
    <div class="flex justify-end">
      <div class="p-2 rounded-xl rounded-tr-none bg-sky-600 text-white max-w-[80%]">
        ${escapeHtml(msg)}
      </div>
    </div>
  `;
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/bot/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, user_name: "Bobur Mirzayev" })
    });
    const data = await res.json();

    container.innerHTML += `
      <div class="flex justify-start">
        <div class="p-2.5 rounded-xl rounded-tl-none bg-slate-800 text-slate-200 border border-slate-700/60 max-w-[85%] whitespace-pre-wrap">
${renderMarkdownSimple(data.reply)}
        </div>
      </div>
    `;
    refreshAllData();
  } catch (e) {
    console.error(e);
  }
  container.scrollTop = container.scrollHeight;
}

// Toast
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');

  icon.innerText = isError ? '⚠️' : '✅';
  msg.innerText = message;
  toast.classList.remove('translate-y-20', 'opacity-0');

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdownSimple(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

// ================= DELETE & RESET HANDLERS =================
async function confirmResetDatabase() {
  const confirmed = confirm("Haqiqatan ham barcha test ma'lumotlarini tozalab, tizimni toza noldan boshlamoqchimisiz?\n\n(Bu barcha xodimlar, tovarlar, taomlar va jurnallarni tozalaydi, keyin o'zingiz xohlagancha yangitdan kiritasiz).");
  if (!confirmed) return;

  try {
    const res = await fetch('/api/database/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      refreshAllData();
    }
  } catch (e) {
    showToast("Tozalashda xatolik", true);
  }
}

async function deleteStaff(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" xodimini o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch('/api/staff/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} o'chirildi!`);
      loadStaff();
      loadStats();
    }
  } catch (e) { showToast("Xatolik", true); }
}

async function deleteProduct(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" mahsulotini ombordan o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch('/api/inventory/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} o'chirildi!`);
      loadInventory();
      loadStats();
    }
  } catch (e) { showToast("Xatolik", true); }
}

async function deleteMenu(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" taomini menyudan o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch('/api/menu/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} menyudan o'chirildi!`);
      loadMenu();
    }
  } catch (e) { showToast("Xatolik", true); }
}

async function deleteEquipment(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" jihozini ro'yxatdan o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch('/api/equipment/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} ro'yxatdan o'chirildi!`);
      loadEquipment();
    }
  } catch (e) { showToast("Xatolik", true); }
}
