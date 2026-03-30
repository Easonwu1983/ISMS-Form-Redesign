(function () {
  function createPagerModule() {
    function escHtml(value) {
      if (typeof document === 'undefined') return String(value === null || value === undefined ? '' : value);
      const node = document.createElement('div');
      node.textContent = value === null || value === undefined ? '' : String(value);
      return node.innerHTML;
    }

    function escAttr(value) {
      return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function normalizePage(page, defaultLimit) {
      const source = page && typeof page === 'object' ? page : {};
      const limit = Math.max(1, Number(source.limit || defaultLimit || 50) || Number(defaultLimit || 50) || 50);
      const total = Math.max(0, Number(source.total || 0) || 0);
      const pageCount = total > 0
        ? Math.max(1, Number(source.pageCount || Math.ceil(total / limit)) || Math.ceil(total / limit))
        : 0;
      const currentPage = total > 0
        ? Math.min(pageCount, Math.max(1, Number(source.currentPage || Math.floor((Number(source.offset || 0) || 0) / limit) + 1) || 1))
        : 0;
      return {
        offset: Math.max(0, Number(source.offset || 0) || 0),
        limit,
        total,
        pageCount,
        currentPage,
        hasPrev: !!source.hasPrev,
        hasNext: !!source.hasNext,
        prevOffset: Math.max(0, Number(source.prevOffset || 0) || 0),
        nextOffset: Math.max(0, Number(source.nextOffset || 0) || 0),
        pageStart: Math.max(0, Number(source.pageStart || 0) || 0),
        pageEnd: Math.max(0, Number(source.pageEnd || 0) || 0)
      };
    }

    function getOffsetByPageNumber(page, targetPage, defaultLimit) {
      const normalized = normalizePage(page, defaultLimit);
      if (!normalized.total) return 0;
      const parsed = Number.parseInt(String(targetPage || '').trim(), 10);
      const safePage = Math.min(
        Math.max(1, normalized.pageCount || 1),
        Math.max(1, Number.isFinite(parsed) ? parsed : 1)
      );
      return (safePage - 1) * normalized.limit;
    }

    function formatPageSummary(page, emptyText, defaultLimit) {
      const normalized = normalizePage(page, defaultLimit);
      if (!normalized.total) return emptyText || '目前沒有資料';
      return `第 ${normalized.currentPage} / ${normalized.pageCount} 頁，顯示 ${normalized.pageStart}-${normalized.pageEnd} / ${normalized.total} 筆`;
    }

    function renderPagerControls(config) {
      const options = config && typeof config === 'object' ? config : {};
      const esc = typeof options.esc === 'function' ? options.esc : escHtml;
      const ic = typeof options.ic === 'function' ? options.ic : function () { return ''; };
      const page = normalizePage(options.page, options.defaultLimit);
      const idPrefix = String(options.idPrefix || 'pager').trim() || 'pager';
      const actionPrefix = String(options.actionPrefix || '').trim();
      const showLimit = options.showLimit !== false;
      const limitOptions = Array.isArray(options.limitOptions) && options.limitOptions.length
        ? options.limitOptions.map((value) => String(value))
        : [String(page.limit || 50)];
      const pageMax = page.pageCount || 1;
      const pageValue = page.currentPage || 1;
      const disableJump = page.total ? '' : 'disabled';
      const actionAttr = function (name) {
        return actionPrefix ? ` data-action="${escAttr(actionPrefix + name)}"` : '';
      };
      const limitHtml = showLimit
        ? `<label class="form-label" for="${escAttr(idPrefix)}-page-limit" style="margin:0 4px 0 0">筆數</label>`
          + `<select class="form-select" id="${escAttr(idPrefix)}-page-limit" style="min-width:88px">`
          + limitOptions.map((value) => `<option value="${esc(value)}" ${String(page.limit) === value ? 'selected' : ''}>${esc(value)}</option>`).join('')
          + '</select>'
        : '';
      return `${limitHtml}`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-first-page"${actionAttr('FirstPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevrons-left', 'icon-sm')} 首頁</button>`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-prev-page"${actionAttr('PrevPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevron-left', 'icon-sm')} 上一頁</button>`
        + `<span class="review-card-subtitle" style="margin:0 4px 0 8px">第 ${page.currentPage || 0} / ${page.pageCount || 0} 頁</span>`
        + `<label class="form-label" for="${escAttr(idPrefix)}-page-number" style="margin:0 4px 0 8px">跳轉</label>`
        + `<input type="number" class="form-input" id="${escAttr(idPrefix)}-page-number" min="1" max="${pageMax}" value="${pageValue}" ${disableJump} style="width:88px">`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-jump-page"${actionAttr('JumpPage')} ${disableJump}>前往</button>`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-next-page"${actionAttr('NextPage')} ${page.hasNext ? '' : 'disabled'}>下一頁 ${ic('chevron-right', 'icon-sm')}</button>`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-last-page"${actionAttr('LastPage')} ${page.hasNext ? '' : 'disabled'}>末頁 ${ic('chevrons-right', 'icon-sm')}</button>`;
    }

    function renderPagerToolbar(config) {
      const options = config && typeof config === 'object' ? config : {};
      const esc = typeof options.esc === 'function' ? options.esc : escHtml;
      const toolbarClass = String(options.toolbarClass || 'review-toolbar review-toolbar--compact').trim();
      const toolbarStyle = String(options.toolbarStyle || '').trim();
      const idPrefix = String(options.idPrefix || 'pager').trim() || 'pager';
      const ariaLabel = String(options.ariaLabel || '分頁工具列').trim() || '分頁工具列';
      const page = normalizePage(options.page, options.defaultLimit);
      const summary = String(options.summary || formatPageSummary(page, options.emptyText, options.defaultLimit)).trim();
      const mainHtml = options.mainHtml
        || `<span class="review-card-subtitle">${esc(summary)}</span>`;
      const extraActionsHtml = String(options.extraActionsHtml || '').trim();
      return `<div class="${escAttr(toolbarClass)}" data-pager-root="${escAttr(idPrefix)}" role="navigation" aria-label="${escAttr(ariaLabel)}"${toolbarStyle ? ` style="${escAttr(toolbarStyle)}"` : ''}>`
        + `<div class="review-toolbar-main">${mainHtml}</div>`
        + `<div class="review-toolbar-actions">${extraActionsHtml}${renderPagerControls(options)}</div>`
        + `</div>`;
    }

    function bindPagerControls(config) {
      const options = config && typeof config === 'object' ? config : {};
      const idPrefix = String(options.idPrefix || '').trim();
      const onChange = typeof options.onChange === 'function' ? options.onChange : null;
      if (!idPrefix || !onChange || typeof document === 'undefined') return;
      const page = normalizePage(options.page, options.defaultLimit);
      const getOffset = typeof options.getOffsetByPageNumber === 'function'
        ? options.getOffsetByPageNumber
        : function (currentPage, targetPage) {
            return getOffsetByPageNumber(currentPage, targetPage, options.defaultLimit);
          };
      const selectorValue = typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function'
        ? CSS.escape(idPrefix)
        : idPrefix.replace(/"/g, '\\"');
      const root = document.querySelector(`[data-pager-root="${selectorValue}"]`);
      if (!root || root.dataset.pagerBound === '1') return;
      root.dataset.pagerBound = '1';

      function resolveAction(target) {
        if (!target || typeof target.closest !== 'function') return '';
        const button = target.closest('button');
        if (!button || !root.contains(button)) return '';
        if (button.id === `${idPrefix}-first-page`) return 'first';
        if (button.id === `${idPrefix}-prev-page`) return 'prev';
        if (button.id === `${idPrefix}-jump-page`) return 'jump';
        if (button.id === `${idPrefix}-next-page`) return 'next';
        if (button.id === `${idPrefix}-last-page`) return 'last';
        return '';
      }

      root.addEventListener('change', function (event) {
        const target = event.target;
        if (!target || target.id !== `${idPrefix}-page-limit`) return;
        onChange({
          limit: String(target.value || page.limit || options.defaultLimit || 50),
          offset: '0'
        });
      });

      root.addEventListener('keydown', function (event) {
        const target = event.target;
        if (!target || target.id !== `${idPrefix}-page-number` || event.key !== 'Enter') return;
        event.preventDefault();
        const nextOffset = getOffset(page, target.value || '1');
        onChange({ offset: String(nextOffset) });
      });

      root.addEventListener('click', function (event) {
        const action = resolveAction(event.target);
        if (!action) return;
        event.preventDefault();
        if (action === 'first') {
          onChange({ offset: '0' });
          return;
        }
        if (action === 'prev') {
          onChange({ offset: String(page.prevOffset || 0) });
          return;
        }
        if (action === 'next') {
          onChange({ offset: String(page.nextOffset || 0) });
          return;
        }
        if (action === 'last') {
          const nextOffset = getOffset(page, page.pageCount || 1);
          onChange({ offset: String(nextOffset) });
          return;
        }
        const pageNumberInput = document.getElementById(`${idPrefix}-page-number`);
        const nextOffset = getOffset(page, pageNumberInput && pageNumberInput.value || '1');
        onChange({ offset: String(nextOffset) });
      });
    }

    return {
      normalizePage,
      getOffsetByPageNumber,
      formatPageSummary,
      renderPagerControls,
      renderPagerToolbar,
      bindPagerControls
    };
  }

  if (typeof window !== 'undefined' && !window.__ISMS_PAGER__) {
    window.__ISMS_PAGER__ = createPagerModule();
  }

  window.createUiModule = function createUiModule() {
    const DEFAULT_UNSAVED_MESSAGE = '目前有尚未儲存的變更，離開後資料可能遺失。';
    const MODAL_ROOT_ID = 'modal-root';
    const BUSY_ROOT_ID = 'busy-root';
    let iconRetryTimer = null;
    let iconRetryCount = 0;
    let lucideLoadPromise = null;
    let unsavedChangesActive = false;
    let unsavedChangesMessage = DEFAULT_UNSAVED_MESSAGE;
    let busyOverlayDepth = 0;
    let pageRuntimeController = null;
    let pageRuntimeCleanups = [];

    if (typeof window !== 'undefined' && !window.__UNSAVED_CHANGES_GUARD__) {
      window.addEventListener('beforeunload', function (event) {
        if (!unsavedChangesActive) return;
        event.preventDefault();
        event.returnValue = unsavedChangesMessage;
        return unsavedChangesMessage;
      });
      window.__UNSAVED_CHANGES_GUARD__ = true;
    }

    function getTaipeiDateParts(value) {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return null;
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
      }, {});
      return {
        year: parts.year || '',
        month: parts.month || '',
        day: parts.day || '',
        hour: parts.hour || '',
        minute: parts.minute || '',
        second: parts.second || ''
      };
    }

    function fmt(value) {
      if (!value) return '--';
      const parts = getTaipeiDateParts(value);
      if (!parts) return '--';
      return [parts.year, parts.month, parts.day].join('/');
    }

    function fmtTime(value) {
      if (!value) return '--';
      const parts = getTaipeiDateParts(value);
      if (!parts) return '--';
      return [parts.year, parts.month, parts.day].join('/') + ' ' + [parts.hour, parts.minute].join(':');
    }

    function esc(value) {
      const div = document.createElement('div');
      div.textContent = value === null || value === undefined ? '' : String(value);
      return div.innerHTML;
    }

    function escAttr(value) {
      return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function sanitizeToken(value, fallback) {
      const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '');
      return cleaned || fallback || '';
    }

    function ic(name, className) {
      const safeName = sanitizeToken(name, 'circle');
      const safeClassName = String(className || '')
        .split(/\s+/)
        .map(function (entry) { return sanitizeToken(entry); })
        .filter(Boolean)
        .join(' ');
      return '<i data-lucide="' + escAttr(safeName) + '"' + (safeClassName ? ' class="' + escAttr(safeClassName) + '"' : '') + '></i>';
    }

    function ntuLogo(className) {
      const safeClassName = String(className || '')
        .split(/\s+/)
        .map(function (entry) { return sanitizeToken(entry); })
        .filter(Boolean)
        .join(' ');
      return '<span class="ntu-logo' + (safeClassName ? ' ' + escAttr(safeClassName) : '') + '">NTU</span>';
    }

    function getRuntimeAssetLoaderModule() {
      if (typeof window === 'undefined') return null;
      if (window._runtimeAssetLoaderModule && typeof window._runtimeAssetLoaderModule.ensureLucideLoaded === 'function') {
        return window._runtimeAssetLoaderModule;
      }
      if (typeof window.createRuntimeAssetLoaderModule !== 'function') return null;
      window._runtimeAssetLoaderModule = window.createRuntimeAssetLoaderModule();
      return window._runtimeAssetLoaderModule;
    }

    function ensureLucideLoaded() {
      if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
        return Promise.resolve(window.lucide);
      }
      if (lucideLoadPromise) return lucideLoadPromise;
      const loader = getRuntimeAssetLoaderModule();
      if (!loader || typeof loader.ensureLucideLoaded !== 'function') {
        return Promise.reject(new Error('lucide loader unavailable'));
      }
      lucideLoadPromise = loader.ensureLucideLoaded().finally(function () {
        lucideLoadPromise = null;
      });
      return lucideLoadPromise;
    }

    function ensurePageRuntimeController() {
      if (!pageRuntimeController || pageRuntimeController.signal.aborted) {
        pageRuntimeController = typeof AbortController === 'function'
          ? new AbortController()
          : { signal: null, abort: function () {} };
      }
      return pageRuntimeController;
    }

    function registerPageCleanup(callback) {
      if (typeof callback !== 'function') return function () {};
      pageRuntimeCleanups.push(callback);
      return function () {
        pageRuntimeCleanups = pageRuntimeCleanups.filter(function (entry) { return entry !== callback; });
      };
    }

    function teardownPageRuntime() {
      if (pageRuntimeController && typeof pageRuntimeController.abort === 'function') {
        try { pageRuntimeController.abort(); } catch (_) {}
      }
      pageRuntimeController = null;
      const callbacks = pageRuntimeCleanups.slice();
      pageRuntimeCleanups = [];
      callbacks.forEach(function (callback) {
        try { callback(); } catch (_) {}
      });
    }

    function beginPageRuntime() {
      teardownPageRuntime();
      return ensurePageRuntimeController().signal;
    }

    function addPageEventListener(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== 'function' || typeof listener !== 'function') {
        return function () {};
      }
      const controller = ensurePageRuntimeController();
      let removed = false;
      const normalizedOptions = options && typeof options === 'object' ? Object.assign({}, options) : options;
      try {
        const scopedOptions = normalizedOptions && typeof normalizedOptions === 'object'
          ? Object.assign({}, normalizedOptions, { signal: controller.signal })
          : { signal: controller.signal };
        target.addEventListener(type, listener, scopedOptions);
        return function () {
          if (removed) return;
          removed = true;
          try { target.removeEventListener(type, listener, normalizedOptions); } catch (_) {}
        };
      } catch (_) {
        target.addEventListener(type, listener, normalizedOptions);
        return registerPageCleanup(function () {
          if (removed) return;
          removed = true;
          try { target.removeEventListener(type, listener, normalizedOptions); } catch (_) {}
        });
      }
    }

    function toast(message, type) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-relevant', 'additions text');
      container.setAttribute('aria-atomic', 'false');
      const node = document.createElement('div');
      const tone = sanitizeToken(type, 'success');
      node.className = 'toast toast-' + tone;
      node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      node.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
      node.setAttribute('aria-atomic', 'true');
      node.innerHTML = '<span class="toast-message">' + esc(message || '') + '</span>';
      container.appendChild(node);
      window.setTimeout(function () {
        node.style.opacity = '0';
        node.style.transform = 'translateX(40px)';
        node.style.transition = 'all 300ms';
      }, 2500);
      window.setTimeout(function () {
        node.remove();
      }, 2800);
    }

    function renderCopyIdButton(value, label) {
      const text = String(value || '').trim();
      if (!text) return '';
      const safeLabel = String(label || '內容').trim() || '內容';
      return '<button type="button" class="copy-id-btn" data-copy="' + escAttr(text) + '" data-copy-label="' + escAttr(safeLabel) + '" title="複製' + esc(safeLabel) + '" aria-label="複製' + esc(safeLabel) + '">' + ic('copy', 'icon-xs') + '</button>';
    }

    function renderCopyIdCell(value, label, strong) {
      const text = String(value || '').trim();
      const classes = ['copy-id-cell'];
      if (strong) classes.push('copy-id-cell--strong');
      return '<div class="' + classes.join(' ') + '"><span class="copy-id-text">' + esc(text || '') + '</span>' + renderCopyIdButton(text, label) + '</div>';
    }

    function copyTextToClipboard(value, label) {
      const text = String(value || '').trim();
      const safeLabel = String(label || '內容').trim() || '內容';
      if (!text) {
        toast('沒有可複製的' + safeLabel, 'error');
        return Promise.resolve(false);
      }

      function fallbackCopy() {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly', 'readonly');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (!ok) throw new Error('copy command failed');
          toast(safeLabel + ' 已複製');
          return true;
        } catch (_) {
          toast(safeLabel + '複製失敗', 'error');
          return false;
        }
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(function () {
          toast(safeLabel + ' 已複製');
          return true;
        }).catch(function () {
          return fallbackCopy();
        });
      }
      return Promise.resolve(fallbackCopy());
    }

    function bindCopyButtons(root) {
      const scope = root || document;
      const isDocumentScope = scope === document;
      if (isDocumentScope) {
        if (window.__COPY_BUTTONS_BOUND__) return;
        window.__COPY_BUTTONS_BOUND__ = true;
      } else {
        if (scope.dataset && scope.dataset.copyRootBound === '1') return;
        if (scope.dataset) scope.dataset.copyRootBound = '1';
      }
      scope.addEventListener('click', function (event) {
        const button = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('.copy-id-btn')
          : null;
        if (!button || (scope !== document && !scope.contains(button))) return;
        event.preventDefault();
        event.stopPropagation();
        copyTextToClipboard(button.dataset.copy || '', button.dataset.copyLabel || '內容');
      });
    }

    function applyTestIds(map) {
      Object.entries(map || {}).forEach(function (entry) {
        const element = document.getElementById(entry[0]);
        if (element && entry[1]) element.setAttribute('data-testid', entry[1]);
      });
    }

    function applySelectorTestIds(entries) {
      (entries || []).forEach(function (entry) {
        const element = document.querySelector(entry.selector);
        if (element && entry.testId) element.setAttribute('data-testid', entry.testId);
      });
    }

    function debugFlow(scope, message, data) {
      try {
        if (!window.console || typeof window.console.info !== 'function') return;
        if (data === undefined) {
          window.console.info('[ISMS:' + scope + '] ' + message);
          return;
        }
        window.console.info('[ISMS:' + scope + '] ' + message, data);
      } catch (_) {}
    }

    function toTestIdFragment(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function mkChk(name, opts, selected) {
      const values = Array.isArray(opts) ? opts : [];
      const selectedSet = new Set(Array.isArray(selected) ? selected.map(String) : []);
      return '<div class="checkbox-group" data-testid="' + escAttr(name) + '-group">' + values.map(function (option, index) {
        const value = String(option || '');
        const key = toTestIdFragment(value) || String(index);
        return '<label class="chk-label" data-testid="' + escAttr(name) + '-option-' + key + '"><input type="checkbox" name="' + escAttr(name) + '" value="' + escAttr(value) + '" data-testid="' + escAttr(name) + '-input-' + key + '" ' + (selectedSet.has(value) ? 'checked' : '') + '><span class="chk-box"></span>' + esc(value) + '</label>';
      }).join('') + '</div>';
    }

    function mkRadio(name, opts, selected) {
      const values = Array.isArray(opts) ? opts : [];
      const selectedValue = String(selected || '');
      return '<div class="radio-group" data-testid="' + escAttr(name) + '-group">' + values.map(function (option, index) {
        const value = String(option || '');
        const key = toTestIdFragment(value) || String(index);
        return '<label class="radio-label" data-testid="' + escAttr(name) + '-option-' + key + '"><input type="radio" name="' + escAttr(name) + '" value="' + escAttr(value) + '" data-testid="' + escAttr(name) + '-input-' + key + '" ' + (selectedValue === value ? 'checked' : '') + '><span class="radio-dot"></span>' + esc(value) + '</label>';
      }).join('') + '</div>';
    }

    function refreshIcons() {
      const lucideApi = window.lucide;
      if (!lucideApi || typeof lucideApi.createIcons !== 'function') {
        ensureLucideLoaded().then(function () {
          refreshIcons();
        }).catch(function () {
          if (!iconRetryTimer && iconRetryCount < 20) {
            iconRetryTimer = window.setTimeout(function () {
              iconRetryTimer = null;
              iconRetryCount += 1;
              refreshIcons();
            }, 120);
          }
        });
        return;
      }
      iconRetryCount = 0;
      if (iconRetryTimer) {
        window.clearTimeout(iconRetryTimer);
        iconRetryTimer = null;
      }
      const raf = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 0); };
      raf(function () {
        lucideApi.createIcons();
      });
    }

    function ensureModalRoot() {
      let modalRoot = document.getElementById(MODAL_ROOT_ID);
      if (!modalRoot) {
        modalRoot = document.createElement('div');
        modalRoot.id = MODAL_ROOT_ID;
        document.body.appendChild(modalRoot);
      }
      return modalRoot;
    }

    function getFocusableElements(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return [];
      return Array.from(root.querySelectorAll(
        'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )).filter(function (element) {
        return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true';
      });
    }

    function ensureBusyRoot() {
      let busyRoot = document.getElementById(BUSY_ROOT_ID);
      if (!busyRoot) {
        busyRoot = document.createElement('div');
        busyRoot.id = BUSY_ROOT_ID;
        document.body.appendChild(busyRoot);
      }
      return busyRoot;
    }

    function closeModal() {
      const modalRoot = document.getElementById(MODAL_ROOT_ID);
      if (modalRoot) modalRoot.innerHTML = '';
      document.body.classList.remove('modal-open');
    }

    function showBusyState(message) {
      busyOverlayDepth += 1;
      const busyRoot = ensureBusyRoot();
      busyRoot.innerHTML = '<div class="busy-overlay" aria-live="polite" aria-busy="true"><div class="busy-card"><span class="busy-spinner" aria-hidden="true"></span><div class="busy-title">' + esc(message || '\u7cfb\u7d71\u8655\u7406\u4e2d\u2026') + '</div></div></div>';
    }

    function hideBusyState() {
      busyOverlayDepth = Math.max(0, busyOverlayDepth - 1);
      if (busyOverlayDepth > 0) return;
      const busyRoot = document.getElementById(BUSY_ROOT_ID);
      if (busyRoot) busyRoot.innerHTML = '';
    }

    async function runWithBusyState(message, task) {
      showBusyState(message);
      try {
        return await task();
      } finally {
        hideBusyState();
      }
    }

    function renderDialog(contentHtml, options) {
      const opts = options || {};
      const titleId = String(opts.titleId || 'modal-title').trim() || 'modal-title';
      const describedBy = String(opts.describedBy || '').trim();
      const modalRoot = ensureModalRoot();
      const previousActiveElement = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
      document.body.classList.add('modal-open');
      modalRoot.innerHTML = '<div class="modal-backdrop" data-modal-dismiss="1"></div><div class="modal-shell"><div class="modal-card ' + escAttr(opts.className || '') + '" role="dialog" aria-modal="true" aria-labelledby="' + escAttr(titleId) + '"' + (describedBy ? ' aria-describedby="' + escAttr(describedBy) + '"' : '') + ' tabindex="-1"><button type="button" class="modal-close-btn" data-modal-dismiss="1" aria-label="關閉">' + ic('x', 'icon-sm') + '</button>' + contentHtml + '</div></div>';
      const modalCard = modalRoot.querySelector('.modal-card');
      const cleanup = function () {
        document.removeEventListener('keydown', handleKeydown);
      };
      const finish = function () {
        cleanup();
        closeModal();
        if (previousActiveElement && typeof previousActiveElement.focus === 'function' && document.contains(previousActiveElement)) {
          previousActiveElement.focus({ preventScroll: true });
        }
      };
      const handleKeydown = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          const cancelButton = modalRoot.querySelector('[data-modal-cancel]');
          if (cancelButton) cancelButton.click(); else finish();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusables = getFocusableElements(modalCard);
        if (!focusables.length) {
          event.preventDefault();
          if (modalCard && typeof modalCard.focus === 'function') modalCard.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || active === modalCard) {
            event.preventDefault();
            last.focus();
          }
          return;
        }
        if (active === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', handleKeydown);
      modalRoot.querySelectorAll('[data-modal-dismiss]').forEach(function (button) {
        button.addEventListener('click', function (event) {
          event.preventDefault();
          finish();
        });
      });
      if (modalCard && typeof modalCard.focus === 'function') {
        modalCard.focus({ preventScroll: true });
      }
      refreshIcons();
      return { root: modalRoot, close: finish };
    }

    function openConfirmDialog(message, options) {
      const opts = options || {};
      return new Promise(function (resolve) {
        const dialog = renderDialog(
          '<div class="modal-header"><div class="modal-kicker">' + esc(opts.kicker || '確認') + '</div><h3 class="modal-title" id="modal-title">' + esc(opts.title || '請再次確認') + '</h3></div>'
          + '<div class="modal-body"><p class="modal-message" id="modal-description">' + esc(message || '') + '</p></div>'
          + '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-cancel="1">' + esc(opts.cancelLabel || '取消') + '</button><button type="button" class="btn ' + escAttr(opts.confirmClass || 'btn-primary') + '" data-modal-confirm="1">' + esc(opts.confirmLabel || '確認') + '</button></div>',
          { className: 'modal-card--confirm', describedBy: 'modal-description' }
        );
        const cancel = dialog.root.querySelector('[data-modal-cancel]');
        const confirm = dialog.root.querySelector('[data-modal-confirm]');
        cancel.addEventListener('click', function (event) {
          event.preventDefault();
          dialog.close();
          resolve(false);
        });
        confirm.addEventListener('click', function (event) {
          event.preventDefault();
          dialog.close();
          resolve(true);
        });
        confirm.focus();
      });
    }

    function openPromptDialog(message, options) {
      const opts = options || {};
      return new Promise(function (resolve) {
        const inputId = 'modal-prompt-input';
        const dialog = renderDialog(
          '<div class="modal-header"><div class="modal-kicker">' + esc(opts.kicker || '輸入') + '</div><h3 class="modal-title" id="modal-title">' + esc(opts.title || '請輸入內容') + '</h3></div>'
          + '<form class="modal-body modal-form" data-modal-form="1"><p class="modal-message" id="modal-description">' + esc(message || '') + '</p><div class="form-group"><label class="form-label" for="' + inputId + '">' + esc(opts.label || '內容') + '</label><input type="text" class="form-input" id="' + inputId + '" aria-describedby="modal-description" value="' + escAttr(opts.defaultValue || '') + '" placeholder="' + escAttr(opts.placeholder || '') + '" ' + (opts.required === false ? '' : 'required') + '></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-cancel="1">' + esc(opts.cancelLabel || '取消') + '</button><button type="submit" class="btn ' + escAttr(opts.confirmClass || 'btn-primary') + '">' + esc(opts.confirmLabel || '確認') + '</button></div></form>',
          { className: 'modal-card--prompt', describedBy: 'modal-description' }
        );
        const form = dialog.root.querySelector('[data-modal-form]');
        const input = dialog.root.querySelector('#' + inputId);
        const cancel = dialog.root.querySelector('[data-modal-cancel]');
        cancel.addEventListener('click', function (event) {
          event.preventDefault();
          dialog.close();
          resolve(null);
        });
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          const value = String(input.value || '').trim();
          if (opts.required !== false && !value) {
            input.reportValidity();
            return;
          }
          dialog.close();
          resolve(value);
        });
        input.focus();
        input.select();
      });
    }

    function setUnsavedChangesGuard(active, message) {
      unsavedChangesActive = !!active;
      if (message) unsavedChangesMessage = String(message);
    }

    function clearUnsavedChangesGuard() {
      unsavedChangesActive = false;
      unsavedChangesMessage = DEFAULT_UNSAVED_MESSAGE;
    }

    function hasUnsavedChangesGuard() {
      return !!unsavedChangesActive;
    }

    function confirmDiscardUnsavedChanges(message, clearOnConfirm) {
      if (!unsavedChangesActive) return true;
      const ok = window.confirm(String(message || unsavedChangesMessage || DEFAULT_UNSAVED_MESSAGE));
      if (ok && clearOnConfirm !== false) clearUnsavedChangesGuard();
      return ok;
    }

    function downloadJson(filename, payload) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 500);
    }

    return {
      fmt,
      fmtTime,
      ic,
      ntuLogo,
      esc,
      escAttr,
      toast,
      renderCopyIdButton,
      renderCopyIdCell,
      copyTextToClipboard,
      bindCopyButtons,
      beginPageRuntime,
      teardownPageRuntime,
      registerPageCleanup,
      addPageEventListener,
      applyTestIds,
      applySelectorTestIds,
      debugFlow,
      toTestIdFragment,
      mkChk,
      mkRadio,
      refreshIcons,
      openConfirmDialog,
      openPromptDialog,
      closeModal,
      showBusyState,
      hideBusyState,
      runWithBusyState,
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      hasUnsavedChangesGuard,
      confirmDiscardUnsavedChanges,
      downloadJson
    };
  };
})();

