(function () {
  window.createUiModule = function createUiModule() {
    let iconRetryTimer = null;
    let iconRetryCount = 0;
    let unsavedChangesActive = false;
    let unsavedChangesMessage = '目前有未儲存的變更，確定要離開此頁嗎？';

    if (typeof window !== 'undefined' && !window.__UNSAVED_CHANGES_GUARD__) {
      window.addEventListener('beforeunload', function (event) {
        if (!unsavedChangesActive) return;
        event.preventDefault();
        event.returnValue = unsavedChangesMessage;
        return unsavedChangesMessage;
      });
      window.__UNSAVED_CHANGES_GUARD__ = true;
    }

    function fmt(d) {
      if (!d) return '—';
      const x = new Date(d);
      return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`;
    }

    function fmtTime(d) {
      if (!d) return '—';
      const x = new Date(d);
      return `${fmt(d)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    }

    function ic(n, c = '') {
      return `<i data-lucide="${n}" ${c ? 'class="' + c + '"' : ''}></i>`;
    }

    function ntuLogo(c = '') {
      return '<span class="ntu-logo ' + c + '">NTU</span>';
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    function toast(msg, type = 'success') {
      const c = document.getElementById('toast-container');
      if (!c) return;
      const t = document.createElement('div');
      t.className = `toast toast-${type}`;
      t.innerHTML = `<span class="toast-message">${esc(msg)}</span>`;
      c.appendChild(t);
      setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(40px)';
        t.style.transition = 'all 300ms';
      }, 2500);
      setTimeout(() => t.remove(), 2800);
    }

    function renderCopyIdButton(value, label) {
      const text = String(value || '').trim();
      if (!text) return '';
      const safeLabel = String(label || '編號').trim();
      return `<button type="button" class="copy-id-btn" data-copy="${esc(text)}" data-copy-label="${esc(safeLabel)}" title="複製${esc(safeLabel)}" aria-label="複製${esc(safeLabel)}">${ic('copy', 'icon-xs')}</button>`;
    }

    function renderCopyIdCell(value, label, strong = false) {
      const text = String(value || '').trim();
      const classes = ['copy-id-cell'];
      if (strong) classes.push('copy-id-cell--strong');
      return `<div class="${classes.join(' ')}"><span class="copy-id-text">${esc(text || '—')}</span>${renderCopyIdButton(text, label)}</div>`;
    }

    function copyTextToClipboard(value, label = '編號') {
      const text = String(value || '').trim();
      if (!text) {
        toast(`沒有可複製的${label}`, 'error');
        return Promise.resolve(false);
      }

      const fallbackCopy = () => {
        try {
          const input = document.createElement('textarea');
          input.value = text;
          input.setAttribute('readonly', '');
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(input);
          if (!ok) throw new Error('copy command failed');
          toast(`${label}已複製`);
          return true;
        } catch (_) {
          toast(`${label}複製失敗`, 'error');
          return false;
        }
      };

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(() => {
          toast(`${label}已複製`);
          return true;
        }).catch(() => fallbackCopy());
      }
      return Promise.resolve(fallbackCopy());
    }

    function bindCopyButtons(root = document) {
      root.querySelectorAll('.copy-id-btn:not([data-copy-bound])').forEach((button) => {
        button.dataset.copyBound = '1';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          copyTextToClipboard(button.dataset.copy || '', button.dataset.copyLabel || '編號');
        });
      });
    }

    function applyTestIds(map) {
      Object.entries(map || {}).forEach(([id, testId]) => {
        const el = document.getElementById(id);
        if (el && testId) el.setAttribute('data-testid', testId);
      });
    }

    function applySelectorTestIds(entries) {
      (entries || []).forEach((entry) => {
        const el = document.querySelector(entry.selector);
        if (el && entry.testId) el.setAttribute('data-testid', entry.testId);
      });
    }

    function debugFlow(scope, message, data) {
      try {
        if (!window.console || typeof window.console.info !== 'function') return;
        if (data === undefined) window.console.info(`[ISMS:${scope}] ${message}`);
        else window.console.info(`[ISMS:${scope}] ${message}`, data);
      } catch (_) { }
    }

    function toTestIdFragment(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    function mkChk(name, opts, sel) {
      return '<div class="checkbox-group" data-testid="' + name + '-group">' + opts.map((o, index) => {
        const key = toTestIdFragment(o) || String(index);
        return '<label class="chk-label" data-testid="' + name + '-option-' + key + '"><input type="checkbox" name="' + name + '" value="' + o + '" data-testid="' + name + '-input-' + key + '" ' + ((sel || []).includes(o) ? 'checked' : '') + '><span class="chk-box"></span>' + o + '</label>';
      }).join('') + '</div>';
    }

    function mkRadio(name, opts, sel) {
      return '<div class="radio-group" data-testid="' + name + '-group">' + opts.map((o, index) => {
        const key = toTestIdFragment(o) || String(index);
        return '<label class="radio-label" data-testid="' + name + '-option-' + key + '"><input type="radio" name="' + name + '" value="' + o + '" data-testid="' + name + '-input-' + key + '" ' + (sel === o ? 'checked' : '') + '><span class="radio-dot"></span>' + o + '</label>';
      }).join('') + '</div>';
    }

    function refreshIcons() {
      const lucideApi = window.lucide;
      if (!lucideApi || typeof lucideApi.createIcons !== 'function') {
        if (!iconRetryTimer && iconRetryCount < 20) {
          iconRetryTimer = setTimeout(() => {
            iconRetryTimer = null;
            iconRetryCount += 1;
            refreshIcons();
          }, 120);
        }
        return;
      }
      iconRetryCount = 0;
      if (iconRetryTimer) {
        clearTimeout(iconRetryTimer);
        iconRetryTimer = null;
      }
      const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
      raf(() => lucideApi.createIcons());
    }

    function setUnsavedChangesGuard(active, message) {
      unsavedChangesActive = !!active;
      if (message) unsavedChangesMessage = String(message);
    }

    function clearUnsavedChangesGuard() {
      unsavedChangesActive = false;
    }

    function hasUnsavedChangesGuard() {
      return !!unsavedChangesActive;
    }

    function confirmDiscardUnsavedChanges(message, clearOnConfirm = true) {
      if (!unsavedChangesActive) return true;
      const finalMessage = String(message || unsavedChangesMessage || '目前有未儲存的變更，確定要離開此頁嗎？');
      const ok = window.confirm(finalMessage);
      if (ok && clearOnConfirm) clearUnsavedChangesGuard();
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
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (_) { }
      }, 500);
    }

    return {
      fmt,
      fmtTime,
      ic,
      ntuLogo,
      esc,
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
      setUnsavedChangesGuard,
      clearUnsavedChangesGuard,
      hasUnsavedChangesGuard,
      confirmDiscardUnsavedChanges,
      downloadJson
    };
  };
})();
