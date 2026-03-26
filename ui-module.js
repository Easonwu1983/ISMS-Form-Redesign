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
      if (!normalized.total) return emptyText || '目前沒有符合條件的資料';
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
        ? `<label class="form-label" for="${escAttr(idPrefix)}-page-limit" style="margin:0 4px 0 0">每頁</label>`
          + `<select class="form-select" id="${escAttr(idPrefix)}-page-limit" style="min-width:88px">`
          + limitOptions.map((value) => `<option value="${esc(value)}" ${String(page.limit) === value ? 'selected' : ''}>${esc(value)}</option>`).join('')
          + '</select>'
        : '';
      return `${limitHtml}`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-first-page"${actionAttr('FirstPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevrons-left', 'icon-sm')} 首頁</button>`
        + `<button type="button" class="btn btn-secondary btn-sm" id="${escAttr(idPrefix)}-prev-page"${actionAttr('PrevPage')} ${page.hasPrev ? '' : 'disabled'}>${ic('chevron-left', 'icon-sm')} 上一頁</button>`
        + `<span class="review-card-subtitle" style="margin:0 4px 0 8px">頁次 ${page.currentPage || 0} / ${page.pageCount || 0}</span>`
        + `<label class="form-label" for="${escAttr(idPrefix)}-page-number" style="margin:0 4px 0 8px">跳至</label>`
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
      const page = normalizePage(options.page, options.defaultLimit);
      const summary = String(options.summary || formatPageSummary(page, options.emptyText, options.defaultLimit)).trim();
      const mainHtml = options.mainHtml
        || `<span class="review-card-subtitle">${esc(summary)}</span>`;
      return `<div class="${escAttr(toolbarClass)}"${toolbarStyle ? ` style="${escAttr(toolbarStyle)}"` : ''}>`
        + `<div class="review-toolbar-main">${mainHtml}</div>`
        + `<div class="review-toolbar-actions">${renderPagerControls(options)}</div>`
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
      const actionPrefix = String(options.actionPrefix || '').trim();
      const queryAction = function (suffix, actionName) {
        const byId = document.getElementById(`${idPrefix}-${suffix}`);
        if (byId) return byId;
        if (!actionPrefix || !document.querySelector) return null;
        const actionValue = actionPrefix + actionName;
        if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
          return document.querySelector(`[data-action="${CSS.escape(actionValue)}"]`);
        }
        return document.querySelector(`[data-action="${actionValue}"]`);
      };
      const limitSelect = document.getElementById(`${idPrefix}-page-limit`);
      const pageNumberInput = document.getElementById(`${idPrefix}-page-number`);
      const firstButton = queryAction('first-page', 'FirstPage');
      const prevButton = queryAction('prev-page', 'PrevPage');
      const jumpButton = queryAction('jump-page', 'JumpPage');
      const nextButton = queryAction('next-page', 'NextPage');
      const lastButton = queryAction('last-page', 'LastPage');

      if (limitSelect) {
        limitSelect.addEventListener('change', function () {
          onChange({
            limit: String(limitSelect.value || page.limit || options.defaultLimit || 50),
            offset: '0'
          });
        });
      }
      if (pageNumberInput) {
        pageNumberInput.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const nextOffset = getOffset(page, pageNumberInput.value || '1');
          onChange({ offset: String(nextOffset) });
        });
      }
      if (jumpButton && pageNumberInput) {
        jumpButton.addEventListener('click', function () {
          const nextOffset = getOffset(page, pageNumberInput.value || '1');
          onChange({ offset: String(nextOffset) });
        });
      }
      if (firstButton) {
        firstButton.addEventListener('click', function () {
          onChange({ offset: '0' });
        });
      }
      if (prevButton) {
        prevButton.addEventListener('click', function () {
          onChange({ offset: String(page.prevOffset || 0) });
        });
      }
      if (nextButton) {
        nextButton.addEventListener('click', function () {
          onChange({ offset: String(page.nextOffset || 0) });
        });
      }
      if (lastButton) {
        lastButton.addEventListener('click', function () {
          const nextOffset = getOffset(page, page.pageCount || 1);
          onChange({ offset: String(nextOffset) });
        });
      }
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
    const DEFAULT_UNSAVED_MESSAGE = '目前有未儲存的變更，確定要離開此頁嗎？';
    const MODAL_ROOT_ID = 'modal-root';
    const BUSY_ROOT_ID = 'busy-root';
    let iconRetryTimer = null;
    let iconRetryCount = 0;
    let unsavedChangesActive = false;
    let unsavedChangesMessage = DEFAULT_UNSAVED_MESSAGE;
    let busyOverlayDepth = 0;

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
      if (!value) return '—';
      const parts = getTaipeiDateParts(value);
      if (!parts) return '—';
      return [parts.year, parts.month, parts.day].join('/');
    }

    function fmtTime(value) {
      if (!value) return '—';
      const parts = getTaipeiDateParts(value);
      if (!parts) return '—';
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

    function toast(message, type) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const node = document.createElement('div');
      node.className = 'toast toast-' + sanitizeToken(type, 'success');
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
      const safeLabel = String(label || '編號').trim() || '編號';
      return '<button type="button" class="copy-id-btn" data-copy="' + escAttr(text) + '" data-copy-label="' + escAttr(safeLabel) + '" title="複製' + esc(safeLabel) + '" aria-label="複製' + esc(safeLabel) + '">' + ic('copy', 'icon-xs') + '</button>';
    }

    function renderCopyIdCell(value, label, strong) {
      const text = String(value || '').trim();
      const classes = ['copy-id-cell'];
      if (strong) classes.push('copy-id-cell--strong');
      return '<div class="' + classes.join(' ') + '"><span class="copy-id-text">' + esc(text || '—') + '</span>' + renderCopyIdButton(text, label) + '</div>';
    }

    function copyTextToClipboard(value, label) {
      const text = String(value || '').trim();
      const safeLabel = String(label || '編號').trim() || '編號';
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
          toast(safeLabel + '已複製');
          return true;
        } catch (_) {
          toast(safeLabel + '複製失敗', 'error');
          return false;
        }
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(function () {
          toast(safeLabel + '已複製');
          return true;
        }).catch(function () {
          return fallbackCopy();
        });
      }
      return Promise.resolve(fallbackCopy());
    }

    function bindCopyButtons(root) {
      const scope = root || document;
      scope.querySelectorAll('.copy-id-btn:not([data-copy-bound])').forEach(function (button) {
        button.dataset.copyBound = '1';
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          copyTextToClipboard(button.dataset.copy || '', button.dataset.copyLabel || '編號');
        });
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
        if (!iconRetryTimer && iconRetryCount < 20) {
          iconRetryTimer = window.setTimeout(function () {
            iconRetryTimer = null;
            iconRetryCount += 1;
            refreshIcons();
          }, 120);
        }
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
      const modalRoot = ensureModalRoot();
      document.body.classList.add('modal-open');
      modalRoot.innerHTML = '<div class="modal-backdrop" data-modal-dismiss="1"></div><div class="modal-shell"><div class="modal-card ' + escAttr(opts.className || '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button type="button" class="modal-close-btn" data-modal-dismiss="1" aria-label="關閉">' + ic('x', 'icon-sm') + '</button>' + contentHtml + '</div></div>';
      const cleanup = function () {
        document.removeEventListener('keydown', handleKeydown);
      };
      const finish = function () {
        cleanup();
        closeModal();
      };
      const handleKeydown = function (event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          const cancelButton = modalRoot.querySelector('[data-modal-cancel]');
          if (cancelButton) cancelButton.click(); else finish();
        }
      };
      document.addEventListener('keydown', handleKeydown);
      modalRoot.querySelectorAll('[data-modal-dismiss]').forEach(function (button) {
        button.addEventListener('click', function (event) {
          event.preventDefault();
          finish();
        });
      });
      refreshIcons();
      return { root: modalRoot, close: finish };
    }

    function openConfirmDialog(message, options) {
      const opts = options || {};
      return new Promise(function (resolve) {
        const dialog = renderDialog(
          '<div class="modal-header"><div class="modal-kicker">' + esc(opts.kicker || '請確認') + '</div><h3 class="modal-title" id="modal-title">' + esc(opts.title || '確認操作') + '</h3></div>'
          + '<div class="modal-body"><p class="modal-message">' + esc(message || '') + '</p></div>'
          + '<div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-cancel="1">' + esc(opts.cancelLabel || '取消') + '</button><button type="button" class="btn ' + escAttr(opts.confirmClass || 'btn-primary') + '" data-modal-confirm="1">' + esc(opts.confirmLabel || '確認') + '</button></div>',
          { className: 'modal-card--confirm' }
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
          '<div class="modal-header"><div class="modal-kicker">' + esc(opts.kicker || '請輸入') + '</div><h3 class="modal-title" id="modal-title">' + esc(opts.title || '輸入內容') + '</h3></div>'
          + '<form class="modal-body modal-form" data-modal-form="1"><p class="modal-message">' + esc(message || '') + '</p><div class="form-group"><label class="form-label" for="' + inputId + '">' + esc(opts.label || '內容') + '</label><input type="text" class="form-input" id="' + inputId + '" value="' + escAttr(opts.defaultValue || '') + '" placeholder="' + escAttr(opts.placeholder || '') + '" ' + (opts.required === false ? '' : 'required') + '></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-cancel="1">' + esc(opts.cancelLabel || '取消') + '</button><button type="submit" class="btn ' + escAttr(opts.confirmClass || 'btn-primary') + '">' + esc(opts.confirmLabel || '確認') + '</button></div></form>',
          { className: 'modal-card--prompt' }
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
