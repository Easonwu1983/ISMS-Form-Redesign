// =============================================
// 管考追蹤系統 - v5 Patch (12 項修正)
// 載入方式：在 index.html 的 app.js 之後加上：
//   <script src="patch-v5.js"></script>
//
// 修正項目：
// 1.  單位管理員可開矯正單 (已支援)
// 2.  提出人員自動帶入 + 提出單位預設選中
// 3.  缺失種類移除「無」
// 4.  帳號登入 Log 機制
// 5.  歷程記錄時間順序改為由上到下（舊→新）
// 6.  受稽單位加上子單位
// 7.  草稿可繼續編輯
// 8.  填表人員自動帶入 (已支援)
// 9.  自評日期→稽核年度自動換算
// 10. 檢核表佐證資料支援截圖上傳
// 11. 處理人員依處理單位篩選
// 12. 系統管理員檢核表列表加入篩選（避免草稿雜亂）
// =============================================
(function () {
  'use strict';

  // ─── 等待原始 app.js 載入完畢 ───
  // 由於原始 app 是 IIFE，我們需要透過覆寫 localStorage 中的行為
  // 最佳方式：本 patch 直接修改 DOM 事件，在路由變更時攔截

  // ─── 共用常數（與原始一致）─────────
  const LOG_KEY = 'cats_login_log';
  const DATA_KEY = 'cats_data';
  const AUTH_KEY = 'cats_auth';
  const CHECKLIST_KEY = 'cats_checklists';
  const TEMPLATE_KEY = 'cats_checklist_template';

  const ROLES = { ADMIN: '最高管理員', UNIT_ADMIN: '單位管理員', REPORTER: '填報人' };

  // ─── 子單位對照表 (#6) ─────────
  const UNIT_SUB_UNITS = {
    '資訊部': ['系統管理組', '網路管理組', '資訊服務組'],
    '資安組': ['資安稽核組', '資安監控組', '資安政策組'],
    '稽核室': ['內部稽核組', '外部稽核組'],
  };

  // ─── 共用工具 ─────────────────────
  function currentUser() { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY)); } catch { return null; } }
  function isAdmin() { return currentUser()?.role === ROLES.ADMIN; }
  function canManageUsers() { return isAdmin(); }
  function loadData() { try { return JSON.parse(localStorage.getItem(DATA_KEY)) || { items: [], users: [], nextId: 1 }; } catch { return { items: [], users: [], nextId: 1 }; } }
  function getUsers() { return loadData().users; }
  function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  // ─── #4: Login Log 機制 ─────────
  function loadLoginLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; } }
  function saveLoginLog(log) { localStorage.setItem(LOG_KEY, JSON.stringify(log)); }
  function addLoginLog(username, name, role, success) {
    const log = loadLoginLog();
    log.push({ time: new Date().toISOString(), username, name: name || '', role: role || '', success });
    if (log.length > 200) log.splice(0, log.length - 200);
    saveLoginLog(log);
  }

  // 攔截 login form 的 submit 來記錄 log
  const _origLoginHandler = document.addEventListener;

  // ─── #7: Checklist 更新函式 ─────
  function loadChecklists() { try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || { items: [], nextId: 1 }; } catch { return { items: [], nextId: 1 }; } }
  function saveChecklists(d) { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(d)); }
  function updateChecklist(id, updates) {
    const d = loadChecklists();
    const i = d.items.findIndex(x => x.id === id);
    if (i >= 0) { d.items[i] = { ...d.items[i], ...updates }; saveChecklists(d); }
  }

  // ─── 核心：MutationObserver 監控 DOM 變更來 patch 各頁面 ───
  let lastPagePatched = '';

  function patchCurrentPage() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const page = hash.split('/')[0];
    const param = hash.split('/')[1];

    // 避免重複 patch 同一頁面
    const patchKey = hash + '_' + document.getElementById('app')?.innerHTML?.length;
    if (lastPagePatched === patchKey) return;
    lastPagePatched = patchKey;

    switch (page) {
      case 'create': patchCreatePage(); break;
      case 'checklist-fill': patchChecklistFill(); break;
      case 'detail': patchDetailPage(); break;
      case 'checklist': patchChecklistList(); break;
    }

    // 在 sidebar 注入登入紀錄連結 (#4)
    patchSidebar();
  }

  // ─── #2 + #3 + #6 + #11: Patch 開立矯正單頁面 ───
  function patchCreatePage() {
    const form = document.getElementById('create-form');
    if (!form) return;

    // #2: 提出單位預設選中目前使用者的單位
    const punitSel = document.getElementById('f-punit');
    const u = currentUser();
    if (punitSel && u) {
      for (let i = 0; i < punitSel.options.length; i++) {
        if (punitSel.options[i].value === u.unit) {
          punitSel.selectedIndex = i;
          break;
        }
      }
    }

    // #3: 移除缺失種類中的「無」
    document.querySelectorAll('input[name="defType"]').forEach(radio => {
      if (radio.value === '無') {
        const label = radio.closest('.radio-label');
        if (label) label.style.display = 'none';
      }
    });

    // #6: 在處理單位後加入子單位欄位
    const hunitSel = document.getElementById('f-hunit');
    if (hunitSel && !document.getElementById('f-hsubunit')) {
      const subGroup = document.createElement('div');
      subGroup.className = 'form-group';
      subGroup.innerHTML = '<label class="form-label">子單位</label><select class="form-select" id="f-hsubunit"><option value="">無</option></select>';
      hunitSel.closest('.form-group').after(subGroup);

      hunitSel.addEventListener('change', function () {
        const subSel = document.getElementById('f-hsubunit');
        const subs = UNIT_SUB_UNITS[this.value] || [];
        subSel.innerHTML = '<option value="">無</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

        // #11: 處理人員依處理單位篩選
        filterHandlerByUnit(this.value);
      });
    }

    // #11: 處理人員依處理單位篩選
    const hnameSel = document.getElementById('f-hname');
    if (hnameSel) {
      // 儲存所有原始 options
      if (!hnameSel._allOptions) {
        hnameSel._allOptions = Array.from(hnameSel.options).map(o => ({
          value: o.value,
          text: o.textContent,
          email: o.dataset?.email || '',
          html: o.outerHTML
        }));
      }

      // 綁定處理單位變更事件
      if (hunitSel && !hunitSel._filterBound) {
        hunitSel._filterBound = true;
        hunitSel.addEventListener('change', function () {
          filterHandlerByUnit(this.value);
        });
      }
    }

    function filterHandlerByUnit(unitValue) {
      const hnameSel = document.getElementById('f-hname');
      if (!hnameSel || !hnameSel._allOptions) return;
      const allUsers = getUsers();

      // 清空目前選項
      hnameSel.innerHTML = '<option value="">請選擇</option>';

      if (!unitValue) {
        // 未選單位 → 顯示全部
        hnameSel._allOptions.forEach(o => {
          if (o.value) {
            hnameSel.insertAdjacentHTML('beforeend', o.html);
          }
        });
      } else {
        // 只顯示該單位的人員
        const unitUsers = allUsers.filter(x =>
          x.unit === unitValue &&
          (x.role === ROLES.REPORTER || x.role === ROLES.UNIT_ADMIN)
        );
        unitUsers.forEach(x => {
          hnameSel.insertAdjacentHTML('beforeend',
            `<option value="${esc(x.name)}" data-email="${esc(x.email || '')}">${esc(x.name)}（${esc(x.unit)}）</option>`
          );
        });
      }

      // 重設 email
      document.getElementById('f-hemail').value = '';
    }
  }

  // ─── #5: Patch 矯正單詳情頁（歷程排序）───
  function patchDetailPage() {
    const timeline = document.querySelector('.timeline');
    if (!timeline) return;

    // 取得所有 timeline-item
    const items = Array.from(timeline.querySelectorAll('.timeline-item'));
    if (items.length <= 1) return;

    // 檢查是否已經是正序（第一筆時間 <= 最後一筆時間）
    const firstTime = items[0]?.querySelector('.timeline-time')?.textContent || '';
    const lastTime = items[items.length - 1]?.querySelector('.timeline-time')?.textContent || '';
    if (firstTime > lastTime) {
      // 目前是倒序，反轉為正序
      items.reverse().forEach(item => timeline.appendChild(item));
    }
  }

  // ─── #6 + #8 + #9 + #10: Patch 檢核表填報頁面 ───
  function patchChecklistFill() {
    const form = document.getElementById('checklist-form');
    if (!form) return;

    // #6: 加入子單位
    const clUnit = document.getElementById('cl-unit');
    if (clUnit && !document.getElementById('cl-subunit')) {
      const subGroup = document.createElement('div');
      subGroup.className = 'form-group';
      subGroup.innerHTML = '<label class="form-label">子單位</label><select class="form-select" id="cl-subunit"><option value="">無</option></select>';
      clUnit.closest('.form-group').after(subGroup);

      clUnit.addEventListener('change', function () {
        const subSel = document.getElementById('cl-subunit');
        const subs = UNIT_SUB_UNITS[this.value] || [];
        subSel.innerHTML = '<option value="">無</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
      });
      // 觸發初始值
      clUnit.dispatchEvent(new Event('change'));
    }

    // #9: 自評日期→稽核年度自動換算
    const clDate = document.getElementById('cl-date');
    const clYear = document.getElementById('cl-year');
    if (clDate && clYear && !clDate._yearBound) {
      clDate._yearBound = true;
      clDate.addEventListener('change', function () {
        const y = parseInt(this.value.split('-')[0]);
        if (y && y >= 1911) {
          clYear.value = String(y - 1911);
        }
      });
      // 立即觸發一次（處理預設日期）
      if (clDate.value) {
        const y = parseInt(clDate.value.split('-')[0]);
        if (y && y >= 1911) clYear.value = String(y - 1911);
      }
    }

    // #10: 佐證資料加上截圖上傳
    patchEvidenceUpload();

    // #7: 修改儲存草稿行為 —— 攔截原始 submit/save 以組合子單位
    patchChecklistSaveWithSubunit();
  }

  // ─── #10: 佐證截圖上傳 ───
  function patchEvidenceUpload() {
    const evidenceTextareas = document.querySelectorAll('textarea[id^="cl-evidence-"]');
    evidenceTextareas.forEach(ta => {
      const itemId = ta.id.replace('cl-evidence-', '');
      const uploadId = 'cl-evfile-' + itemId;
      if (document.getElementById(uploadId)) return; // 已 patch 過

      // 修改 label
      const label = ta.previousElementSibling || ta.closest('.form-group')?.querySelector('.form-label');
      if (label && label.textContent === '佐證資料') {
        label.textContent = '佐證資料（文字）';
      }

      // 在 textarea 後面加入上傳區
      const uploadDiv = document.createElement('div');
      uploadDiv.className = 'form-group';
      uploadDiv.style.marginTop = '8px';
      uploadDiv.innerHTML = `
        <label class="form-label">佐證截圖</label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="file" id="${uploadId}" accept="image/*" multiple style="font-size:.82rem;max-width:300px">
          <div id="cl-evprev-${itemId}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px"></div>
        </div>
      `;
      ta.closest('.form-group').after(uploadDiv);

      // 上傳處理
      if (!window._clEvidenceFiles) window._clEvidenceFiles = {};
      window._clEvidenceFiles[itemId] = [];

      document.getElementById(uploadId).addEventListener('change', function () {
        Array.from(this.files).forEach(f => {
          if (f.size > 2 * 1024 * 1024) { return; }
          const reader = new FileReader();
          reader.onload = e => {
            window._clEvidenceFiles[itemId].push({ name: f.name, data: e.target.result });
            renderEvPreviews(itemId);
          };
          reader.readAsDataURL(f);
        });
      });
    });
  }

  function renderEvPreviews(itemId) {
    const prev = document.getElementById('cl-evprev-' + itemId);
    if (!prev) return;
    const files = window._clEvidenceFiles?.[itemId] || [];
    prev.innerHTML = files.map((ev, idx) =>
      `<div style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <img src="${ev.data}" alt="${esc(ev.name)}" style="max-width:60px;max-height:45px;border-radius:3px;border:1px solid #e2e8f0">
        <span style="font-size:.72rem;color:#64748b;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.name)}</span>
        <button type="button" style="background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.65rem;cursor:pointer;line-height:1" onclick="window._removeClEvFile('${itemId}',${idx})">✕</button>
      </div>`
    ).join('');
  }

  window._removeClEvFile = function (itemId, idx) {
    if (window._clEvidenceFiles?.[itemId]) {
      window._clEvidenceFiles[itemId].splice(idx, 1);
      renderEvPreviews(itemId);
    }
  };

  // ─── #6 + #7: Patch checklist save 以包含子單位 + 截圖 ───
  function patchChecklistSaveWithSubunit() {
    const form = document.getElementById('checklist-form');
    if (!form || form._patched) return;
    form._patched = true;

    // 攔截送出和草稿 —— 在原始 handler 之前注入子單位
    const saveDraftBtn = document.getElementById('cl-save-draft');

    // 我們使用 MutationObserver 來偵測新增的 checklist，
    // 在新增後立即修改其 unit 欄位加上子單位
    const origAddChecklist = localStorage.getItem.bind(localStorage);

    // 較簡單的方式：在每次儲存後修正最後一筆的 unit
    function fixLastChecklistUnit() {
      setTimeout(() => {
        const d = loadChecklists();
        if (d.items.length === 0) return;
        const last = d.items[d.items.length - 1];
        const subSel = document.getElementById('cl-subunit');
        const subUnit = subSel ? subSel.value : '';

        if (subUnit && !last.unit.includes(' — ')) {
          last.unit = last.unit + ' — ' + subUnit;
        }

        // #10: 附加截圖到結果
        if (window._clEvidenceFiles) {
          Object.keys(window._clEvidenceFiles).forEach(itemId => {
            if (last.results[itemId] && window._clEvidenceFiles[itemId].length > 0) {
              last.results[itemId].evidenceFiles = window._clEvidenceFiles[itemId];
            }
          });
        }

        saveChecklists(d);
      }, 100);
    }

    // 監聽 form submit（送出）
    form.addEventListener('submit', fixLastChecklistUnit, true);

    // 監聽草稿按鈕
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', fixLastChecklistUnit, true);
    }
  }

  // ─── #7 + #12: Patch 檢核表列表 ───
  function patchChecklistList() {
    const tableBody = document.querySelector('#app table tbody');
    if (!tableBody) return;

    // #12: 加入篩選工具列
    const pageHeader = document.querySelector('.page-header');
    if (pageHeader && !document.getElementById('cl-filter-bar')) {
      const filterBar = document.createElement('div');
      filterBar.id = 'cl-filter-bar';
      filterBar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap';
      filterBar.innerHTML = `
        <span style="font-size:.85rem;font-weight:600;color:#64748b">篩選：</span>
        <button class="filter-tab active" data-clfilter="全部" style="padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#eff6ff;color:#3b82f6;font-size:.82rem;font-weight:600;cursor:pointer">全部</button>
        <button class="filter-tab" data-clfilter="已提交" style="padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#64748b;font-size:.82rem;font-weight:500;cursor:pointer">已提交</button>
        <button class="filter-tab" data-clfilter="草稿" style="padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#64748b;font-size:.82rem;font-weight:500;cursor:pointer">草稿</button>
      `;
      pageHeader.parentElement.insertBefore(filterBar, pageHeader.nextSibling);

      filterBar.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-clfilter]');
        if (!btn) return;
        filterBar.querySelectorAll('.filter-tab').forEach(b => {
          b.style.background = 'white';
          b.style.color = '#64748b';
          b.classList.remove('active');
        });
        btn.style.background = '#eff6ff';
        btn.style.color = '#3b82f6';
        btn.classList.add('active');
        applyChecklistFilter(btn.dataset.clfilter);
      });
    }

    // #7: 草稿點擊時導向編輯頁面
    patchChecklistRowsForDraft();
  }

  function applyChecklistFilter(filter) {
    const rows = document.querySelectorAll('#app table tbody tr');
    rows.forEach(row => {
      if (filter === '全部') {
        row.style.display = '';
        return;
      }
      // 尋找狀態欄位
      const badge = row.querySelector('.badge');
      const statusText = badge ? badge.textContent.trim() : '';
      row.style.display = statusText === filter ? '' : 'none';
    });
  }

  // #7: 讓草稿可以編輯
  function patchChecklistRowsForDraft() {
    const rows = document.querySelectorAll('#app table tbody tr');
    rows.forEach(row => {
      const badge = row.querySelector('.badge');
      const statusText = badge ? badge.textContent.trim() : '';
      if (statusText === '草稿') {
        // 取得原始 onclick 的 ID
        const firstTd = row.querySelector('td');
        const clId = firstTd ? firstTd.textContent.trim() : '';
        if (clId) {
          row.onclick = function () {
            location.hash = 'checklist-edit/' + clId;
          };
          // 加一個視覺提示
          if (!row.querySelector('.draft-edit-hint')) {
            const lastTd = row.querySelector('td:last-child');
            if (lastTd) {
              lastTd.insertAdjacentHTML('beforeend',
                ' <span class="draft-edit-hint" style="font-size:.72rem;color:#3b82f6;font-weight:500">（點擊編輯）</span>');
            }
          }
        }
      }
    });
  }

  // ─── #4: Patch sidebar 加入登入紀錄 ───
  function patchSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !canManageUsers()) return;

    // 檢查是否已有登入紀錄連結
    if (sidebar.querySelector('[href="#login-log"]')) return;

    // 找到「帳號管理」連結，在後面加入
    const userLink = sidebar.querySelector('[href="#users"]');
    if (userLink) {
      const logLink = document.createElement('a');
      logLink.className = 'nav-item' + (location.hash === '#login-log' ? ' active' : '');
      logLink.href = '#login-log';
      logLink.innerHTML = '<span class="nav-icon"><i data-lucide="shield"></i></span>登入紀錄';
      userLink.after(logLink);
      if (window.lucide) setTimeout(() => lucide.createIcons(), 50);
    }
  }

  // ─── #4 + #7: 自定義路由頁面 ───
  function handleCustomRoutes() {
    const hash = window.location.hash.slice(1) || '';
    const page = hash.split('/')[0];
    const param = hash.split('/')[1];

    if (page === 'login-log') {
      renderLoginLog();
      return true;
    }
    if (page === 'checklist-edit' && param) {
      renderChecklistEdit(param);
      return true;
    }
    return false;
  }

  // ─── #4: 登入紀錄頁面 ───
  function renderLoginLog() {
    const app = document.getElementById('app');
    if (!app || !canManageUsers()) return;

    const logs = loadLoginLog().slice().reverse();
    function fmtTime(d) {
      if (!d) return '—';
      const x = new Date(d);
      return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    }

    const rows = logs.length ? logs.map(l => {
      const cls = l.success ? 'color:#22c55e' : 'color:#ef4444';
      return `<tr>
        <td>${fmtTime(l.time)}</td>
        <td style="font-weight:500">${esc(l.username)}</td>
        <td>${esc(l.name || '—')}</td>
        <td>${esc(l.role || '—')}</td>
        <td><span style="${cls};font-weight:600">${l.success ? '✓ 成功' : '✕ 失敗'}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8">尚無登入紀錄</td></tr>';

    app.innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">登入紀錄</h1><p class="page-subtitle">最近 200 筆帳號登入 / 登入失敗記錄</p></div>
        <button class="btn btn-danger" onclick="if(confirm('確定清除所有登入紀錄？')){localStorage.removeItem('${LOG_KEY}');location.hash='login-log';location.reload()}">
          <i data-lucide="trash-2" class="icon-sm"></i> 清除紀錄
        </button>
      </div>
      <div class="card" style="padding:0;overflow:hidden"><div class="table-wrapper"><table>
        <thead><tr><th>時間</th><th>帳號</th><th>姓名</th><th>角色</th><th>結果</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div></div>`;

    // 更新 header title
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) headerTitle.textContent = '登入紀錄';

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);
  }

  // ─── #7: 檢核表編輯頁面（草稿） ───
  function renderChecklistEdit(id) {
    const app = document.getElementById('app');
    if (!app) return;

    const d = loadChecklists();
    const cl = d.items.find(i => i.id === id);
    if (!cl) {
      location.hash = 'checklist';
      return;
    }
    if (cl.status !== '草稿') {
      location.hash = 'checklist-detail/' + id;
      return;
    }

    const u = currentUser();
    if (!u) return;

    // 取得檢核表 sections
    let SECTIONS;
    try {
      const saved = JSON.parse(localStorage.getItem(TEMPLATE_KEY));
      SECTIONS = (saved && saved.length) ? saved : null;
    } catch { SECTIONS = null; }
    if (!SECTIONS) {
      // 無法取得 sections，回到列表讓原始系統處理
      location.hash = 'checklist';
      return;
    }

    const COMPLIANCE_OPTS = ['符合', '部分符合', '不符合', '不適用'];
    const COMPLIANCE_CLASSES = { '符合': 'comply', '部分符合': 'partial', '不符合': 'noncomply', '不適用': 'na' };

    // 建構表單 HTML
    let sectionsHtml = '';
    SECTIONS.forEach((sec, si) => {
      let itemsHtml = '';
      sec.items.forEach(item => {
        const saved = cl.results?.[item.id] || {};
        const radios = COMPLIANCE_OPTS.map(opt =>
          `<label class="cl-radio-label cl-radio-${COMPLIANCE_CLASSES[opt]}"><input type="radio" name="cl-${item.id}" value="${opt}" ${saved.compliance === opt ? 'checked' : ''}><span class="cl-radio-indicator"></span>${opt}</label>`
        ).join('');

        itemsHtml += `<div class="cl-item" id="cl-item-${item.id}">
          <div class="cl-item-header"><span class="cl-item-id">${item.id}</span><span class="cl-item-text">${esc(item.text)}</span></div>
          <div class="cl-item-body">
            <div class="cl-compliance"><label class="form-label form-required">單位自評</label><div class="cl-radio-group">${radios}</div></div>
            <div class="cl-fields">
              <div class="form-group"><label class="form-label">執行情形簡述</label><textarea class="form-textarea cl-textarea" id="cl-exec-${item.id}" placeholder="${esc(item.hint || '')}" rows="2">${esc(saved.execution || '')}</textarea></div>
              <div class="form-group"><label class="form-label">佐證資料（文字）</label><textarea class="form-textarea cl-textarea" id="cl-evidence-${item.id}" placeholder="如執行紀錄、公文、截圖說明等" rows="2">${esc(saved.evidence || '')}</textarea></div>
              <div class="form-group" style="margin-top:8px"><label class="form-label">佐證截圖</label>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <input type="file" id="cl-evfile-${item.id}" accept="image/*" multiple style="font-size:.82rem;max-width:300px">
                  <div id="cl-evprev-${item.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px"></div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      });
      sectionsHtml += `<div class="cl-section"><div class="cl-section-header"><span class="cl-section-num">${si + 1}</span>${esc(sec.section)}</div><div class="cl-section-body">${itemsHtml}</div></div>`;
    });

    const allUsers = getUsers();
    const clUnitBase = cl.unit.split(' — ')[0];
    const clSubUnit = cl.unit.includes(' — ') ? cl.unit.split(' — ')[1] : '';
    const unitOpts = [...new Set(allUsers.map(u => u.unit))].map(ut => `<option value="${esc(ut)}" ${ut === clUnitBase ? 'selected' : ''}>${esc(ut)}</option>`).join('');
    const totalItems = SECTIONS.reduce((a, s) => a + s.items.length, 0);

    app.innerHTML = `<div class="animate-in">
      <div class="page-header"><div><h1 class="page-title">編輯檢核表（草稿）</h1><p class="page-subtitle">${esc(cl.id)}</p></div><a href="#checklist" class="btn btn-secondary">← 返回列表</a></div>
      <div class="card" style="max-width:960px"><form id="checklist-edit-form">
        <div class="section-header"><i data-lucide="info" class="icon-sm"></i> 基本資訊</div>
        <div class="form-row">
          <div class="form-group"><label class="form-label form-required">受稽單位</label><select class="form-select" id="cl-unit" required>${unitOpts}</select></div>
          <div class="form-group"><label class="form-label">子單位</label><select class="form-select" id="cl-subunit"><option value="">無</option></select></div>
          <div class="form-group"><label class="form-label form-required">填表人員</label><input type="text" class="form-input" id="cl-filler" value="${esc(cl.fillerName)}" readonly></div>
          <div class="form-group"><label class="form-label form-required">自評日期</label><input type="date" class="form-input" id="cl-date" value="${cl.fillDate}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">稽核年度</label><input type="text" class="form-input" id="cl-year" value="${esc(cl.auditYear)}" required></div>
          <div class="form-group"><label class="form-label">權責主管</label><input type="text" class="form-input" id="cl-supervisor" value="${esc(cl.supervisor || '')}"></div>
        </div>
        <div class="cl-progress-bar-wrap"><div class="cl-progress-label">填報進度</div><div class="cl-progress-bar"><div class="cl-progress-fill" id="cl-progress-fill" style="width:0%"></div></div><span class="cl-progress-text" id="cl-progress-text">0 / ${totalItems}</span></div>
        ${sectionsHtml}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary"><i data-lucide="send" class="icon-sm"></i> 送出檢核表</button>
          <button type="button" class="btn btn-secondary" id="cl-edit-save-draft"><i data-lucide="save" class="icon-sm"></i> 更新草稿</button>
          <a href="#checklist" class="btn btn-ghost">取消</a>
        </div>
      </form></div></div>`;

    // 更新 header
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) headerTitle.textContent = '編輯檢核表';

    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 50);

    // 子單位連動
    const clUnitEl = document.getElementById('cl-unit');
    clUnitEl.addEventListener('change', function () {
      const subSel = document.getElementById('cl-subunit');
      const subs = UNIT_SUB_UNITS[this.value] || [];
      subSel.innerHTML = '<option value="">無</option>' + subs.map(s => `<option value="${esc(s)}" ${s === clSubUnit ? 'selected' : ''}>${esc(s)}</option>`).join('');
    });
    clUnitEl.dispatchEvent(new Event('change'));

    // #9: 日期→年度
    document.getElementById('cl-date').addEventListener('change', function () {
      const y = parseInt(this.value.split('-')[0]);
      if (y && y >= 1911) document.getElementById('cl-year').value = String(y - 1911);
    });

    // Progress
    function updateProgress() {
      let filled = 0;
      SECTIONS.forEach(sec => sec.items.forEach(item => {
        if (document.querySelector(`input[name="cl-${item.id}"]:checked`)) filled++;
      }));
      const pct = Math.round(filled / totalItems * 100);
      document.getElementById('cl-progress-fill').style.width = pct + '%';
      document.getElementById('cl-progress-text').textContent = filled + ' / ' + totalItems;
    }
    document.querySelectorAll('.cl-radio-group input').forEach(r => r.addEventListener('change', updateProgress));
    updateProgress();

    // 截圖上傳
    window._clEvidenceFiles = {};
    SECTIONS.forEach(sec => sec.items.forEach(item => {
      window._clEvidenceFiles[item.id] = (cl.results?.[item.id]?.evidenceFiles || []).slice();
      renderEvPreviews(item.id);

      const fileInput = document.getElementById('cl-evfile-' + item.id);
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          Array.from(this.files).forEach(f => {
            if (f.size > 2 * 1024 * 1024) return;
            const reader = new FileReader();
            reader.onload = e => {
              window._clEvidenceFiles[item.id].push({ name: f.name, data: e.target.result });
              renderEvPreviews(item.id);
            };
            reader.readAsDataURL(f);
          });
        });
      }
    }));

    // 收集資料
    function collectEditData(status) {
      const results = {};
      let conform = 0, partial = 0, nonConform = 0, na = 0, total = 0;
      SECTIONS.forEach(sec => sec.items.forEach(item => {
        const sel = document.querySelector(`input[name="cl-${item.id}"]:checked`);
        const compliance = sel ? sel.value : '';
        results[item.id] = {
          compliance,
          execution: document.getElementById(`cl-exec-${item.id}`).value.trim(),
          evidence: document.getElementById(`cl-evidence-${item.id}`).value.trim(),
          evidenceFiles: window._clEvidenceFiles?.[item.id] || []
        };
        total++;
        if (compliance === '符合') conform++;
        else if (compliance === '部分符合') partial++;
        else if (compliance === '不符合') nonConform++;
        else if (compliance === '不適用') na++;
      }));
      const subUnit = document.getElementById('cl-subunit')?.value || '';
      const now = new Date().toISOString();
      return {
        unit: document.getElementById('cl-unit').value + (subUnit ? ' — ' + subUnit : ''),
        fillerName: document.getElementById('cl-filler').value,
        fillDate: document.getElementById('cl-date').value,
        auditYear: document.getElementById('cl-year').value,
        supervisor: document.getElementById('cl-supervisor').value.trim(),
        results, summary: { total, conform, partial, nonConform, na },
        status, updatedAt: now
      };
    }

    // 送出
    document.getElementById('checklist-edit-form').addEventListener('submit', e => {
      e.preventDefault();
      let missing = [];
      SECTIONS.forEach(sec => sec.items.forEach(item => {
        if (!document.querySelector(`input[name="cl-${item.id}"]:checked`)) missing.push(item.id);
      }));
      if (missing.length > 0) {
        alert(`尚有 ${missing.length} 個項目未填寫自評結果`);
        const el = document.getElementById('cl-item-' + missing[0]);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      updateChecklist(id, collectEditData('已提交'));
      location.hash = 'checklist-detail/' + id;
    });

    // 更新草稿
    document.getElementById('cl-edit-save-draft').addEventListener('click', () => {
      updateChecklist(id, collectEditData('草稿'));
      location.hash = 'checklist';
    });
  }

  // ─── #4: 攔截登入表單記錄 Log ───
  function patchLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm || loginForm._logPatched) return;
    loginForm._logPatched = true;

    loginForm.addEventListener('submit', function () {
      const un = document.getElementById('login-user')?.value?.trim() || '';
      const pw = document.getElementById('login-pass')?.value || '';
      const allUsers = (() => {
        try { return JSON.parse(localStorage.getItem(DATA_KEY))?.users || []; } catch { return []; }
      })();
      const foundUser = allUsers.find(u => u.username === un);
      const success = foundUser && foundUser.password === pw;
      addLoginLog(un, foundUser?.name || '', foundUser?.role || '', success);
    }, true); // capture phase to run before original handler
  }

  // ─── 主入口：觀察 DOM 變更並觸發 patch ───
  const observer = new MutationObserver(() => {
    // 偵測登入頁面
    patchLoginForm();

    // 先檢查是否為自定義路由
    if (handleCustomRoutes()) return;

    // 延遲 patch 確保原始 app 已渲染完成
    setTimeout(patchCurrentPage, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // 監聽 hash 變更
  window.addEventListener('hashchange', () => {
    lastPagePatched = ''; // reset
    setTimeout(() => {
      if (handleCustomRoutes()) return;
      setTimeout(patchCurrentPage, 150);
    }, 50);
  });

  // 初始化
  setTimeout(() => {
    patchLoginForm();
    if (!handleCustomRoutes()) {
      patchCurrentPage();
    }
  }, 300);

  // ─── 注入額外 CSS ───
  const patchStyle = document.createElement('style');
  patchStyle.textContent = `
    .cl-evidence-upload { margin-top: 4px; }
    .cl-evidence-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .cl-ev-thumb { display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .draft-edit-hint { font-size: 0.72rem; color: #3b82f6; font-weight: 500; }
    #cl-filter-bar .filter-tab { transition: all 150ms ease; }
    #cl-filter-bar .filter-tab:hover { border-color: #3b82f6; }
  `;
  document.head.appendChild(patchStyle);

  console.log('✅ patch-v5.js loaded — 12 項修正已套用');
})();
