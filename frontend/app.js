/**
 * Shokh Restaurant - Full Frontend Application Logic
 * Supporting:
 * - Admin Authentication (Password: shokh2006)
 * - Visual Charts & Statistics (7 days attendance & payroll)
 * - Shift Schedule (Smena jadvali - 14 days)
 * - Expiry & Low Stock Global Alerts
 * - Telegram Bot Notification Settings (@shokh0502)
 * - Enhanced ShokhAI Interactive Chat
 */

// State
let currentTab = 'dashboard';
let currentPin = '';
let staffData = [];
let inventoryData = [];
let scheduleData = [];
let isAdmin = sessionStorage.getItem('shokh_admin_auth') === 'true';
let pendingAdminAction = null;

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  updateAdminUI();
  refreshAllData();

  setInterval(() => {
    if (currentTab === 'dashboard') { loadStats(); loadCharts(); }
    if (currentTab === 'attendance') loadAttendance();
  }, 15000);
});

// Admin Authentication Helpers
function updateAdminUI() {
  const icon = document.getElementById('admin-lock-icon');
  const text = document.getElementById('admin-lock-text');
  const tag = document.getElementById('admin-lock-tag');
  const mobIcon = document.getElementById('mob-admin-icon');

  if (isAdmin) {
    if (icon) icon.innerText = '🔓';
    if (text) text.innerText = 'Admin (Faol)';
    if (tag) {
      tag.innerText = 'CHIQISH';
      tag.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30';
    }
    if (mobIcon) mobIcon.innerText = '🔓';
  } else {
    if (icon) icon.innerText = '🔒';
    if (text) text.innerText = 'Admin Rejim';
    if (tag) {
      tag.innerText = 'KIRISH';
      tag.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-bold';
    }
    if (mobIcon) mobIcon.innerText = '🔒';
  }
}

function toggleAdminLockModal() {
  if (isAdmin) {
    if (confirm("Admin rejimidan chiqmoqchimisiz?")) {
      isAdmin = false;
      sessionStorage.removeItem('shokh_admin_auth');
      updateAdminUI();
      showToast("Admin rejimidan chiqildi");
    }
  } else {
    openAdminLoginModal();
  }
}

function openAdminLoginModal() {
  const modal = document.getElementById('modal-admin-login');
  if (modal) {
    modal.classList.remove('hidden');
    const input = document.getElementById('admin-password-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('modal-admin-login');
  if (modal) modal.classList.add('hidden');
  pendingAdminAction = null;
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('admin-password-input').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.success) {
      isAdmin = true;
      sessionStorage.setItem('shokh_admin_auth', 'true');
      updateAdminUI();
      closeAdminLoginModal();
      showToast("Xush kelibsiz, Admin!");
      if (typeof pendingAdminAction === 'function') {
        const action = pendingAdminAction;
        pendingAdminAction = null;
        action();
      }
    } else {
      showToast(data.error || "Noto'g'ri parol!", true);
    }
  } catch (err) {
    showToast("Server bilan bog'lanishda xatolik!", true);
  }
}

