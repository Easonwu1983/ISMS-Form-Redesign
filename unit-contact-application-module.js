(function () {
  window.createUnitContactApplicationModule = function createUnitContactApplicationModule(deps) {
    const {
      UNIT_CONTACT_APPLICATION_STATUSES,
      navigate,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      toast,
      esc,
      ic,
      fmtTime,
      refreshIcons,
      buildUnitCascadeControl,
      initUnitCascade,
      getUnitCode,
      getM365ModeLabel,
      getM365ModeKey,
      addPageEventListener,
      registerPageCleanup,
      submitAttachmentUpload,
      requestUnitContactAuthorizationDocument,
      submitUnitContactApplication,
      getUnitContactApplication,
      lookupUnitContactApplicationsByEmail
    } = deps;

    const LAST_EMAIL_KEY = 'unit-contact-last-email';
    const AUTHORIZATION_TEMPLATE_FILENAME = '單位資安窗口授權同意書.pdf';
    const AUTHORIZATION_TEMPLATE_URL = 'unit-contact-authorization-template.pdf';
    const AUTHORIZATION_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
    const AUTHORIZATION_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
    const UNIT_CONTACT_POST_PAINT_DELAY_MS = 0;
    const SECURITY_ROLE_OPTIONS = [
      '一級單位資安窗口',
      '二級單位資安窗口'
    ];

    function getMount() {
      return document.getElementById('app');
    }

    function getRouteParam() {
      if (typeof window === 'undefined' || !window.location.hash) return '';
      const parts = window.location.hash.replace(/^#/, '').split('/');
      return parts[1] ? decodeURIComponent(parts[1]) : '';
    }

    function bindPageEvent(target, type, listener, options) {
      if (typeof addPageEventListener === 'function') {
        return addPageEventListener(target, type, listener, options);
      }
      if (!target || typeof target.addEventListener !== 'function') return function () {};
      target.addEventListener(type, listener, options);
      return function () {
        try { target.removeEventListener(type, listener, options); } catch (_) {}
      };
    }

    function registerUnitContactPageCleanup(callback) {
      if (typeof registerPageCleanup === 'function') {
        return registerPageCleanup(callback);
      }
      return function () {};
    }

    function scheduleRefreshIcons() {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(refreshIcons);
        return;
      }
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(refreshIcons, 0);
        return;
      }
      refreshIcons();
    }

    function scheduleUnitContactPostPaint(task, delayMs) {
      if (typeof task !== 'function') return function () {};
      let cancelled = false;
      let frameId = 0;
      let timerId = 0;
      const run = function () {
        if (cancelled) return;
        try {
          task();
        } catch (error) {
          if (window && typeof window.__ismsWarn === 'function') {
            window.__ismsWarn('unit contact deferred init failed', error);
          }
        }
      };
      const scheduleTimeout = function () {
        const safeDelay = Math.max(0, Number(delayMs) || 0);
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          timerId = window.setTimeout(run, safeDelay);
          return;
        }
        run();
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(scheduleTimeout);
      } else {
        scheduleTimeout();
      }
      return registerUnitContactPageCleanup(function () {
        cancelled = true;
        if (frameId && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          try { window.cancelAnimationFrame(frameId); } catch (_) { }
        }
        if (timerId && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          try { window.clearTimeout(timerId); } catch (_) { }
        }
      });
    }

    function saveLastEmail(email) {
      try {
        window.sessionStorage.setItem(LAST_EMAIL_KEY, String(email || '').trim().toLowerCase());
      } catch (_) {
        // Ignore storage failures.
      }
    }

    function loadLastEmail() {
      try {
        return String(window.sessionStorage.getItem(LAST_EMAIL_KEY) || '').trim().toLowerCase();
      } catch (_) {
        return '';
      }
    }

    function isApplicantEmail(email) {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(String(email || '').trim());
    }

    function normalizeSecurityRoles(value) {
      if (Array.isArray(value)) {
        return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      if (typeof value === 'string') {
        return Array.from(new Set(value.split(/\r?\n|,|;|\|/).map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      return [];
    }

    function buildSecurityRoleCheckboxes(selectedRoles) {
      const selected = new Set(normalizeSecurityRoles(selectedRoles));
      return '<div class="unit-contact-security-roles">'
        + SECURITY_ROLE_OPTIONS.map((role) => {
          const checked = selected.has(role) ? 'checked' : '';
          const testId = 'unit-contact-security-role-' + role.replace(/[^\w\u4e00-\u9fff]+/g, '-');
          return '<label class="unit-contact-security-role-option">'
            + '<input type="checkbox" name="uca-security-role" value="' + esc(role) + '" data-testid="' + esc(testId) + '" ' + checked + '>'
            + '<span>' + esc(role) + '</span>'
            + '</label>';
        }).join('')
        + '</div>';
    }

    function readSelectedSecurityRoles() {
      return Array.from(document.querySelectorAll('input[name="uca-security-role"]:checked'))
        .map((input) => String(input && input.value || '').trim())
        .filter(Boolean);
    }

    function parseUnitList(value) {
      if (Array.isArray(value)) {
        return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      if (typeof value === 'string') {
        const raw = String(value || '').trim();
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((entry) => String(entry || '').trim()).filter(Boolean)));
          }
        } catch (_) {}
        return Array.from(new Set(raw.split(/\r?\n|,|;|\|/).map((entry) => String(entry || '').trim()).filter(Boolean)));
      }
      return [];
    }

    function getUnitSearchEntries() {
      const moduleApi = window._unitModule;
      if (!moduleApi || typeof moduleApi.getUnitSearchEntries !== 'function') return [];
      return moduleApi.getUnitSearchEntries([], {});
    }

    function buildAuthorizedScopePicker(baseId, values, placeholder, hint) {
      const selected = parseUnitList(values);
      const chips = selected.map((value) => '<span class="unit-chip-picker-chip" data-unit-chip="' + esc(value) + '">' + esc(value) + '<button type="button" class="unit-chip-picker-chip-remove" data-remove-unit="' + esc(value) + '" aria-label="移除 ' + esc(value) + '">×</button></span>').join('');
      return '<div class="unit-chip-picker" data-unit-chip-picker="' + esc(baseId) + '">'
        + '<div class="unit-chip-picker-search">'
        + '<input type="search" class="form-input unit-chip-picker-search-input" id="' + esc(baseId) + '-search" aria-label="搜尋額外授權資源範圍" placeholder="' + esc(placeholder || '請輸入單位名稱') + '" autocomplete="off">'
        + '<div class="unit-chip-picker-results" id="' + esc(baseId) + '-results" role="listbox" aria-label="額外授權資源範圍搜尋結果" hidden></div>'
        + '</div>'
        + '<div class="unit-chip-picker-chips" id="' + esc(baseId) + '-chips">' + (chips || '<span class="unit-chip-picker-empty">尚未選擇</span>') + '</div>'
        + '<textarea class="unit-chip-picker-hidden" id="' + esc(baseId) + '" hidden>' + esc(selected.join('\n')) + '</textarea>'
        + '</div>'
        + (hint ? '<div class="form-hint">' + esc(hint) + '</div>' : '');
    }

    function initAuthorizedScopePicker(baseId) {
      const hiddenEl = document.getElementById(baseId);
      const searchEl = document.getElementById(baseId + '-search');
      const resultsEl = document.getElementById(baseId + '-results');
      const chipsEl = document.getElementById(baseId + '-chips');
      if (!hiddenEl || !searchEl || !resultsEl || !chipsEl) return null;
      const state = new Set(parseUnitList(hiddenEl.value));
      const syncHidden = (notifyChange) => {
        hiddenEl.value = Array.from(state).join('\n');
        if (notifyChange !== false) {
          hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const renderChips = () => {
        const chips = Array.from(state).map((value) => '<span class="unit-chip-picker-chip" data-unit-chip="' + esc(value) + '">' + esc(value) + '<button type="button" class="unit-chip-picker-chip-remove" data-remove-unit="' + esc(value) + '" aria-label="移除 ' + esc(value) + '">×</button></span>').join('');
        chipsEl.innerHTML = chips || '<span class="unit-chip-picker-empty">尚未選擇</span>';
      };
      const renderResults = (query) => {
        const text = String(query || '').trim();
        if (!text) {
          resultsEl.hidden = true;
          resultsEl.innerHTML = '';
          return;
        }
        const tokens = text.split(/\s+/).map((part) => String(part || '').trim().toLowerCase()).filter(Boolean);
        const matches = getUnitSearchEntries().filter((entry) => !state.has(entry.value) && tokens.every((token) => entry.searchText.toLowerCase().includes(token))).slice(0, 8);
        resultsEl.hidden = false;
        if (!matches.length) {
          resultsEl.innerHTML = '<div class="unit-chip-picker-empty">找不到符合條件的單位</div>';
          return;
        }
        resultsEl.innerHTML = matches.map((entry) => '<button type="button" class="unit-cascade-search-option unit-chip-picker-option" data-unit-value="' + esc(entry.value) + '"><span class="unit-cascade-search-option-title">' + esc(entry.fullLabel) + '</span><span class="unit-cascade-search-option-meta">' + esc(entry.category || '') + (entry.code ? ' ／ ' + entry.code : '') + '</span></button>').join('');
      };
      const addValue = (value) => {
        const next = String(value || '').trim();
        if (!next || state.has(next)) return;
        state.add(next);
        renderChips();
        syncHidden(true);
      };
      const removeValue = (value) => {
        const next = String(value || '').trim();
        if (!state.has(next)) return;
        state.delete(next);
        renderChips();
        syncHidden(true);
      };
      bindPageEvent(chipsEl, 'click', (event) => {
        const button = event.target.closest('[data-remove-unit]');
        if (!button) return;
        event.preventDefault();
        removeValue(button.dataset.removeUnit);
      });
      bindPageEvent(resultsEl, 'mousedown', (event) => {
        const button = event.target.closest('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      });
      bindPageEvent(searchEl, 'input', () => renderResults(searchEl.value));
      bindPageEvent(searchEl, 'focus', () => renderResults(searchEl.value));
      bindPageEvent(searchEl, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        const button = resultsEl.querySelector('[data-unit-value]');
        if (!button) return;
        event.preventDefault();
        addValue(button.dataset.unitValue);
        searchEl.value = '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
      });
      bindPageEvent(document, 'click', (event) => {
        if (!resultsEl.contains(event.target) && event.target !== searchEl) {
          resultsEl.hidden = true;
        }
      });
      renderChips();
      syncHidden(false);
      return {
        setValues(values) {
          state.clear();
          parseUnitList(values).forEach((value) => state.add(value));
          renderChips();
          syncHidden(true);
        },
        getValues() { return Array.from(state); },
        addValue,
        removeValue,
        clear() {
          state.clear();
          renderChips();
          syncHidden(true);
        }
      };
    }

    function ensureAuthorizedScopePicker() {
      const shell = document.querySelector('[data-unit-contact-authorized-scope-shell]');
      if (!shell) return null;
      if (shell.dataset.hydrated === '1') {
        return initAuthorizedScopePicker('uca-authorized-units');
      }
      shell.innerHTML = buildAuthorizedScopePicker('uca-authorized-units', [], '請輸入單位名稱', '若有跨單位兼辦，請在此加選額外授權範圍；主歸屬單位仍以上方選擇為準。');
      shell.dataset.hydrated = '1';
      return initAuthorizedScopePicker('uca-authorized-units');
    }

    function ensureUnitCascadeControl() {
      const shell = document.querySelector('[data-unit-contact-unit-shell]');
      if (!shell) return null;
      if (shell.dataset.hydrated === '1') {
        return getUnitFieldTargets('uca-unit');
      }
      shell.innerHTML = buildUnitCascadeControl('uca-unit', '', false, true);
      shell.dataset.hydrated = '1';
      const targets = initUnitCascade('uca-unit', '', { disabled: false, registerCleanup: registerUnitContactPageCleanup });
      getUnitFieldTargets('uca-unit').forEach((target) => {
        const describedBy = ['uca-unit-help', 'uca-unit-error'].join(' ');
        target.setAttribute('aria-describedby', describedBy);
      });
      return targets;
    }

    function validateAuthorizationDocument(file) {
      if (!(file instanceof File)) throw new Error('請上傳有效檔案');
      const size = Number(file.size || 0);
      const name = String(file.name || '').trim().toLowerCase();
      if (!size) throw new Error('請上傳有效檔案');
      if (size > AUTHORIZATION_UPLOAD_MAX_BYTES) throw new Error('檔案大小不可超過 5MB');
      if (!/\.(pdf|jpe?g|png)$/i.test(name)) throw new Error('僅支援 PDF、JPG 或 PNG');
      return file;
    }

    function getAuthorizationTemplateVersionKey() {
      return String(window.__APP_ASSET_VERSION__ || (window.__APP_BUILD_INFO__ && window.__APP_BUILD_INFO__.versionKey) || Date.now());
    }

    function downloadAuthorizationTemplate() {
      const link = document.createElement('a');
      link.href = AUTHORIZATION_TEMPLATE_URL + '?v=' + encodeURIComponent(getAuthorizationTemplateVersionKey());
      link.download = AUTHORIZATION_TEMPLATE_FILENAME;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function renderAuthorizationDocumentSelection() {
      const input = document.getElementById('uca-authorization-doc');
      const preview = document.getElementById('uca-authorization-doc-preview');
      if (!preview) return;
      const file = input && input.files && input.files[0] ? input.files[0] : null;
      if (!file) {
        preview.innerHTML = '<span class="unit-contact-file-empty">尚未選擇檔案</span>';
        return;
      }
      preview.innerHTML = '<span class="unit-contact-file-name">' + esc(file.name) + '</span>'
        + '<button type="button" class="btn btn-ghost btn-sm" data-action="unit-contact-clear-auth-doc">清除檔案</button>';
    }

    function ensureAuthorizationDocumentSection(form) {
      if (!form || document.getElementById('uca-authorization-doc-card')) return null;
      const card = document.createElement('div');
      card.className = 'card unit-contact-auth-doc-card';
      card.id = 'uca-authorization-doc-card';
      card.innerHTML = ''
        + '<div class="section-header">' + ic('file-text', 'icon-sm') + ' 授權同意書</div>'
        + '<div class="form-hint unit-contact-auth-doc-note">請先下載授權同意書 PDF，經單位主管簽章後再上傳。</div>'
        + '<div class="form-actions unit-contact-auth-doc-actions">'
        + '<button type="button" class="btn btn-secondary" data-action="unit-contact-download-auth-template">' + ic('download', 'icon-sm') + ' 下載同意書（PDF）</button>'
        + '</div>'
        + '<div class="form-group unit-contact-auth-doc-field">'
        + '<label class="form-label form-required" id="uca-authorization-doc-label" for="uca-authorization-doc">上傳主管簽章之授權同意書</label>'
        + '<input type="file" class="form-input" id="uca-authorization-doc" aria-describedby="uca-authorization-doc-help uca-authorization-doc-error" accept="' + esc(AUTHORIZATION_UPLOAD_ACCEPT) + '" data-testid="unit-contact-authorization-doc-input">'
        + '<div class="form-hint" id="uca-authorization-doc-help">僅支援 PDF、JPG、PNG，檔案大小上限 5MB。</div>'
        + '<div class="form-error-message" id="uca-authorization-doc-error" hidden></div>'
        + '<div class="unit-contact-auth-doc-preview" id="uca-authorization-doc-preview"><span class="unit-contact-file-empty">尚未選擇檔案</span></div>'
        + '</div>';
      const actions = form.querySelector('.form-actions');
      if (actions && actions.parentNode === form) {
        form.insertBefore(card, actions);
      } else {
        form.appendChild(card);
      }
      bindPageEvent(card.querySelector('[data-action="unit-contact-download-auth-template"]'), 'click', downloadAuthorizationTemplate);
      const input = card.querySelector('#uca-authorization-doc');
      bindPageEvent(input, 'change', renderAuthorizationDocumentSelection);
      bindPageEvent(card, 'click', function (event) {
        const button = event.target && event.target.closest ? event.target.closest('[data-action="unit-contact-clear-auth-doc"]') : null;
        if (!button) return;
        const fileInput = document.getElementById('uca-authorization-doc');
        if (fileInput) fileInput.value = '';
        renderAuthorizationDocumentSelection();
      });
      renderAuthorizationDocumentSelection();
      return card;
    }

    function buildApplySideContent() {
      return ''
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('route', 'icon-sm') + ' 申請步驟</div>'
        + buildStepCard('1. 下載同意書', '先下載主管授權同意書，請主管簽章後再進行申請。')
        + buildStepCard('2. 填寫資料', '填入主要歸屬單位與額外授權資源範圍，確保權限範圍清楚。')
        + buildStepCard('3. 上傳送出', '上傳簽章文件並送出，審核通過後即可啟用帳號。')
        + '</div>'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('sparkles', 'icon-sm') + ' 申請提醒</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>主要歸屬單位決定帳號主視角。</li>'
        + '<li>額外授權資源範圍用於跨單位兼辦。</li>'
        + '<li>授權同意書為必填附件。</li>'
        + '<li>審核通過後會直接啟用並寄送登入資訊。</li>'
        + '</ul></div>';
    }

    function buildApplyCoreContent() {
      return ''
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required" for="uca-name">申請人姓名</label><input type="text" class="form-input" id="uca-name" data-testid="unit-contact-name" placeholder="請輸入申請人姓名" aria-describedby="uca-name-error" required><div class="form-error-message" id="uca-name-error" hidden></div></div>'
        + '<div class="form-group"><label class="form-label form-required" for="uca-extension">分機</label><input type="text" class="form-input" id="uca-extension" data-testid="unit-contact-extension" placeholder="例如 61234 或 3366" aria-describedby="uca-extension-error" required><div class="form-error-message" id="uca-extension-error" hidden></div></div>'
        + '</div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required" for="uca-email">申請電子郵件</label><input type="email" class="form-input" id="uca-email" data-testid="unit-contact-email" placeholder="例如 ntu.edu.tw 的信箱或 Gmail" aria-describedby="uca-email-help uca-email-error" required><div class="form-hint" id="uca-email-help">請輸入可正常收信的電子郵件地址。</div><div class="form-error-message" id="uca-email-error" hidden></div></div>'
        + '<div class="form-group"><label class="form-label">備註</label><input type="text" class="form-input" id="uca-note" data-testid="unit-contact-note" placeholder="可補充職稱、代理原因或其他說明"></div></div>'
        + '<div class="form-group unit-contact-security-role-group" data-unit-contact-role-group><label class="form-label form-required">資安角色</label>'
        + '<div class="unit-contact-security-role-shell" data-unit-contact-role-shell><div class="unit-contact-picker-loading">載入資安角色選項…</div></div>'
        + '<div class="form-hint" id="uca-security-role-help">若同時為一、二級單位資安窗口請複選，至少勾選一項。</div><div class="form-error-message" id="uca-security-role-error" hidden></div></div>';
    }

    async function openAuthorizationDocumentPreview(applicationId, email, options) {
      const response = await requestUnitContactAuthorizationDocument(applicationId, {
        email: email || "",
        download: options && options.download ? "1" : ""
      });
      const blob = response && response.blob;
      if (!(blob instanceof Blob)) throw new Error('授權同意書無法預覽');
      const objectUrl = URL.createObjectURL(blob);
      const previewWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!previewWindow) window.location.href = objectUrl;
      setTimeout(() => {
        try { URL.revokeObjectURL(objectUrl); } catch (_) { }
      }, 10000);
      return objectUrl;
    }

    function buildPublicHero(eyebrow, title, subtitle, actions) {
      return ''
        + '<div class="page-header unit-contact-hero">'
        + '<div class="page-eyebrow">' + esc(eyebrow) + '</div>'
        + '<h1 class="page-title" data-route-heading="true">' + esc(title) + '</h1>'
        + '<p class="page-subtitle">' + esc(subtitle) + '</p>'
        + '<div class="unit-contact-hero-actions">' + actions + '</div>'
        + '</div>';
    }

    function buildModeNotice() {
      const modeKey = getM365ModeKey();
      const description = modeKey === 'local-emulator'
        ? '本機模擬環境，資料只會保存在本機快取。'
        : '正式申請模式，資料會依正式流程處理。';
      return ''
        + '<div class="unit-contact-mode-banner">'
        + '<div class="unit-contact-mode-icon">' + ic('shield-check', 'icon-lg') + '</div>'
        + '<div><div class="unit-contact-mode-title">' + esc(getM365ModeLabel()) + '</div>'
        + '<div class="unit-contact-mode-text">' + esc(description) + '</div></div>'
        + '</div>';
    }

    function buildStepCard(title, desc) {
      return ''
        + '<div class="unit-contact-step-card">'
        + '<div class="unit-contact-step-card-title">' + esc(title) + '</div>'
        + '<div class="unit-contact-step-card-text">' + esc(desc) + '</div>'
        + '</div>';
    }

    function buildStatusBadge(application) {
      const tone = String(application && application.statusTone || 'pending').trim() || 'pending';
      const label = String(application && application.statusLabel || '處理中').trim() || '處理中';
      return '<span class="unit-contact-status-badge unit-contact-status-badge--' + esc(tone) + '">' + esc(label) + '</span>';
    }

    function buildApplicationSummary(application) {
      const roles = normalizeSecurityRoles(application && application.securityRoles);
      const authorizedUnits = parseUnitList(application && (application.authorizedUnits || application.scopeUnits || application.units));
      const primaryUnit = String(application && (application.unitValue || application.primaryUnit) || '').trim();
      const extraUnits = authorizedUnits.filter((unit) => unit && unit !== primaryUnit);
      const extraText = extraUnits.length ? extraUnits.join('、') : '無額外授權';
      return ''
        + '<div class="unit-contact-summary-grid">'
        + '<div><span>申請編號</span><strong>' + esc(application && application.id || '—') + '</strong></div>'
        + '<div><span>主要歸屬單位</span><strong>' + esc(primaryUnit || application && application.unitValue || '—') + '</strong></div>'
        + '<div><span>額外授權範圍</span><strong>' + esc(extraText) + '</strong></div>'
        + '<div><span>申請人</span><strong>' + esc(application && application.applicantName || '—') + '</strong></div>'
        + '<div><span>申請電子郵件</span><strong>' + esc(application && application.applicantEmail || '—') + '</strong></div>'
        + (roles.length ? '<div><span>資安角色</span><strong>' + esc(roles.join('、')) + '</strong></div>' : '')
        + '</div>';
    }

    function buildStatusActions(application, lookupEmail) {
      const status = String(application && application.status || '').trim();
      const id = encodeURIComponent(String(application && application.id || '').trim());
      const actions = [];
      if (status === UNIT_CONTACT_APPLICATION_STATUSES.RETURNED) {
        actions.push('<a class="btn btn-primary" href="#apply-unit-contact">返回修改</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">重新查詢</a>');
      } else if (
        status === UNIT_CONTACT_APPLICATION_STATUSES.APPROVED
        || status === UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING
        || status === UNIT_CONTACT_APPLICATION_STATUSES.ACTIVE
      ) {
        actions.push('<a class="btn btn-primary" href="#activate-unit-contact/' + id + '">前往啟用</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">重新查詢</a>');
      } else if (status === UNIT_CONTACT_APPLICATION_STATUSES.REJECTED) {
        actions.push('<a class="btn btn-primary" href="#apply-unit-contact">重新申請</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">重新查詢</a>');
      }
      if (application && application.hasAuthorizationDoc) {
        actions.push('<button type="button" class="btn btn-secondary" data-action="unit-contact-view-auth-doc" data-application-id="' + esc(String(application.id || '').trim()) + '" data-lookup-email="' + esc(String(lookupEmail || '').trim().toLowerCase()) + '">檢視授權同意書</button>');
      }
      if (!actions.length) return '';
      return '<div class="form-actions unit-contact-status-actions">' + actions.join('') + '</div>';
    }

    function buildApplicationStatusCard(application, lookupEmail) {
      const detail = String(application && application.statusDetail || '').trim() || '目前尚無補充說明。';
      const roles = normalizeSecurityRoles(application && application.securityRoles);
      return ''
        + '<article class="card unit-contact-status-card">'
        + '<div class="unit-contact-status-card-top">'
        + '<div><div class="unit-contact-status-id">' + esc(application && application.id || '—') + '</div></div>'
        + buildStatusBadge(application)
        + '</div>'
        + '<div class="unit-contact-status-detail">' + esc(detail) + '</div>'
        + '<div class="unit-contact-status-meta">'
        + '<span>申請編號：' + esc(application && application.id || '—') + '</span>'
        + '<span>送出時間：' + esc(fmtTime(application && application.submittedAt)) + '</span>'
        + '<span>最後更新：' + esc(fmtTime(application && (application.updatedAt || application.submittedAt))) + '</span>'
        + (roles.length ? '<span>資安角色：' + esc(roles.join('、')) + '</span>' : '')
        + '</div>'
        + buildStatusActions(application, lookupEmail)
        + '</article>';
    }
    function readUnitFormState(baseId) {
      return {
        unitValue: String(document.getElementById(baseId)?.value || '').trim(),
        unitCategory: String(document.getElementById(baseId + '-category')?.value || '').trim(),
        primaryUnit: String(document.getElementById(baseId + '-parent')?.value || '').trim(),
        secondaryUnit: String(document.getElementById(baseId + '-child')?.value || '').trim()
      };
    }

    function markDirty() {
      setUnsavedChangesGuard(true, '申請內容尚未送出，離開前請先確認是否要保留變更。');
    }

    function clearDirty() {
      clearUnsavedChangesGuard();
    }

    function renderFormFeedback(elementId, state, title, details) {
      const feedback = document.getElementById(elementId);
      if (!feedback) return;
      const lines = Array.isArray(details) ? details.filter(Boolean) : [];
      feedback.dataset.state = state || 'info';
      feedback.hidden = false;
      feedback.setAttribute('role', state === 'error' ? 'alert' : 'status');
      feedback.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
      feedback.innerHTML = '<div class="form-feedback-title">' + esc(title || '') + '</div>'
        + (lines.length ? '<div class="form-feedback-list">' + lines.map((line) => '<span>' + esc(line) + '</span>').join('') + '</div>' : '');
    }

    function clearFormFeedback(elementId) {
      const feedback = document.getElementById(elementId);
      if (!feedback) return;
      feedback.hidden = true;
      feedback.dataset.state = 'idle';
      feedback.removeAttribute('role');
      feedback.setAttribute('aria-live', 'polite');
      feedback.innerHTML = '';
    }

    function normalizeFieldTargets(targets) {
      const source = targets && typeof targets.length === 'number' && !targets.tagName && !Array.isArray(targets)
        ? Array.from(targets)
        : (Array.isArray(targets) ? targets : [targets]);
      return source.filter((target) => target && typeof target.setAttribute === 'function');
    }

    function getUnitFieldTargets(baseId) {
      return [
        document.getElementById(baseId + '-search'),
        document.getElementById(baseId + '-parent'),
        document.getElementById(baseId + '-child'),
        document.getElementById(baseId)
      ].filter(Boolean);
    }

    function setFieldError(options) {
      const settings = options && typeof options === 'object' ? options : {};
      const targets = normalizeFieldTargets(settings.targets);
      const message = String(settings.message || '').trim();
      const errorEl = document.getElementById(String(settings.errorId || '').trim());
      const group = settings.group && settings.group.classList ? settings.group : null;
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = !message;
      }
      if (group) group.classList.toggle('form-group--invalid', !!message);
      targets.forEach((target) => {
        if (message) {
          target.setAttribute('aria-invalid', 'true');
          if (errorEl && errorEl.id) target.setAttribute('aria-errormessage', errorEl.id);
        } else {
          target.removeAttribute('aria-invalid');
          target.removeAttribute('aria-errormessage');
        }
      });
    }

    function clearFieldError(errorId, targets, group) {
      setFieldError({ errorId, targets, group, message: '' });
    }

    function focusFirstTarget(targets) {
      const firstTarget = normalizeFieldTargets(targets)[0];
      if (!firstTarget || typeof firstTarget.focus !== 'function') return;
      const group = firstTarget.closest('.form-group') || firstTarget;
      if (group && typeof group.scrollIntoView === 'function') {
        group.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      firstTarget.focus();
    }

    function clearApplyValidationForTarget(target) {
      if (!(target instanceof HTMLElement)) return;
      if (target.id === 'uca-name') {
        clearFieldError('uca-name-error', target, target.closest('.form-group'));
      } else if (target.id === 'uca-extension') {
        clearFieldError('uca-extension-error', target, target.closest('.form-group'));
      } else if (target.id === 'uca-email') {
        clearFieldError('uca-email-error', target, target.closest('.form-group'));
      } else if (target.id === 'uca-authorization-doc') {
        clearFieldError('uca-authorization-doc-error', target, target.closest('.form-group'));
      } else if (target.id === 'uca-unit' || target.id === 'uca-unit-search' || target.id === 'uca-unit-parent' || target.id === 'uca-unit-child') {
        clearFieldError('uca-unit-error', getUnitFieldTargets('uca-unit'), document.querySelector('[data-unit-contact-unit-group]'));
      } else if (target.name === 'uca-security-role') {
        clearFieldError('uca-security-role-error', document.querySelectorAll('input[name="uca-security-role"]'), document.querySelector('[data-unit-contact-role-group]'));
      }
      clearFormFeedback('unit-contact-apply-feedback');
    }

    function clearStatusValidationForTarget(target) {
      if (!(target instanceof HTMLElement)) return;
      if (target.id === 'uca-status-email') {
        clearFieldError('uca-status-email-error', target, target.closest('.form-group'));
      }
      clearFormFeedback('unit-contact-status-feedback');
    }

    function renderApplyForm() {
      const mount = getMount();
      if (!mount) return;
      clearDirty();

      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '申請單位管理員',
          '先確認主要歸屬單位，再補充可跨單位授權的資源範圍。',
          '若申請者同時兼辦其他單位，請在下方補充額外授權資源範圍。審核通過後，系統會依主要歸屬單位與授權範圍建立帳號權限。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢進度</a>'
        )
        + buildModeNotice()
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('plus-circle', 'icon-sm') + ' 申請表單</div>'
        + '<form id="unit-contact-apply-form" data-testid="unit-contact-apply-form" novalidate>'
        + '<div class="form-feedback" id="unit-contact-apply-feedback" data-state="idle" aria-live="polite" aria-atomic="true" hidden></div>'
        + '<div class="form-row"><div class="form-group" data-unit-contact-unit-group><label class="form-label form-required">申請單位</label>'
        + '<div class="unit-contact-unit-shell" data-unit-contact-unit-shell><div class="unit-contact-picker-loading">載入主要單位選擇…</div></div>'
        + '<div class="form-hint" id="uca-unit-help">請先選擇主要歸屬單位；若有跨單位兼辦，再補充額外授權資源範圍。</div><div class="form-error-message" id="uca-unit-error" hidden></div></div></div>'
        + '<div class="form-group"><label class="form-label">額外授權資源範圍（可複選）</label>'
        + '<div class="unit-contact-authorized-scope-shell" data-unit-contact-authorized-scope-shell><div class="unit-contact-picker-loading">載入額外授權資源範圍…</div></div>'
        + '</div>'
        + '<div class="unit-contact-core-shell" data-unit-contact-core-shell><div class="unit-contact-picker-loading">基本欄位載入中…</div></div>'
        + '<div class="form-actions">'
        + '<button type="submit" class="btn btn-primary" data-testid="unit-contact-submit" disabled>' + ic('send', 'icon-sm') + ' 送出申請</button>'
        + '<a class="btn btn-ghost" href="#apply-unit-contact-status">查詢進度</a>'
        + '</div>'
        + '</form></div></div>'
        + '<section class="unit-contact-side" aria-label="申請說明" data-unit-contact-side-shell>'
        + '<div class="unit-contact-side-loading">申請說明載入中…</div>'
        + '</section></div></section>';

      let authorizedScopePicker = null;
      const form = document.getElementById('unit-contact-apply-form');
      const submitButton = form.querySelector('[data-testid="unit-contact-submit"]');
      scheduleUnitContactPostPaint(function () {
        ensureUnitCascadeControl();
        authorizedScopePicker = ensureAuthorizedScopePicker() || authorizedScopePicker;
        const coreShell = document.querySelector('[data-unit-contact-core-shell]');
        if (coreShell && !coreShell.dataset.hydrated) {
          coreShell.innerHTML = buildApplyCoreContent();
          coreShell.dataset.hydrated = '1';
        }
        ensureAuthorizationDocumentSection(form);
        const roleShell = document.querySelector('[data-unit-contact-role-shell]');
        if (roleShell && !roleShell.dataset.hydrated) {
          roleShell.innerHTML = buildSecurityRoleCheckboxes([]);
          roleShell.dataset.hydrated = '1';
        }
        const sideShell = document.querySelector('[data-unit-contact-side-shell]');
        if (sideShell && !sideShell.dataset.hydrated) {
          sideShell.innerHTML = buildApplySideContent();
          sideShell.dataset.hydrated = '1';
        }
        if (submitButton && submitButton.disabled) {
          submitButton.disabled = false;
        }
        document.querySelectorAll('input[name="uca-security-role"]').forEach((input) => {
          input.setAttribute('aria-describedby', 'uca-security-role-help uca-security-role-error');
        });
        scheduleRefreshIcons();
      }, UNIT_CONTACT_POST_PAINT_DELAY_MS);

      bindPageEvent(form, 'input', function (event) {
        markDirty();
        clearApplyValidationForTarget(event.target);
      });
      bindPageEvent(form, 'change', function (event) {
        markDirty();
        clearApplyValidationForTarget(event.target);
      });
      bindPageEvent(form, 'submit', async function (event) {
        event.preventDefault();
        ensureUnitCascadeControl();
        const unitState = readUnitFormState('uca-unit');
        const applicantName = String(document.getElementById('uca-name').value || '').trim();
        const extensionNumber = String(document.getElementById('uca-extension').value || '').trim();
        const applicantEmail = String(document.getElementById('uca-email').value || '').trim().toLowerCase();
        const note = String(document.getElementById('uca-note').value || '').trim();
        const securityRoles = readSelectedSecurityRoles();
        let authDocInput = document.getElementById('uca-authorization-doc');
        if (!authDocInput) {
          ensureAuthorizationDocumentSection(form);
          authDocInput = document.getElementById('uca-authorization-doc');
        }
        const authDocFile = authDocInput && authDocInput.files && authDocInput.files[0] ? authDocInput.files[0] : null;
        const unitTargets = getUnitFieldTargets('uca-unit');
        const validationErrors = [];

        clearFieldError('uca-unit-error', unitTargets, document.querySelector('[data-unit-contact-unit-group]'));
        clearFieldError('uca-name-error', document.getElementById('uca-name'), document.getElementById('uca-name') && document.getElementById('uca-name').closest('.form-group'));
        clearFieldError('uca-extension-error', document.getElementById('uca-extension'), document.getElementById('uca-extension') && document.getElementById('uca-extension').closest('.form-group'));
        clearFieldError('uca-email-error', document.getElementById('uca-email'), document.getElementById('uca-email') && document.getElementById('uca-email').closest('.form-group'));
        clearFieldError('uca-security-role-error', document.querySelectorAll('input[name="uca-security-role"]'), document.querySelector('[data-unit-contact-role-group]'));
        clearFieldError('uca-authorization-doc-error', authDocInput, authDocInput && authDocInput.closest('.form-group'));
        clearFormFeedback('unit-contact-apply-feedback');

        if (!unitState.unitValue) {
          validationErrors.push({
            message: '請先選擇申請單位',
            errorId: 'uca-unit-error',
            targets: unitTargets,
            group: document.querySelector('[data-unit-contact-unit-group]')
          });
        }
        if (!applicantName) {
          validationErrors.push({
            message: '請輸入申請人姓名',
            errorId: 'uca-name-error',
            targets: document.getElementById('uca-name'),
            group: document.getElementById('uca-name') && document.getElementById('uca-name').closest('.form-group')
          });
        }
        if (!extensionNumber) {
          validationErrors.push({
            message: '請輸入分機',
            errorId: 'uca-extension-error',
            targets: document.getElementById('uca-extension'),
            group: document.getElementById('uca-extension') && document.getElementById('uca-extension').closest('.form-group')
          });
        }
        if (!isApplicantEmail(applicantEmail)) {
          validationErrors.push({
            message: '請輸入可收信的電子郵件',
            errorId: 'uca-email-error',
            targets: document.getElementById('uca-email'),
            group: document.getElementById('uca-email') && document.getElementById('uca-email').closest('.form-group')
          });
        }
        if (!securityRoles.length) {
          validationErrors.push({
            message: '請至少選擇一種資安角色身分',
            errorId: 'uca-security-role-error',
            targets: document.querySelectorAll('input[name="uca-security-role"]'),
            group: document.querySelector('[data-unit-contact-role-group]')
          });
        }

        if (!authDocFile) {
          validationErrors.push({
            message: '請上傳主管授權同意書',
            errorId: 'uca-authorization-doc-error',
            targets: authDocInput,
            group: authDocInput && authDocInput.closest('.form-group')
          });
        }

        if (validationErrors.length) {
          validationErrors.forEach((entry) => setFieldError(entry));
          renderFormFeedback(
            'unit-contact-apply-feedback',
            'error',
            '送出前仍有欄位未完成',
            validationErrors.map((entry) => entry.message)
          );
          toast(validationErrors[0].message, 'error');
          focusFirstTarget(validationErrors[0].targets);
          return;
        }

        try {
          validateAuthorizationDocument(authDocFile);

          if (submitButton) {
            submitButton.disabled = true;
            submitButton.dataset.originalText = submitButton.innerHTML;
            submitButton.innerHTML = ic('loader-circle', 'icon-sm') + ' 送出中…';
            submitButton.setAttribute('aria-busy', 'true');
          }

          const uploadedAuthDoc = await submitAttachmentUpload({ file: authDocFile, name: authDocFile.name, type: authDocFile.type }, {
            publicUpload: true,
            scope: 'unit-contact-authorization-doc',
            ownerId: applicantEmail,
            recordType: 'unit-contact-application',
            fileName: authDocFile.name
          });
          if (!uploadedAuthDoc || !uploadedAuthDoc.attachmentId) throw new Error('授權同意書上傳失敗');
          const extraAuthorizedUnits = authorizedScopePicker && typeof authorizedScopePicker.getValues === 'function'
            ? authorizedScopePicker.getValues()
            : parseUnitList(document.getElementById('uca-authorized-units') && document.getElementById('uca-authorized-units').value);
          const authorizedUnits = Array.from(new Set([unitState.unitValue, ...extraAuthorizedUnits].filter(Boolean)));
          const result = await submitUnitContactApplication({
            ...unitState,
            unitCode: getUnitCode(unitState.unitValue),
            applicantName,
            extensionNumber,
            applicantEmail,
            note,
            securityRoles,
            primaryUnit: unitState.primaryUnit || unitState.unitValue,
            authorizedUnits,
            scopeUnits: authorizedUnits,
            units: authorizedUnits,
            authorizationDocAttachmentId: String(uploadedAuthDoc && uploadedAuthDoc.attachmentId || '').trim(),
            authorizationDocDriveItemId: String(uploadedAuthDoc && uploadedAuthDoc.driveItemId || '').trim(),
            authorizationDocFileName: String(uploadedAuthDoc && uploadedAuthDoc.name || authDocFile.name || '').trim(),
            authorizationDocContentType: String(uploadedAuthDoc && uploadedAuthDoc.contentType || authDocFile.type || '').trim(),
            authorizationDocSize: Number(uploadedAuthDoc && uploadedAuthDoc.size || authDocFile.size || 0),
            authorizationDocUploadedAt: String(uploadedAuthDoc && uploadedAuthDoc.uploadedAt || new Date().toISOString()).trim()
          });

          if (!result || !result.application) throw new Error('申請送出失敗');
          saveLastEmail(applicantEmail);
          clearDirty();
          clearFormFeedback('unit-contact-apply-feedback');
          toast('申請已送出，審核通過後將直接啟用帳號。');
          navigate('apply-unit-contact-success/' + encodeURIComponent(result.application.id), { allowDirtyNavigation: true });
        } catch (error) {
          const message = String(error && error.message || error || '申請失敗');
          if (authDocInput && /授權同意書|檔案/.test(message)) {
            setFieldError({
              message: message,
              errorId: 'uca-authorization-doc-error',
              targets: authDocInput,
              group: authDocInput.closest('.form-group')
            });
          }
          renderFormFeedback('unit-contact-apply-feedback', 'error', '申請送出失敗', [message]);
          toast(String(error && error.message || error || '申請失敗'), 'error');
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = submitButton.dataset.originalText || (ic('send', 'icon-sm') + ' 送出申請');
            submitButton.removeAttribute('aria-busy');
          }
        }
      });

    }

    function renderApplySuccess(param) {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      const applicationId = param || getRouteParam();
      const application = applicationId ? getUnitContactApplication(applicationId) : null;
      if (!application) {
        mount.innerHTML = ''
          + '<section class="unit-contact-shell">'
          + buildPublicHero(
            '申請已送出',
            '目前找不到申請資料。',
            '可能是連結已失效，請重新申請或改用申請進度查詢。',
            '<a class="btn btn-primary" href="#apply-unit-contact">重新申請</a>'
          )
          + '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">找不到申請資料</div><div class="empty-state-desc">請重新申請或使用進度查詢功能確認目前狀態。</div></div>'
          + '</section>';
        scheduleRefreshIcons();
        return;
      }
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '申請已送出',
          '已收到申請資料，審核通過後將直接啟用帳號。',
          '請妥善保存申請編號，以便後續查詢進度與追蹤審核狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢進度</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-success-card">'
        + '<div class="unit-contact-success-mark">' + ic('badge-check', 'icon-xl') + '</div>'
        + buildApplicationSummary(application)
        + '<div class="unit-contact-success-note">授權同意書與申請資料已保留，後續若有補件需求，可由進度頁面查詢並重新提交。</div>'
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">查詢進度</a><a class="btn btn-ghost" href="#apply-unit-contact">再次申請</a></div>'
        + '</div></div></div></section>';
      scheduleRefreshIcons();
    }

    function renderApplyStatus() {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      const defaultEmail = loadLastEmail();
      let currentLookupEmail = defaultEmail;
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '查詢申請進度',
          '輸入申請時填寫的電子郵件即可查詢。',
          '若有跨單位兼辦，系統會一併顯示主要歸屬單位與額外授權範圍。',
          '<a class="btn btn-secondary" href="#apply-unit-contact">' + ic('arrow-left', 'icon-sm') + ' 返回申請</a>'
        )
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('mail', 'icon-sm') + ' 申請進度查詢</div>'
        + '<form id="unit-contact-status-form" novalidate>'
        + '<div class="form-feedback" id="unit-contact-status-feedback" data-state="idle" aria-live="polite" aria-atomic="true" hidden></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required" for="uca-status-email">申請電子郵件</label><input type="email" class="form-input" id="uca-status-email" value="' + esc(defaultEmail) + '" placeholder="請輸入申請時填寫的電子郵件" aria-describedby="uca-status-email-help uca-status-email-error" required><div class="form-hint" id="uca-status-email-help">請輸入申請單上填寫的電子郵件地址。</div><div class="form-error-message" id="uca-status-email-error" hidden></div></div>'
        + '<div class="form-group unit-contact-status-action"><button type="submit" class="btn btn-primary unit-contact-status-query-btn">' + ic('search', 'icon-sm') + ' 查詢</button></div>'
        + '</div></form>'
        + '<div id="unit-contact-status-results" aria-live="polite" aria-busy="false"></div>'
        + '</div></div>'
        + '<section class="unit-contact-side" aria-label="查詢說明">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('info', 'icon-sm') + ' 查詢說明</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>請輸入申請時的電子郵件。</li>'
        + '<li>系統會顯示申請單位、資安角色與審核狀態。</li>'
        + '<li>若審核已通過，將可直接前往啟用頁面。</li>'
        + '</ul></div></section>'
        + '</div></section>';

      const form = document.getElementById('unit-contact-status-form');
      const resultsEl = document.getElementById('unit-contact-status-results');
      if (resultsEl && !resultsEl.dataset.authDocPreviewBound) {
        resultsEl.dataset.authDocPreviewBound = '1';
        bindPageEvent(resultsEl, 'click', async function (event) {
          const button = event.target && event.target.closest ? event.target.closest('[data-action="unit-contact-view-auth-doc"]') : null;
          if (!button) return;
          event.preventDefault();
          const applicationId = String(button.getAttribute('data-application-id') || '').trim();
          const lookupEmail = String(button.getAttribute('data-lookup-email') || currentLookupEmail || '').trim().toLowerCase();
          if (!applicationId) return;
          const originalText = button.innerHTML;
          button.disabled = true;
          button.innerHTML = ic('loader-circle', 'icon-sm') + ' 載入中...';
          try {
            const response = await requestUnitContactAuthorizationDocument(applicationId, { email: lookupEmail });
            const blob = response && response.blob;
            if (!(blob instanceof Blob)) throw new Error('授權同意書無法預覽');
            const objectUrl = URL.createObjectURL(blob);
            const previewWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');
            if (!previewWindow) window.location.href = objectUrl;
            setTimeout(() => { try { URL.revokeObjectURL(objectUrl); } catch (_) { } }, 10000);
          } catch (error) {
            toast(String(error && error.message || error || '授權同意書無法預覽'), 'error');
          } finally {
            button.disabled = false;
            button.innerHTML = originalText;
          }
        });
      }

      async function runLookup() {
        clearFieldError('uca-status-email-error', document.getElementById('uca-status-email'), document.getElementById('uca-status-email') && document.getElementById('uca-status-email').closest('.form-group'));
        clearFormFeedback('unit-contact-status-feedback');
        const email = String(document.getElementById('uca-status-email').value || '').trim().toLowerCase();
        if (!email) {
          setFieldError({
            message: '請輸入申請時填寫的電子郵件',
            errorId: 'uca-status-email-error',
            targets: document.getElementById('uca-status-email'),
            group: document.getElementById('uca-status-email') && document.getElementById('uca-status-email').closest('.form-group')
          });
          renderFormFeedback('unit-contact-status-feedback', 'error', '查詢前仍有欄位未完成', ['請輸入申請時填寫的電子郵件']);
          toast('請輸入申請時填寫的電子郵件', 'error');
          focusFirstTarget(document.getElementById('uca-status-email'));
          return;
        }
        if (!isApplicantEmail(email)) {
          setFieldError({
            message: '請輸入有效的電子郵件格式',
            errorId: 'uca-status-email-error',
            targets: document.getElementById('uca-status-email'),
            group: document.getElementById('uca-status-email') && document.getElementById('uca-status-email').closest('.form-group')
          });
          renderFormFeedback('unit-contact-status-feedback', 'error', '查詢前仍有欄位未完成', ['請輸入有效的電子郵件格式']);
          toast('請輸入有效的電子郵件格式', 'error');
          focusFirstTarget(document.getElementById('uca-status-email'));
          return;
        }
        saveLastEmail(email);
        resultsEl.setAttribute('aria-busy', 'true');
        resultsEl.innerHTML = '<div class="unit-contact-results-loading">查詢中...</div>';
        try {
          const applications = await lookupUnitContactApplicationsByEmail(email);
          if (!applications.length) {
            resultsEl.innerHTML = '<div class="empty-state unit-contact-inline-empty"><div class="empty-state-icon">' + ic('inbox', 'icon-lg') + '</div><div class="empty-state-title">查無申請資料</div><div class="empty-state-desc">請確認輸入的是申請時填寫的電子郵件，或稍後再試一次。</div></div>';
            scheduleRefreshIcons();
            return;
          }
          resultsEl.innerHTML = '<div class="unit-contact-status-list">' + applications.map((application) => buildApplicationStatusCard(application, currentLookupEmail)).join('') + '</div>';
          scheduleRefreshIcons();
        } catch (error) {
          resultsEl.innerHTML = '';
          renderFormFeedback('unit-contact-status-feedback', 'error', '查詢失敗', [String(error && error.message || error || '查詢失敗')]);
          toast(String(error && error.message || error || '查詢失敗'), 'error');
        } finally {
          resultsEl.setAttribute('aria-busy', 'false');
        }
      }

      bindPageEvent(form, 'input', function (event) {
        clearStatusValidationForTarget(event.target);
      });
      bindPageEvent(form, 'change', function (event) {
        clearStatusValidationForTarget(event.target);
      });
      bindPageEvent(form, 'submit', function (event) {
        event.preventDefault();
        runLookup();
      });
      if (defaultEmail) runLookup();
      scheduleRefreshIcons();
    }

    function renderActivate(param) {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      const application = param ? getUnitContactApplication(param) : null;
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '帳號啟用',
          '確認申請資料與授權範圍後，即可啟用帳號。',
          '若申請時包含額外授權資源範圍，啟用後系統會一併套用對應權限。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢進度</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-side-card">'
        + '<div class="section-header">' + ic('key', 'icon-sm') + ' 啟用說明</div>'
        + '<div class="unit-contact-activation-copy">請先確認申請資料與授權範圍是否正確。若無誤，按下啟用後即可開通帳號並套用對應的單位權限。</div>'
        + (application ? buildApplicationSummary(application) : '')
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">返回查詢</a></div>'
        + '</div></div></div></section>';
      scheduleRefreshIcons();
    }

    return {
      renderApplyForm,
      renderApplySuccess,
      renderApplyStatus,
      renderActivate
    };
  };
})();