function requireAdmin(callback) {
  if (isAdmin) {
    callback();
  } else {
    pendingAdminAction = callback;
    openAdminLoginModal();
  }
}

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
    schedule: { title: "Smena Jadvali va Grafigi", desc: "Yaqin kunlar uchun xodimlarni 1 va 2-smenaga oldindan rejalashtirish" },
    staff: { title: "Xodimlar Iyerarxiyasi", desc: "Stajor, Povur, Universal, Lider (1 & 2), Menejer, Direktor va Tozalik" },
    payroll: { title: "Soatbay Ish Haqi (Payroll)", desc: "Ishlangan soatlar va stavkalar bo'yicha toza hisoblangan oyliklar" },
    inventory: { title: "Ombor va Mahsulotlar Sifati", desc: "Go'sht, sabzavotlar, souslar zaxirasi va yaroqlilik muddati nazorati" },
    menu: { title: "Taomlar, Yarim Tayyor Issiq Ovqatlar va Souslar", desc: "Retseptura, porsiya va tayyorlanish muddatlari" },
    equipment: { title: "Jihozlar va Inventarlar Holati", desc: "Pechlar, fityur, sovutgich va oshxona inventarlarining ishga yaroqliligi" },
    ai: { title: "ShokhAI Aqlli Yordamchisi", desc: "Mehmonlar va xodimlar savollariga moslashuvchan jonli tahlilchi" },
    bot: { title: "Telegram Bildirishnomalar (@shokh0502)", desc: "Kechikishlar va hisobotlar haqida xabarnomalar tizimi" }
  };

  if (titleMap[tabId]) {
    document.getElementById('view-title').innerText = titleMap[tabId].title;
    document.getElementById('view-desc').innerText = titleMap[tabId].desc;
  }

  if (tabId === 'dashboard') { loadStats(); loadCharts(); }
  if (tabId === 'attendance') loadAttendance();
  if (tabId === 'schedule') loadSchedule();
  if (tabId === 'staff') loadStaff();
  if (tabId === 'payroll') loadPayroll();
  if (tabId === 'inventory') { loadInventory(); }
  if (tabId === 'menu') loadMenu();
  if (tabId === 'equipment') loadEquipment();
  if (tabId === 'bot') loadBotSettings();
}

async function refreshAllData() {
  await Promise.all([
    loadStats(),
    loadCharts(),
    loadStaff(),
    loadInventory(),
    loadMenu(),
    loadEquipment(),
    loadSchedule()
  ]);
}

// 1. Load Stats & Global Expiry Alert
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

// Visual Analytics & Charts
async function loadCharts() {
  try {
    const res = await fetch('/api/stats/chart');
    const data = await res.json();

    // 1. Attendance Bars
    const attContainer = document.getElementById('chart-attendance-bars');
    if (attContainer && data.attendance_by_day) {
      const maxAtt = Math.max(...data.attendance_by_day.map(d => d.count), 5);
      attContainer.innerHTML = data.attendance_by_day.map(d => {
        const pct = Math.round((d.count / maxAtt) * 100);
        const dayLabel = d.date.slice(5); // MM-DD
        return `
          <div class="space-y-1">
            <div class="flex justify-between text-xs text-slate-400">
              <span class="font-mono text-slate-300 font-semibold">${dayLabel}</span>
              <span class="text-white font-bold">${d.count} xodim</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. Payroll Ranking Bars
    const payContainer = document.getElementById('chart-payroll-bars');
    if (payContainer && data.payroll_by_staff) {
      const topStaff = data.payroll_by_staff.slice(0, 5);
      const maxPay = Math.max(...topStaff.map(s => s.net), 100000);
      payContainer.innerHTML = topStaff.map(s => {
        const pct = Math.round((s.net / maxPay) * 100);
        return `
          <div class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-slate-200 font-semibold">${s.name} <span class="text-[10px] text-amber-400 font-normal">(${s.role})</span></span>
              <span class="text-emerald-400 font-mono font-bold">${Number(s.net).toLocaleString()} so'm</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-teal-400 transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Chart load error:", err);
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
    const banner = document.getElementById('global-alert-banner');

    if (critical.length > 0 && banner) {
      banner.classList.remove('hidden');
      document.getElementById('global-alert-desc').innerText = `${critical.length} xil mahsulot kam qoldi yoki yaroqlilik muddati yaqinlashgan!`;
    } else if (banner) {
      banner.classList.add('hidden');
    }

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
      const cin = r.clock_in ? r.clock_in.slice(5, 16) : '-';
      const cout = r.clock_out ? r.clock_out.slice(5, 16) : '<span class="text-emerald-400 font-bold">🟢 Ishda</span>';
      const earned = r.total_hours ? `${Math.round(r.total_hours * r.hourly_rate).toLocaleString()} so'm` : '-';
      const lateBadge = r.is_late 
        ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-xs font-bold font-mono">⚠️ Kechikkan (${r.late_minutes}m)</span>` 
        : `<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">Vaqtida</span>`;
      const penaltyBadge = r.penalty_amount > 0 
        ? `<div class="text-[11px] text-rose-400 font-semibold mt-1">Jarima: -${Number(r.penalty_amount).toLocaleString()} so'm</div>` 
        : '';

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3.5 font-semibold text-white">${r.staff_name}</td>
          <td class="py-3.5 text-xs text-amber-300 font-medium">${r.staff_role}</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${cin}</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${cout}</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${r.total_hours ? r.total_hours + ' soat' : 'Davom etmoqda'}</td>
          <td class="py-3.5 text-xs text-emerald-400 font-mono font-bold">${earned} ${penaltyBadge}</td>
          <td class="py-3.5 text-right">
            ${lateBadge}
            ${!r.penalty_amount && r.is_late ? `
              <button onclick="requireAdmin(() => openPenaltyModal(${r.id}, '${r.staff_name}'))" class="ml-2 px-2 py-0.5 rounded bg-rose-600/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                Jarima qo'yish
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

// 3. Shift Schedule (Smena jadvali)
async function loadSchedule() {
  try {
    const res = await fetch('/api/schedule?days=14');
    scheduleData = await res.json();
    const container = document.getElementById('schedule-cards-container');

    if (!container) return;

    if (scheduleData.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-8 text-center text-slate-500 text-xs">
          Hozircha rejalashtirilgan smenalar yo'q. Yuqoridagi "Smenaga xodim biriktirish" orqali yangi reja qo'shing.
        </div>
      `;
      return;
    }

    container.innerHTML = scheduleData.map(s => {
      const shiftName = s.shift_number === 2 ? "2-smena (13:00 - 23:00)" : "1-smena (09:00 - 19:00)";
      const shiftColor = s.shift_number === 2 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";

      return `
        <div class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-3 relative group">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>📅</span> ${s.date}
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold border ${shiftColor}">
              ${shiftName}
            </span>
          </div>
          <div>
            <p class="font-bold text-sm text-white">${s.staff_name}</p>
            <p class="text-xs text-amber-400">${s.role} • ${Number(s.hourly_rate).toLocaleString()} so'm/s</p>
            ${s.notes ? `<p class="text-[11px] text-slate-400 mt-1 italic">${s.notes}</p>` : ''}
          </div>
          <div class="pt-1 flex justify-end">
            <button onclick="requireAdmin(() => deleteSchedule(${s.id}))" class="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1">
              ✕ O'chirish
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

function openAddScheduleModal() {
  const select = document.getElementById('sch-staff-select');
  if (select && staffData) {
    select.innerHTML = staffData.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
  }
  const dateInput = document.getElementById('sch-date-input');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const modal = document.getElementById('modal-add-schedule');
  if (modal) modal.classList.remove('hidden');
}

function closeAddScheduleModal() {
  const modal = document.getElementById('modal-add-schedule');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveSchedule(e) {
  e.preventDefault();
  const staff_id = document.getElementById('sch-staff-select').value;
  const date = document.getElementById('sch-date-input').value;
  const shift_number = document.getElementById('sch-shift-select').value;
  const notes = document.getElementById('sch-notes-input').value;

  try {
    const res = await fetch('/api/schedule/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id, date, shift_number, notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Smena jadvali saqlandi!");
      closeAddScheduleModal();
      loadSchedule();
    } else {
      showToast(data.error || "Xatolik!", true);
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

async function deleteSchedule(id) {
  if (!confirm("Ushbu smena rejasini o'chirmoqchimisiz?")) return;
  try {
    const res = await fetch('/api/schedule/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Reja o'chirildi!");
      loadSchedule();
    }
  } catch (e) {
    showToast("Xatolik!", true);
  }
}

// 4. Staff Management
async function loadStaff() {
  try {
    const res = await fetch('/api/staff');
    staffData = await res.json();
    const grid = document.getElementById('staff-grid');

    grid.innerHTML = staffData.map(s => `
      <div class="p-5 rounded-2xl glass-card space-y-4 hover:border-slate-700 transition-all">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center text-sm border border-indigo-500/30">
              ${s.name.charAt(0)}
            </div>
            <div>
              <h4 class="font-bold text-white text-base leading-tight">${s.name}</h4>
              <p class="text-xs text-amber-300 font-medium">${s.role}</p>
            </div>
          </div>
          <div class="text-right">
            ${s.is_working > 0 
              ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">🟢 Ishda</span>' 
              : '<span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-semibold">⚪ Damda</span>'}
          </div>
        </div>

        <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
          <div class="flex justify-between text-slate-400">
            <span>Soatlik stavka:</span>
            <span class="font-semibold text-white font-mono">${Number(s.hourly_rate).toLocaleString()} so'm</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>Smena afzalligi:</span>
            <span class="font-medium text-slate-300">${s.shift_preference}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>PIN-kod:</span>
            <span class="font-mono font-bold text-emerald-400">${s.pin_code || '—'}</span>
          </div>
          ${s.phone ? `
            <div class="flex justify-between text-slate-400">
              <span>Telefon:</span>
              <span class="font-mono text-slate-300">${s.phone}</span>
            </div>
          ` : ''}
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[11px] text-slate-500">ID: #${s.id}</span>
          <button onclick="requireAdmin(() => deleteStaff(${s.id}, '${s.name}'))" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold">
            ✕ O'chirish
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function openAddStaffModal() {
  document.getElementById('modal-add-staff').classList.remove('hidden');
}

function closeAddStaffModal() {
  document.getElementById('modal-add-staff').classList.add('hidden');
}

async function handleAddStaff(e) {
  e.preventDefault();
  const name = document.getElementById('staff-name-input').value;
  const roleSelect = document.getElementById('staff-role-select').value;
  const role = roleSelect.split('|')[0];
  const hourly_rate = parseFloat(document.getElementById('staff-rate-input').value);
  const pin_code = document.getElementById('staff-pin-input').value;
  const shift_preference = document.getElementById('staff-shift-input').value;
  const phone = document.getElementById('staff-phone-input').value;

  try {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, hourly_rate, pin_code, shift_preference, phone })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Yangi xodim qo'shildi!");
      closeAddStaffModal();
      loadStaff();
      loadStats();
    } else {
      showToast(data.error || "Xatolik!", true);
    }
  } catch (err) {
    showToast("Server bilan bog'lanishda xatolik!", true);
  }
}

async function deleteStaff(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" xodimini tizimdan o'chirmoqchimisiz?`)) return;
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
  } catch (e) {
    showToast("Xatolik!", true);
  }
}

// 5. Payroll Management
async function loadPayroll() {
  try {
    const res = await fetch('/api/payroll');
    const list = await res.json();
    const tbody = document.getElementById('payroll-table-body');
    let totalAll = 0;

    tbody.innerHTML = list.map(item => {
      const net = item.net_payable !== undefined ? item.net_payable : (item.earned_amount - item.penalty);
      totalAll += net;

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3.5 font-semibold text-white">${item.name}</td>
          <td class="py-3.5 text-xs text-amber-300 font-medium">${item.role}</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${Number(item.hourly_rate).toLocaleString()} so'm/s</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${item.total_hours} soat</td>
          <td class="py-3.5 text-xs text-rose-400 font-mono">${item.penalty > 0 ? `-${Number(item.penalty).toLocaleString()} so'm` : '0'}</td>
          <td class="py-3.5 text-xs text-emerald-400 font-mono font-bold">${Number(net).toLocaleString()} so'm</td>
          <td class="py-3.5 text-right">
            <span class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold">Hisoblangan</span>
          </td>
        </tr>
      `;
    }).join('');

    document.getElementById('payroll-total-amount').innerText = `${Number(totalAll).toLocaleString()} so'm`;
  } catch (err) {
    console.error(err);
  }
}

// 6. Inventory & Freshness Management
async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    inventoryData = await res.json();
    const tbody = document.getElementById('inventory-table-body');

    tbody.innerHTML = inventoryData.map(item => {
      const isLow = item.current_stock <= item.min_stock;
      const isExpiring = item.freshness_status === 'muddati_yaqin';
      
      let statusBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold">🟢 Yaroqli</span>`;
      if (isExpiring) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold animate-pulse">🟡 Muddati yaqin</span>`;
      } else if (isLow) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-semibold">🔴 Kam qoldi</span>`;
      }

      return `
        <tr class="hover:bg-slate-800/40 transition-colors">
          <td class="py-3.5 font-semibold text-white">${item.name}</td>
          <td class="py-3.5 text-xs text-slate-400">${item.category}</td>
          <td class="py-3.5 text-xs font-mono ${isLow ? 'text-rose-400 font-bold' : 'text-white'}">
            ${item.current_stock} ${item.unit}
          </td>
          <td class="py-3.5 text-xs text-slate-400 font-mono">${item.min_stock} ${item.unit}</td>
          <td class="py-3.5 text-xs text-slate-300 font-mono">${Number(item.unit_price).toLocaleString()} so'm</td>
          <td class="py-3.5 text-xs font-mono ${isExpiring ? 'text-amber-300 font-bold' : 'text-slate-300'}">
            📅 ${item.expiry_date || '—'}
          </td>
          <td class="py-3.5">${statusBadge}</td>
          <td class="py-3.5 text-right">
            <button onclick="requireAdmin(() => deleteInventory(${item.id}, '${item.name}'))" class="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

function openAddProductModal() {
  const expiryInput = document.getElementById('product-expiry-input');
  if (expiryInput) {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    expiryInput.value = d.toISOString().split('T')[0];
  }
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
  const current_stock = parseFloat(document.getElementById('product-stock-input').value);
  const min_stock = parseFloat(document.getElementById('product-min-input').value);
  const unit_price = parseFloat(document.getElementById('product-price-input').value);
  const expiry_date = document.getElementById('product-expiry-input').value;

  try {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, unit, current_stock, min_stock, unit_price, expiry_date })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Mahsulot kiritildi!");
      closeAddProductModal();
      loadInventory();
      loadStats();
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

async function deleteInventory(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" mahsulotini o'chirmoqchimisiz?`)) return;
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
  } catch (e) {
    showToast("Xatolik!", true);
  }
}

// 7. Inventory Transactions (Kirim / Chiqim)
function openTransactionModal(type = 'kirim') {
  const select = document.getElementById('trans-product-select');
  select.innerHTML = inventoryData.map(p => `
    <option value="${p.id}">${p.name} (Mavjud: ${p.current_stock} ${p.unit})</option>
  `).join('');

  if (type === 'kirim') {
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
  const product_id = parseInt(document.getElementById('trans-product-select').value);
  const type = document.querySelector('input[name="trans_type"]:checked').value;
  const quantity = parseFloat(document.getElementById('trans-qty-input').value);
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
      loadInventory();
      loadStats();
    } else {
      showToast(data.error || "Xatolik!", true);
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

// 8. Menu & Recipes Management
async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    const items = await res.json();
    const grid = document.getElementById('menu-grid');

    grid.innerHTML = items.map(m => `
      <div class="p-5 rounded-2xl glass-card space-y-3 hover:border-slate-700 transition-all flex flex-col justify-between">
        <div class="space-y-2">
          <div class="flex items-start justify-between">
            <h4 class="font-bold text-white text-base">${m.name}</h4>
            <span class="text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20">${m.category}</span>
          </div>
          <p class="text-xs text-slate-400 italic">${m.recipe_notes || "Retseptura belgilanmagan"}</p>
        </div>

        <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <p class="text-lg font-extrabold text-amber-400 font-mono">${Number(m.price).toLocaleString()} so'm</p>
            <p class="text-[10px] text-slate-400">⏱️ ~${m.prep_time_minutes} daqiqa</p>
          </div>
          <button onclick="requireAdmin(() => deleteMenu(${m.id}, '${m.name}'))" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold">
            ✕ O'chirish
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

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
  const price = parseFloat(document.getElementById('menu-price-input').value);
  const prep_time_minutes = parseInt(document.getElementById('menu-time-input').value);
  const recipe_notes = document.getElementById('menu-recipe-input').value;

  try {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, prep_time_minutes, recipe_notes })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Taom menyuga qo'shildi!");
      closeAddMenuModal();
      loadMenu();
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
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
  } catch (e) {
    showToast("Xatolik!", true);
  }
}

// 9. Equipment Management
async function loadEquipment() {
  try {
    const res = await fetch('/api/equipment');
    const items = await res.json();
    const grid = document.getElementById('equipment-grid');

    grid.innerHTML = items.map(eq => {
      let icon = "🟢";
      let condText = "Ishga to'liq yaroqli";
      let condClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";

      if (eq.condition === 'tamir_talab') {
        icon = "🟡";
        condText = "Ta'mir talab";
        condClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
      } else if (eq.condition === 'yaroqsiz') {
        icon = "🔴";
        condText = "Ishga yaroqsiz";
        condClass = "bg-rose-500/20 text-rose-400 border-rose-500/30";
      }

      return `
        <div class="p-5 rounded-2xl glass-card space-y-3 hover:border-slate-700 transition-all flex flex-col justify-between">
          <div class="space-y-2">
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-bold text-white text-base">${eq.name}</h4>
                <p class="text-xs text-slate-400">📍 ${eq.location} • ${eq.category}</p>
              </div>
              <span class="text-xs px-2 py-0.5 rounded-full font-bold border ${condClass}">${icon} ${condText}</span>
            </div>
            <p class="text-xs text-slate-300 mt-2">${eq.notes || 'Izoh kiritilmagan'}</p>
          </div>
          <div class="pt-2 border-t border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
            <span>Oxirgi ko'rik: ${eq.last_inspected || 'Bugun'}</span>
            <button onclick="requireAdmin(() => deleteEquipment(${eq.id}, '${eq.name}'))" class="text-rose-400 hover:text-rose-300 font-semibold">✕ O'chirish</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

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
      loadEquipment();
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

async function deleteEquipment(id, name) {
  if (!confirm(`Haqiqatan ham "${name}" jihozini o'chirmoqchimisiz?`)) return;
  try {
    const res = await fetch('/api/equipment/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`${name} o'chirildi!`);
      loadEquipment();
    }
  } catch (e) {
    showToast("Xatolik!", true);
  }
}

// 10. ShokhAI Interactive Chat
async function handleAiSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('ai-prompt-input');
  const prompt = input.value.trim();
  if (!prompt) return;

  appendAiMessage(prompt, 'user');
  input.value = '';

  const sendBtn = document.getElementById('ai-send-btn');
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<span>Javob o'ylanmoqda...</span> ⏳`;

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    appendAiMessage(data.reply || "Xatolik yuz berdi.", 'bot');
  } catch (err) {
    appendAiMessage("Kechirasiz, sun'iy intellekt bilan bog'lanishda xatolik yuz berdi.", 'bot');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<span>Yuborish</span> 🚀`;
  }
}

function askPresetAi(q) {
  switchTab('ai');
  document.getElementById('ai-prompt-input').value = q;
  document.getElementById('ai-send-btn').click();
}

function appendAiMessage(text, sender) {
  const box = document.getElementById('ai-chat-box');
  const isUser = sender === 'user';
  const msgEl = document.createElement('div');
  msgEl.className = `flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`;
  msgEl.innerHTML = `
    <div class="w-8 h-8 rounded-lg ${isUser ? 'bg-indigo-500' : 'bg-emerald-600'} flex items-center justify-center text-sm shrink-0">
      ${isUser ? '👤' : '🤖'}
    </div>
    <div class="p-4 rounded-2xl ${isUser ? 'rounded-tr-none bg-indigo-600 text-white' : 'rounded-tl-none bg-slate-800/90 text-slate-200 border border-slate-700/60'} text-sm max-w-2xl leading-relaxed whitespace-pre-wrap">
      ${text}
    </div>
  `;
  box.appendChild(msgEl);
  box.scrollTop = box.scrollHeight;
}

// 11. PIN Kiosk Operations
function openPinModal() {
  currentPin = '';
  updatePinDots();
  document.getElementById('modal-pin').classList.remove('hidden');
}

function closePinModal() {
  document.getElementById('modal-pin').classList.add('hidden');
}

function pressPin(digit) {
  if (currentPin.length < 4) {
    currentPin += digit;
    updatePinDots();
  }
}

function clearPin() {
  currentPin = '';
  updatePinDots();
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < currentPin.length) {
      dot.className = "w-3.5 h-3.5 rounded-full bg-emerald-400 inline-block pin-dot shadow-lg shadow-emerald-400/50";
    } else {
      dot.className = "w-3.5 h-3.5 rounded-full bg-slate-700 inline-block pin-dot";
    }
  });
}

async function submitPin() {
  if (currentPin.length !== 4) {
    showToast("4 xonali PIN-kodni to'liq kiriting!", true);
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
      loadStats();
      loadAttendance();
      loadCharts();
    } else {
      showToast(data.error || "Noto'g'ri PIN-kod!", true);
      clearPin();
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

async function directClockOut(staffId, staffName) {
  if (!confirm(`${staffName} smenani yakunlab chiqib ketmoqdami?`)) return;
  try {
    const res = await fetch('/api/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      loadStats();
      loadAttendance();
      loadCharts();
    } else {
      showToast(data.error || "Xatolik!", true);
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

// 12. Penalty Modal Operations
function openPenaltyModal(attendanceId, staffName) {
  document.getElementById('penalty-att-id').value = attendanceId;
  document.getElementById('penalty-staff-name').value = staffName;
  document.getElementById('modal-penalty').classList.remove('hidden');
}

function closePenaltyModal() {
  document.getElementById('modal-penalty').classList.add('hidden');
}

async function handlePenaltySubmit(e) {
  e.preventDefault();
  const attendance_id = parseInt(document.getElementById('penalty-att-id').value);
  const penalty_amount = parseFloat(document.getElementById('penalty-amount-input').value);
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
      loadPayroll();
    } else {
      showToast(data.error || "Xatolik!", true);
    }
  } catch (err) {
    showToast("Server xatosi!", true);
  }
}

// 13. Telegram Settings & Simulator
async function loadBotSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.telegram_bot_token) {
      document.getElementById('bot-token-input').value = data.telegram_bot_token;
    }
    if (data.telegram_chat_id) {
      document.getElementById('bot-chatid-input').value = data.telegram_chat_id;
    }
  } catch (e) {}
}

async function saveBotSettings() {
  const token = document.getElementById('bot-token-input').value.trim();
  const chat_id = document.getElementById('bot-chatid-input').value.trim();

  try {
    await fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'telegram_bot_token', value: token })
    });
    await fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'telegram_chat_id', value: chat_id })
    });
    showToast("Telegram sozlamalari saqlandi!");
  } catch (e) {
    showToast("Saqlashda xatolik!", true);
  }
}

async function sendSimMessage(msg) {
  const chat = document.getElementById('sim-messages');
  chat.innerHTML += `
    <div class="flex justify-end">
      <div class="p-2 rounded-xl bg-sky-600 text-white max-w-[80%]">${msg}</div>
    </div>
  `;
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await fetch('/api/bot/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, user_name: "@shokh0502" })
    });
    const data = await res.json();
    chat.innerHTML += `
      <div class="flex justify-start">
        <div class="p-2.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 max-w-[85%] whitespace-pre-wrap leading-relaxed">${data.reply}</div>
      </div>
    `;
    chat.scrollTop = chat.scrollHeight;
  } catch (e) {
    chat.innerHTML += `<div class="p-2 text-rose-400">Xatolik!</div>`;
  }
}

function handleSimSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('sim-input');
  const val = input.value.trim();
  if (!val) return;
  sendSimMessage(val);
  input.value = '';
}

// 14. Reset Database
async function confirmResetDatabase() {
  const confirmation = prompt("DIQQAT: Barcha test ma'lumotlarini tozalab, tizimni noldan boshlash uchun 'TOZALASH' so'zini yozing:");
  if (confirmation !== 'TOZALASH') {
    showToast("Bekor qilindi");
    return;
  }

  try {
    const res = await fetch('/api/database/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      refreshAllData();
    }
  } catch (e) {
    showToast("Server xatosi!", true);
  }
}

// Toast helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');

  msgEl.innerText = message;
  iconEl.innerText = isError ? '❌' : '✅';

  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3500);
}
