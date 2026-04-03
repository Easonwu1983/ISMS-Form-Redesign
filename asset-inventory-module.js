// @ts-check
(function () {
  window.createAssetInventoryModule = function createAssetInventoryModule(deps) {
    const {
      currentUser,
      isAdmin,
      navigate,
      toast,
      esc,
      ic,
      fmt,
      refreshIcons,
      splitUnitValue,
      buildUnitCascadeControl,
      initUnitCascade,
      registerActionHandlers,
      addPageEventListener,
      registerPageCleanup,
      openConfirmDialog,
      runWithBusyState,
      CONFIG,
      ASSET_CATEGORIES
    } = deps;

    // -------------------------------------------------------
    // Constants
    // -------------------------------------------------------
    const CATEGORIES = {
      PE: { label: '\u4eba\u54e1', subs: ['\u5168\u8077\u540c\u4ec1', '\u7d04\u8058\u4eba\u54e1', '\u59d4\u5916\u5ee0\u5546', '\u5176\u4ed6'] },
      DC: { label: '\u8cc7\u8a0a-\u6587\u4ef6', subs: ['\u516c\u6587', '\u5831\u8868', '\u8868\u55ae', '\u8a08\u756b', '\u4f7f\u7528\u624b\u518a', '\u7cfb\u7d71\u6587\u4ef6', 'ISMS\u6587\u4ef6', '\u5176\u4ed6'] },
      DA: { label: '\u8cc7\u8a0a-\u8cc7\u6599', subs: ['\u6a94\u6848', '\u8cc7\u6599\u5eab', '\u7cfb\u7d71\u8a18\u9304', '\u500b\u4eba\u8cc7\u6599', '\u539f\u59cb\u7a0b\u5f0f\u78bc', '\u6578\u4f4d\u6191\u8b49', '\u5176\u4ed6'] },
      SW: { label: '\u8edf\u9ad4', subs: ['\u4f5c\u696d\u7cfb\u7d71', '\u61c9\u7528\u7cfb\u7d71\u7a0b\u5f0f', '\u5957\u88dd\u8edf\u9ad4', '\u5176\u4ed6'] },
      HW: { label: '\u786c\u9ad4\u8a2d\u5099', subs: ['\u500b\u4eba\u96fb\u8166', '\u53ef\u651c\u5f0f\u8a2d\u5099', '\u4f3a\u670d\u5668', '\u5132\u5b58\u7cfb\u7d71', '\u901a\u8a0a\u8a2d\u5099', '\u74b0\u5883\u57fa\u790e\u8a2d\u65bd', '\u7db2\u8def\u5370\u8868\u6a5f/\u591a\u529f\u80fd\u4e8b\u52d9\u6a5f', '\u5176\u4ed6'] },
      VM: { label: '\u865b\u64ec\u4e3b\u6a5f', subs: ['\u865b\u64ec\u4e3b\u6a5f'] },
      BS: { label: '\u696d\u52d9', subs: ['\u7cfb\u7d71\u7dad\u904b', '\u670d\u52d9', '\u5176\u4ed6'] }
    };

    const CIA_OPTIONS = ['\u666e', '\u4e2d', '\u9ad8'];
    const STATUS_OPTIONS = ['\u586b\u5831\u4e2d', '\u5f85\u7c3d\u6838', '\u5df2\u5b8c\u6210'];
    const CHANGE_TYPE_OPTIONS = ['\u65b0\u589e', '\u4fee\u6539', '\u522a\u9664', '\u7121\u7570\u52d5'];
    const RISK_LEVELS = { '\u4f4e': '1-2', '\u4e2d': '3-4', '\u9ad8': '6-9' };

    const CIA_VALUE_MAP = { '\u666e': 1, '\u4e2d': 2, '\u9ad8': 3 };

    // -------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------
    function scheduleRefreshIcons() {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(refreshIcons);
        return;
      }
      refreshIcons();
    }

    async function apiCall(method, path, body) {
      const endpoint = (CONFIG && CONFIG.assetInventoryEndpoint) || '/api/assets';
      const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify({ payload: body });
      const res = await fetch(endpoint + path, opts);
      if (!res.ok) {
        const text = await res.text().catch(function () { return res.statusText; });
        throw new Error(text || ('\u8acb\u6c42\u5931\u6557 (' + res.status + ')'));
      }
      return res.json();
    }

    function getCurrentRocYear() {
      return new Date().getFullYear() - 1911;
    }

    function computeProtectionLevel(c, i, a) {
      var cv = CIA_VALUE_MAP[c] || 0;
      var iv = CIA_VALUE_MAP[i] || 0;
      var av = CIA_VALUE_MAP[a] || 0;
      var max = Math.max(cv, iv, av);
      if (max >= 3) return '\u9ad8';
      if (max >= 2) return '\u4e2d';
      if (max >= 1) return '\u666e';
      return '';
    }

    function computeRiskScore(likelihood, impact) {
      var l = parseInt(likelihood, 10) || 0;
      var imp = parseInt(impact, 10) || 0;
      return l * imp;
    }

    function getRiskLevel(score) {
      if (score >= 6) return '\u9ad8';
      if (score >= 3) return '\u4e2d';
      if (score >= 1) return '\u4f4e';
      return '';
    }

    function getRiskBadgeClass(level) {
      if (level === '\u9ad8') return 'badge-danger';
      if (level === '\u4e2d') return 'badge-warning';
      if (level === '\u4f4e') return 'badge-success';
      return 'badge-secondary';
    }

    function getStatusBadgeClass(status) {
      if (status === '\u5df2\u5b8c\u6210') return 'badge-success';
      if (status === '\u5f85\u7c3d\u6838') return 'badge-warning';
      if (status === '\u586b\u5831\u4e2d') return 'badge-info';
      return 'badge-secondary';
    }

    function getCategoryLabel(code) {
      var cat = CATEGORIES[code];
      return cat ? cat.label : code || '';
    }

    function getSubCategories(code) {
      var cat = CATEGORIES[code];
      return cat ? cat.subs : [];
    }

    function buildSelectOptions(options, selected, includeEmpty) {
      var html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      for (var i = 0; i < options.length; i++) {
        var val = options[i];
        html += '<option value="' + esc(val) + '"' + (val === selected ? ' selected' : '') + '>' + esc(val) + '</option>';
      }
      return html;
    }

    function buildCategorySelectOptions(selected, includeEmpty) {
      var html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      var keys = Object.keys(CATEGORIES);
      for (var i = 0; i < keys.length; i++) {
        var code = keys[i];
        var label = CATEGORIES[code].label;
        html += '<option value="' + esc(code) + '"' + (code === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
      }
      return html;
    }

    function buildSubCategorySelectOptions(categoryCode, selected, includeEmpty) {
      var subs = getSubCategories(categoryCode);
      var html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      for (var i = 0; i < subs.length; i++) {
        html += '<option value="' + esc(subs[i]) + '"' + (subs[i] === selected ? ' selected' : '') + '>' + esc(subs[i]) + '</option>';
      }
      return html;
    }

    function buildYearOptions(selected) {
      var current = getCurrentRocYear();
      var html = '';
      for (var y = current; y >= current - 5; y--) {
        html += '<option value="' + y + '"' + (String(y) === String(selected) ? ' selected' : '') + '>' + y + '</option>';
      }
      return html;
    }

    function buildCollapsibleSection(id, title, contentHtml, options) {
      var opts = options || {};
      var open = opts.open !== false;
      var borderColor = opts.borderColor || '';
      var borderStyle = borderColor ? ' style="border-left: 4px solid ' + borderColor + ';"' : '';
      var condDisplay = opts.hidden ? ' style="display:none;"' : '';
      var sectionId = 'asset-section-' + id;
      return '<div class="card asset-form-section" id="' + sectionId + '"' + condDisplay + borderStyle + '>'
        + '<div class="card-header asset-section-header" data-toggle-section="' + id + '" style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;">'
        + '<span>' + esc(title) + '</span>'
        + '<span class="section-toggle-icon">' + ic(open ? 'chevron-up' : 'chevron-down') + '</span>'
        + '</div>'
        + '<div class="card-body asset-section-body" id="asset-section-body-' + id + '"' + (open ? '' : ' style="display:none;"') + '>'
        + contentHtml
        + '</div>'
        + '</div>';
    }

    function buildFormGroup(labelText, inputHtml, options) {
      var opts = options || {};
      var groupClass = 'form-group' + (opts.className ? ' ' + opts.className : '');
      var hint = opts.hint ? '<small class="form-hint">' + esc(opts.hint) + '</small>' : '';
      return '<div class="' + groupClass + '">'
        + '<label class="form-label">' + esc(labelText) + '</label>'
        + inputHtml
        + hint
        + '</div>';
    }

    function buildTextInput(name, value, options) {
      var opts = options || {};
      var readonly = opts.readonly ? ' readonly' : '';
      var placeholder = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
      var extra = opts.id ? ' id="' + opts.id + '"' : '';
      return '<input type="text" class="form-control" name="' + esc(name) + '" value="' + esc(value || '') + '"' + readonly + placeholder + extra + '>';
    }

    function buildTextarea(name, value, options) {
      var opts = options || {};
      var rows = opts.rows || 3;
      var readonly = opts.readonly ? ' readonly' : '';
      return '<textarea class="form-control" name="' + esc(name) + '" rows="' + rows + '"' + readonly + '>' + esc(value || '') + '</textarea>';
    }

    function buildSelect(name, optionsHtml, options) {
      var opts = options || {};
      var disabled = opts.disabled ? ' disabled' : '';
      var extra = opts.id ? ' id="' + opts.id + '"' : '';
      return '<select class="form-control" name="' + esc(name) + '"' + disabled + extra + '>' + optionsHtml + '</select>';
    }

    function buildCheckbox(name, label, checked) {
      return '<label class="form-check-label" style="display:flex;align-items:center;gap:6px;cursor:pointer;">'
        + '<input type="checkbox" class="form-check-input" name="' + esc(name) + '"' + (checked ? ' checked' : '') + '>'
        + '<span>' + esc(label) + '</span>'
        + '</label>';
    }

    function readFormValues(container) {
      var result = {};
      var inputs = container.querySelectorAll('input, select, textarea');
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        var name = el.getAttribute('name');
        if (!name) continue;
        if (el.type === 'checkbox') {
          result[name] = el.checked;
        } else {
          result[name] = el.value;
        }
      }
      return result;
    }

    // -------------------------------------------------------
    // Browse state
    // -------------------------------------------------------
    var browseState = {
      year: String(getCurrentRocYear()),
      category: '',
      status: '',
      keyword: ''
    };

    // -------------------------------------------------------
    // renderAssetList
    // -------------------------------------------------------
    async function renderAssetList() {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic('database') + ' \u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;flex-wrap:wrap;">'
        + '<button class="btn btn-primary" data-action="createAsset">' + ic('plus') + ' \u65b0\u589e</button>'
        + '<button class="btn btn-outline" data-action="exportAssets">' + ic('download') + ' \u532f\u51fa</button>'
        + '<button class="btn btn-outline" data-action="submitAllAssets">' + ic('send') + ' \u5168\u90e8\u9001\u7c3d\u6838</button>'
        + '</div>'
        + '</div>'

        // Filter bar
        + '<div class="filter-bar" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">'
        + '<div class="form-group" style="margin-bottom:0;">'
        + '<label class="form-label" style="font-size:0.85em;margin-bottom:2px;">\u5e74\u5ea6</label>'
        + '<select class="form-control" id="asset-filter-year" style="min-width:90px;">' + buildYearOptions(browseState.year) + '</select>'
        + '</div>'
        + '<div class="form-group" style="margin-bottom:0;">'
        + '<label class="form-label" style="font-size:0.85em;margin-bottom:2px;">\u5206\u985e</label>'
        + '<select class="form-control" id="asset-filter-category" style="min-width:120px;">'
        + '<option value="">\u5168\u90e8</option>'
        + buildCategorySelectOptions(browseState.category, false)
        + '</select>'
        + '</div>'
        + '<div class="form-group" style="margin-bottom:0;">'
        + '<label class="form-label" style="font-size:0.85em;margin-bottom:2px;">\u72c0\u614b</label>'
        + '<select class="form-control" id="asset-filter-status" style="min-width:100px;">'
        + '<option value="">\u5168\u90e8</option>'
        + buildSelectOptions(STATUS_OPTIONS, browseState.status, false)
        + '</select>'
        + '</div>'
        + '<div class="form-group" style="margin-bottom:0;">'
        + '<label class="form-label" style="font-size:0.85em;margin-bottom:2px;">\u641c\u5c0b</label>'
        + '<input type="text" class="form-control" id="asset-filter-keyword" placeholder="\u8cc7\u7522\u540d\u7a31\u3001\u64c1\u6709\u8005..." value="' + esc(browseState.keyword) + '" style="min-width:160px;">'
        + '</div>'
        + '<div style="display:flex;align-items:flex-end;">'
        + '<button class="btn btn-outline btn-sm" data-action="filterAssets" style="margin-top:auto;">' + ic('search') + ' \u67e5\u8a62</button>'
        + '</div>'
        + '</div>'

        // Table
        + '<div id="asset-list-table-wrapper" style="overflow-x:auto;">'
        + '<div class="empty-state" style="padding:40px 0;text-align:center;">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div>'
        + '</div>'
        + '</div>';

      scheduleRefreshIcons();

      // Set up event handlers
      registerActionHandlers('app', {
        createAsset: function () {
          navigate('asset-create');
        },
        exportAssets: function () {
          toast('\u532f\u51fa\u529f\u80fd\u958b\u767c\u4e2d', 'info');
        },
        submitAllAssets: async function () {
          var confirmed = typeof openConfirmDialog === 'function'
            ? await openConfirmDialog('\u5c07\u6240\u6709\u300c\u586b\u5831\u4e2d\u300d\u8cc7\u7522\u9001\u51fa\u7c3d\u6838\uff0c\u78ba\u5b9a\u7e7c\u7e8c\uff1f', { title: '\u5168\u90e8\u9001\u7c3d\u6838', confirmLabel: '\u78ba\u5b9a\u9001\u51fa' })
            : window.confirm('\u78ba\u5b9a\u5c07\u6240\u6709\u586b\u5831\u4e2d\u8cc7\u7522\u9001\u7c3d\u6838\uff1f');
          if (!confirmed) return;
          toast('\u6279\u6b21\u9001\u7c3d\u6838\u529f\u80fd\u958b\u767c\u4e2d', 'info');
        },
        filterAssets: function () {
          applyFiltersAndReload();
        },
        editAsset: function (ctx) {
          var id = ctx.dataset && ctx.dataset.id;
          if (id) navigate('asset-edit', id);
        },
        viewAsset: function (ctx) {
          var id = ctx.dataset && ctx.dataset.id;
          if (id) navigate('asset-detail', id);
        },
        deleteAsset: async function (ctx) {
          var id = ctx.dataset && ctx.dataset.id;
          if (!id) return;
          var confirmed = typeof openConfirmDialog === 'function'
            ? await openConfirmDialog('\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u8cc7\u7522\u55ce\uff1f\u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\u3002', { title: '\u522a\u9664\u8cc7\u7522', confirmLabel: '\u78ba\u8a8d\u522a\u9664', confirmClass: 'btn-danger' })
            : window.confirm('\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u8cc7\u7522\u55ce\uff1f');
          if (!confirmed) return;
          try {
            await runWithBusyState(async function () {
              await apiCall('POST', '/' + id + '/delete');
            });
            toast('\u5df2\u6210\u529f\u522a\u9664\u8cc7\u7522');
            applyFiltersAndReload();
          } catch (err) {
            toast('\u522a\u9664\u5931\u6557\uff1a' + String(err && err.message || err), 'error');
          }
        }
      });

      // Event listeners for filters
      var yearEl = document.getElementById('asset-filter-year');
      var categoryEl = document.getElementById('asset-filter-category');
      var statusEl = document.getElementById('asset-filter-status');
      var keywordEl = document.getElementById('asset-filter-keyword');

      if (yearEl) addPageEventListener(yearEl, 'change', function () { browseState.year = yearEl.value; });
      if (categoryEl) addPageEventListener(categoryEl, 'change', function () { browseState.category = categoryEl.value; });
      if (statusEl) addPageEventListener(statusEl, 'change', function () { browseState.status = statusEl.value; });
      if (keywordEl) addPageEventListener(keywordEl, 'input', function () { browseState.keyword = keywordEl.value; });

      // Load data
      await loadAssetListData();
    }

    function applyFiltersAndReload() {
      var yearEl = document.getElementById('asset-filter-year');
      var categoryEl = document.getElementById('asset-filter-category');
      var statusEl = document.getElementById('asset-filter-status');
      var keywordEl = document.getElementById('asset-filter-keyword');

      if (yearEl) browseState.year = yearEl.value;
      if (categoryEl) browseState.category = categoryEl.value;
      if (statusEl) browseState.status = statusEl.value;
      if (keywordEl) browseState.keyword = keywordEl.value;

      loadAssetListData();
    }

    async function loadAssetListData() {
      var wrapper = document.getElementById('asset-list-table-wrapper');
      if (!wrapper) return;

      try {
        var queryParts = [];
        if (browseState.year) queryParts.push('year=' + encodeURIComponent(browseState.year));
        if (browseState.category) queryParts.push('category=' + encodeURIComponent(browseState.category));
        if (browseState.status) queryParts.push('status=' + encodeURIComponent(browseState.status));
        var queryString = queryParts.length ? '?' + queryParts.join('&') : '';

        var data = await apiCall('GET', queryString);
        var items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);

        // Client-side keyword filter
        var keyword = (browseState.keyword || '').trim().toLowerCase();
        if (keyword) {
          items = items.filter(function (item) {
            var haystack = [
              item.assetId || '',
              item.assetName || '',
              item.ownerName || '',
              item.category || '',
              getCategoryLabel(item.category)
            ].join(' ').toLowerCase();
            return haystack.indexOf(keyword) !== -1;
          });
        }

        if (!items.length) {
          wrapper.innerHTML = '<div class="empty-state" style="padding:40px 0;text-align:center;">'
            + ic('inbox') + '<p>\u7121\u7b26\u5408\u689d\u4ef6\u7684\u8cc7\u7522\u8cc7\u6599</p>'
            + '</div>';
          scheduleRefreshIcons();
          return;
        }

        var rowsHtml = '';
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var riskScore = computeRiskScore(item.riskLikelihood, item.riskImpact);
          var riskLevel = item.riskLevel || getRiskLevel(riskScore);
          var protLevel = item.protectionLevel || computeProtectionLevel(item.ciaC, item.ciaI, item.ciaA);

          rowsHtml += '<tr>'
            + '<td>' + esc(item.assetId || '') + '</td>'
            + '<td>' + esc(item.assetName || '') + '</td>'
            + '<td>' + esc(getCategoryLabel(item.category)) + '</td>'
            + '<td>' + esc(item.ownerName || '') + '</td>'
            + '<td>' + esc(protLevel) + '</td>'
            + '<td><span class="badge ' + getRiskBadgeClass(riskLevel) + '"><span class="badge-dot"></span>' + esc(riskLevel || '\u2014') + '</span></td>'
            + '<td><span class="badge ' + getStatusBadgeClass(item.status) + '"><span class="badge-dot"></span>' + esc(item.status || '') + '</span></td>'
            + '<td class="action-cell" style="white-space:nowrap;">'
            + '<button class="btn btn-sm btn-outline" data-action="editAsset" data-id="' + esc(item.id || '') + '" title="\u7de8\u8f2f">' + ic('edit') + '</button> '
            + '<button class="btn btn-sm btn-outline" data-action="viewAsset" data-id="' + esc(item.id || '') + '" title="\u6aa2\u8996">' + ic('eye') + '</button> '
            + '<button class="btn btn-sm btn-danger" data-action="deleteAsset" data-id="' + esc(item.id || '') + '" title="\u522a\u9664">' + ic('trash-2') + '</button>'
            + '</td>'
            + '</tr>';
        }

        wrapper.innerHTML = '<div class="table-wrapper" tabindex="0">'
          + '<table>'
          + '<caption class="sr-only">\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a</caption>'
          + '<thead><tr>'
          + '<th scope="col">\u8cc7\u7522\u7de8\u865f</th>'
          + '<th scope="col">\u8cc7\u7522\u540d\u7a31</th>'
          + '<th scope="col">\u5206\u985e</th>'
          + '<th scope="col">\u64c1\u6709\u8005</th>'
          + '<th scope="col">\u9632\u8b77\u7b49\u7d1a</th>'
          + '<th scope="col">\u98a8\u96aa\u7b49\u7d1a</th>'
          + '<th scope="col">\u72c0\u614b</th>'
          + '<th scope="col">\u64cd\u4f5c</th>'
          + '</tr></thead>'
          + '<tbody>' + rowsHtml + '</tbody>'
          + '</table>'
          + '</div>';

        scheduleRefreshIcons();
      } catch (err) {
        wrapper.innerHTML = '<div class="empty-state" style="padding:40px 0;text-align:center;color:#c0392b;">'
          + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
          + '</div>';
        scheduleRefreshIcons();
      }
    }

    // -------------------------------------------------------
    // renderAssetCreate / renderAssetEdit
    // -------------------------------------------------------
    function renderAssetCreate() {
      renderAssetForm(null);
    }

    function renderAssetEdit(assetId) {
      renderAssetForm(assetId);
    }

    async function renderAssetForm(assetId) {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      var isEdit = !!assetId;
      var title = isEdit ? '\u7de8\u8f2f\u8cc7\u8a0a\u8cc7\u7522' : '\u65b0\u589e\u8cc7\u8a0a\u8cc7\u7522';
      var asset = null;

      if (isEdit) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state" style="padding:40px 0;text-align:center;">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div></div>';
        scheduleRefreshIcons();
        try {
          var resp = await apiCall('GET', '/' + assetId);
          asset = resp && resp.item ? resp.item : resp;
        } catch (err) {
          appEl.innerHTML = '<div class="animate-in"><div class="empty-state" style="padding:40px 0;text-align:center;color:#c0392b;">'
            + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
            + '<button class="btn btn-outline" data-action="backToList">\u8fd4\u56de\u5217\u8868</button></div></div>';
          scheduleRefreshIcons();
          registerActionHandlers('app', { backToList: function () { navigate('asset-list'); } });
          return;
        }
      }

      var a = asset || {};
      var user = currentUser() || {};

      // Build form sections
      var basicHtml = buildFormGroup('\u8cc7\u7522\u7de8\u865f', buildTextInput('assetId', a.assetId || '', { placeholder: '\u7cfb\u7d71\u81ea\u52d5\u7522\u751f\u6216\u624b\u52d5\u8f38\u5165' }))
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u8cc7\u7522\u540d\u7a31', buildTextInput('assetName', a.assetName || '', { placeholder: '\u8acb\u8f38\u5165\u8cc7\u7522\u540d\u7a31' }))
        + buildFormGroup('\u82f1\u6587\u540d\u7a31', buildTextInput('assetNameEn', a.assetNameEn || '', { placeholder: '\u82f1\u6587\u540d\u7a31\uff08\u9078\u586b\uff09' }))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u4e3b\u5206\u985e', buildSelect('category', buildCategorySelectOptions(a.category || '', true), { id: 'asset-form-category' }))
        + buildFormGroup('\u5b50\u5206\u985e', buildSelect('subCategory', buildSubCategorySelectOptions(a.category || '', a.subCategory || '', true), { id: 'asset-form-subcategory' }))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u64c1\u6709\u8005', buildTextInput('ownerName', a.ownerName || user.displayName || ''))
        + buildFormGroup('\u4fdd\u7ba1\u55ae\u4f4d', buildTextInput('ownerUnit', a.ownerUnit || user.unit || ''))
        + '</div>'
        + buildFormGroup('\u8cc7\u7522\u8aaa\u660e', buildTextarea('description', a.description || '', { rows: 3 }));

      var locationHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5b58\u653e\u4f4d\u7f6e', buildTextInput('location', a.location || ''))
        + buildFormGroup('\u7db2\u8def\u4f4d\u5740 / IP', buildTextInput('networkAddress', a.networkAddress || ''))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5ee0\u724c', buildTextInput('brand', a.brand || ''))
        + buildFormGroup('\u578b\u865f', buildTextInput('model', a.model || ''))
        + buildFormGroup('\u5e8f\u865f', buildTextInput('serialNumber', a.serialNumber || ''))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u6570\u91cf', buildTextInput('quantity', a.quantity || '1'))
        + buildFormGroup('\u55ae\u4f4d', buildTextInput('quantityUnit', a.quantityUnit || '\u53f0'))
        + '</div>';

      var securityHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5b58\u53d6\u63a7\u5236\u65b9\u5f0f', buildTextInput('accessControl', a.accessControl || ''))
        + buildFormGroup('\u52a0\u5bc6\u65b9\u5f0f', buildTextInput('encryption', a.encryption || ''))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5099\u4efd\u65b9\u5f0f', buildTextInput('backupMethod', a.backupMethod || ''))
        + buildFormGroup('\u5099\u4efd\u983b\u7387', buildTextInput('backupFrequency', a.backupFrequency || ''))
        + '</div>';

      var currentProtLevel = computeProtectionLevel(a.ciaC || '', a.ciaI || '', a.ciaA || '');
      var ciaHtml = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
        + buildFormGroup('\u6a5f\u5bc6\u6027 (C)', buildSelect('ciaC', buildSelectOptions(CIA_OPTIONS, a.ciaC || '', true), { id: 'asset-form-ciaC' }))
        + buildFormGroup('\u5b8c\u6574\u6027 (I)', buildSelect('ciaI', buildSelectOptions(CIA_OPTIONS, a.ciaI || '', true), { id: 'asset-form-ciaI' }))
        + buildFormGroup('\u53ef\u7528\u6027 (A)', buildSelect('ciaA', buildSelectOptions(CIA_OPTIONS, a.ciaA || '', true), { id: 'asset-form-ciaA' }))
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u9632\u8b77\u9700\u6c42\u7b49\u7d1a\uff08\u81ea\u52d5\u8a08\u7b97\uff09</label>'
        + '<div id="asset-form-protection-level" class="form-control" style="background:#f5f5f5;font-weight:bold;">' + esc(currentProtLevel || '--') + '</div>'
        + '</div>';

      var piiHtml = '<div class="form-group">'
        + buildCheckbox('hasPii', '\u6b64\u8cc7\u7522\u5305\u542b\u500b\u4eba\u8cc7\u6599', !!a.hasPii)
        + '</div>'
        + '<div id="asset-pii-details"' + (a.hasPii ? '' : ' style="display:none;"') + '>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u500b\u8cc7\u985e\u5225', buildTextInput('piiCategory', a.piiCategory || ''))
        + buildFormGroup('\u500b\u8cc7\u7b46\u6578', buildTextInput('piiCount', a.piiCount || ''))
        + '</div>'
        + buildFormGroup('\u500b\u8cc7\u8aaa\u660e', buildTextarea('piiDescription', a.piiDescription || '', { rows: 2 }))
        + '</div>';

      var versionHtml = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
        + buildFormGroup('\u76e4\u9ede\u5e74\u5ea6', buildSelect('inventoryYear', buildYearOptions(a.inventoryYear || getCurrentRocYear())))
        + buildFormGroup('\u7570\u52d5\u985e\u578b', buildSelect('changeType', buildSelectOptions(CHANGE_TYPE_OPTIONS, a.changeType || '', true)))
        + buildFormGroup('\u72c0\u614b', buildSelect('status', buildSelectOptions(STATUS_OPTIONS, a.status || '\u586b\u5831\u4e2d', true)))
        + '</div>'
        + buildFormGroup('\u7570\u52d5\u8aaa\u660e', buildTextarea('changeDescription', a.changeDescription || '', { rows: 2 }));

      var itSystemHtml = '<div class="form-group">'
        + buildCheckbox('isItSystem', '\u6b64\u8cc7\u7522\u5c6c\u65bc\u8cc7\u901a\u5b89\u5168\u7cfb\u7d71', !!a.isItSystem)
        + '</div>'
        + '<div id="asset-it-system-details"' + (a.isItSystem ? '' : ' style="display:none;"') + '>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u7cfb\u7d71\u7d1a\u5225', buildSelect('systemLevel', buildSelectOptions(['\u666e', '\u4e2d', '\u9ad8'], a.systemLevel || '', true)))
        + buildFormGroup('\u7cfb\u7d71\u7c7b\u578b', buildTextInput('systemType', a.systemType || ''))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u7cfb\u7d71\u7dad\u904b\u5ee0\u5546', buildTextInput('systemVendor', a.systemVendor || ''))
        + buildFormGroup('\u670d\u52d9\u5951\u7d04\u5230\u671f\u65e5', buildTextInput('contractExpiry', a.contractExpiry || '', { placeholder: 'YYYY-MM-DD' }))
        + '</div>'
        + buildFormGroup('\u7cfb\u7d71\u529f\u80fd\u8aaa\u660e', buildTextarea('systemDescription', a.systemDescription || '', { rows: 2 }))
        + '</div>';

      var itProtectionHtml = '<div id="asset-it-protection-section"' + (a.isItSystem ? '' : ' style="display:none;"') + '>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5b58\u53d6\u63a7\u5236\u63aa\u65bd', buildTextarea('itAccessControl', a.itAccessControl || '', { rows: 2 }))
        + buildFormGroup('\u65e5\u8a8c\u7ba1\u7406\u63aa\u65bd', buildTextarea('itLogManagement', a.itLogManagement || '', { rows: 2 }))
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u60e1\u610f\u7a0b\u5f0f\u9632\u8b77', buildTextarea('itMalwareProtection', a.itMalwareProtection || '', { rows: 2 }))
        + buildFormGroup('\u5f31\u9ede\u6aa2\u6e2c\u63aa\u65bd', buildTextarea('itVulnerabilityMgmt', a.itVulnerabilityMgmt || '', { rows: 2 }))
        + '</div>'
        + buildFormGroup('\u5176\u4ed6\u9632\u8b77\u63aa\u65bd', buildTextarea('itOtherProtection', a.itOtherProtection || '', { rows: 2 }))
        + '</div>';

      var chinaBrandHtml = '<div class="form-group">'
        + buildCheckbox('isChinaBrand', '\u6b64\u8cc7\u7522\u5c6c\u65bc\u5927\u9678\u5ee0\u724c\u7522\u54c1', !!a.isChinaBrand)
        + '</div>'
        + '<div id="asset-china-brand-details"' + (a.isChinaBrand ? '' : ' style="display:none;"') + '>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + buildFormGroup('\u5ee0\u724c\u540d\u7a31', buildTextInput('chinaBrandName', a.chinaBrandName || ''))
        + buildFormGroup('\u7522\u54c1\u578b\u865f', buildTextInput('chinaBrandModel', a.chinaBrandModel || ''))
        + '</div>'
        + buildFormGroup('\u66ff\u4ee3\u65b9\u6848\u8aaa\u660e', buildTextarea('chinaReplacementPlan', a.chinaReplacementPlan || '', { rows: 2 }))
        + buildFormGroup('\u9810\u8a08\u6c70\u63db\u65e5\u671f', buildTextInput('chinaReplacementDate', a.chinaReplacementDate || '', { placeholder: 'YYYY-MM-DD' }))
        + '</div>';

      var riskScore = computeRiskScore(a.riskLikelihood, a.riskImpact);
      var riskLevel = getRiskLevel(riskScore);
      var riskHtml = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
        + buildFormGroup('\u53ef\u80fd\u6027 (1-3)', buildSelect('riskLikelihood', '<option value="">-- \u8acb\u9078\u64c7 --</option><option value="1"' + (String(a.riskLikelihood) === '1' ? ' selected' : '') + '>1 - \u4f4e</option><option value="2"' + (String(a.riskLikelihood) === '2' ? ' selected' : '') + '>2 - \u4e2d</option><option value="3"' + (String(a.riskLikelihood) === '3' ? ' selected' : '') + '>3 - \u9ad8</option>', { id: 'asset-form-riskLikelihood' }))
        + buildFormGroup('\u885d\u64ca\u6027 (1-3)', buildSelect('riskImpact', '<option value="">-- \u8acb\u9078\u64c7 --</option><option value="1"' + (String(a.riskImpact) === '1' ? ' selected' : '') + '>1 - \u4f4e</option><option value="2"' + (String(a.riskImpact) === '2' ? ' selected' : '') + '>2 - \u4e2d</option><option value="3"' + (String(a.riskImpact) === '3' ? ' selected' : '') + '>3 - \u9ad8</option>', { id: 'asset-form-riskImpact' }))
        + '<div class="form-group">'
        + '<label class="form-label">\u98a8\u96aa\u5206\u6578</label>'
        + '<div id="asset-form-risk-score" class="form-control" style="background:#f5f5f5;font-weight:bold;">' + (riskScore ? riskScore : '--') + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u98a8\u96aa\u7b49\u7d1a\uff08\u81ea\u52d5\u8a08\u7b97\uff09</label>'
        + '<div id="asset-form-risk-level" style="font-weight:bold;padding:6px 0;">'
        + (riskLevel ? '<span class="badge ' + getRiskBadgeClass(riskLevel) + '"><span class="badge-dot"></span>' + esc(riskLevel) + ' (' + RISK_LEVELS[riskLevel] + ')</span>' : '--')
        + '</div>'
        + '</div>'
        + buildFormGroup('\u98a8\u96aa\u8655\u7406\u65b9\u5f0f', buildSelect('riskTreatment', buildSelectOptions(['\u964d\u4f4e', '\u79fb\u8f49', '\u63a5\u53d7', '\u8ff4\u907f'], a.riskTreatment || '', true)))
        + buildFormGroup('\u6b98\u9918\u98a8\u96aa\u8aaa\u660e', buildTextarea('residualRiskNote', a.residualRiskNote || '', { rows: 2 }));

      // Assemble full form
      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic(isEdit ? 'edit' : 'plus-circle') + ' ' + esc(title) + '</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;">'
        + '<button class="btn btn-outline" data-action="backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + '<form id="asset-form" autocomplete="off">'
        + buildCollapsibleSection('basic', '1. \u57fa\u672c\u8cc7\u6599', basicHtml, { open: true })
        + buildCollapsibleSection('location', '2. \u4f4d\u7f6e\u8207\u898f\u683c', locationHtml, { open: false })
        + buildCollapsibleSection('security', '3. \u5b89\u5168\u8a2d\u5b9a', securityHtml, { open: false })
        + buildCollapsibleSection('cia', '4. CIA \u9632\u8b77\u9700\u6c42\u5206\u7d1a', ciaHtml, { open: true })
        + buildCollapsibleSection('pii', '5. \u500b\u8cc7\u76f8\u95dc', piiHtml, { open: true })
        + buildCollapsibleSection('version', '6. \u5e74\u5ea6\u7248\u672c\u7ba1\u7406', versionHtml, { open: true })
        + buildCollapsibleSection('itSystem', '7. \u8cc7\u901a\u7cfb\u7d71\u5c08\u5c6c', itSystemHtml, { open: true, borderColor: '#3498db' })
        + buildCollapsibleSection('itProtection', '8. \u9632\u8b77\u7b49\u7d1a\u8a55\u4f30', itProtectionHtml, { open: false, borderColor: '#3498db', hidden: !a.isItSystem })
        + buildCollapsibleSection('chinaBrand', '9. \u5927\u9678\u5ee0\u724c', chinaBrandHtml, { open: true, borderColor: '#e67e22' })
        + buildCollapsibleSection('risk', '10. \u98a8\u96aa\u8a55\u9451', riskHtml, { open: true, borderColor: '#27ae60' })

        + '<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px;padding-bottom:40px;">'
        + '<button type="button" class="btn btn-outline" data-action="backToList">\u53d6\u6d88</button>'
        + '<button type="button" class="btn btn-primary" data-action="saveAsset">' + ic('save') + ' \u5132\u5b58</button>'
        + '</div>'
        + '</form>'
        + '</div>';

      scheduleRefreshIcons();

      // Register action handlers
      registerActionHandlers('app', {
        backToList: function () {
          navigate('asset-list');
        },
        saveAsset: async function () {
          var form = document.getElementById('asset-form');
          if (!form) return;
          var values = readFormValues(form);

          if (!values.assetName) {
            toast('\u8acb\u8f38\u5165\u8cc7\u7522\u540d\u7a31', 'error');
            return;
          }
          if (!values.category) {
            toast('\u8acb\u9078\u64c7\u4e3b\u5206\u985e', 'error');
            return;
          }

          try {
            await runWithBusyState(async function () {
              if (isEdit) {
                await apiCall('POST', '/' + assetId, values);
              } else {
                await apiCall('POST', '', values);
              }
            });
            toast(isEdit ? '\u8cc7\u7522\u5df2\u66f4\u65b0' : '\u8cc7\u7522\u5df2\u65b0\u589e', 'success');
            navigate('asset-list');
          } catch (err) {
            toast('\u5132\u5b58\u5931\u6557\uff1a' + String(err && err.message || err), 'error');
          }
        }
      });

      // Bind dynamic behaviors
      bindFormDynamicBehaviors(a);
    }

    function bindFormDynamicBehaviors(asset) {
      // Section toggle (collapse/expand)
      var appEl = document.getElementById('app');
      if (!appEl) return;

      addPageEventListener(appEl, 'click', function (e) {
        var header = e.target.closest && e.target.closest('[data-toggle-section]');
        if (!header) return;
        var sectionId = header.getAttribute('data-toggle-section');
        var bodyEl = document.getElementById('asset-section-body-' + sectionId);
        if (!bodyEl) return;
        var isVisible = bodyEl.style.display !== 'none';
        bodyEl.style.display = isVisible ? 'none' : '';
        var iconSpan = header.querySelector('.section-toggle-icon');
        if (iconSpan) {
          iconSpan.innerHTML = ic(isVisible ? 'chevron-down' : 'chevron-up');
          scheduleRefreshIcons();
        }
      });

      // Category -> SubCategory cascade
      var categoryEl = document.getElementById('asset-form-category');
      var subCategoryEl = document.getElementById('asset-form-subcategory');
      if (categoryEl && subCategoryEl) {
        addPageEventListener(categoryEl, 'change', function () {
          subCategoryEl.innerHTML = buildSubCategorySelectOptions(categoryEl.value, '', true);
        });
      }

      // CIA -> Protection level auto-compute
      var ciaCEl = document.getElementById('asset-form-ciaC');
      var ciaIEl = document.getElementById('asset-form-ciaI');
      var ciaAEl = document.getElementById('asset-form-ciaA');
      var protLevelEl = document.getElementById('asset-form-protection-level');

      function updateProtectionLevel() {
        if (!ciaCEl || !ciaIEl || !ciaAEl || !protLevelEl) return;
        var level = computeProtectionLevel(ciaCEl.value, ciaIEl.value, ciaAEl.value);
        protLevelEl.textContent = level || '--';
      }

      if (ciaCEl) addPageEventListener(ciaCEl, 'change', updateProtectionLevel);
      if (ciaIEl) addPageEventListener(ciaIEl, 'change', updateProtectionLevel);
      if (ciaAEl) addPageEventListener(ciaAEl, 'change', updateProtectionLevel);

      // hasPii toggle
      var hasPiiCheckbox = appEl.querySelector('input[name="hasPii"]');
      var piiDetailsEl = document.getElementById('asset-pii-details');
      if (hasPiiCheckbox && piiDetailsEl) {
        addPageEventListener(hasPiiCheckbox, 'change', function () {
          piiDetailsEl.style.display = hasPiiCheckbox.checked ? '' : 'none';
        });
      }

      // isItSystem toggle
      var isItSystemCheckbox = appEl.querySelector('input[name="isItSystem"]');
      var itSystemDetailsEl = document.getElementById('asset-it-system-details');
      var itProtectionSectionEl = document.getElementById('asset-section-itProtection');
      var itProtectionBodyEl = document.getElementById('asset-it-protection-section');
      if (isItSystemCheckbox) {
        addPageEventListener(isItSystemCheckbox, 'change', function () {
          var show = isItSystemCheckbox.checked;
          if (itSystemDetailsEl) itSystemDetailsEl.style.display = show ? '' : 'none';
          if (itProtectionSectionEl) itProtectionSectionEl.style.display = show ? '' : 'none';
          if (itProtectionBodyEl) itProtectionBodyEl.style.display = show ? '' : 'none';
        });
      }

      // isChinaBrand toggle
      var isChinaBrandCheckbox = appEl.querySelector('input[name="isChinaBrand"]');
      var chinaBrandDetailsEl = document.getElementById('asset-china-brand-details');
      if (isChinaBrandCheckbox && chinaBrandDetailsEl) {
        addPageEventListener(isChinaBrandCheckbox, 'change', function () {
          chinaBrandDetailsEl.style.display = isChinaBrandCheckbox.checked ? '' : 'none';
        });
      }

      // Risk score auto-compute
      var riskLikelihoodEl = document.getElementById('asset-form-riskLikelihood');
      var riskImpactEl = document.getElementById('asset-form-riskImpact');
      var riskScoreEl = document.getElementById('asset-form-risk-score');
      var riskLevelEl = document.getElementById('asset-form-risk-level');

      function updateRiskScore() {
        if (!riskLikelihoodEl || !riskImpactEl || !riskScoreEl || !riskLevelEl) return;
        var score = computeRiskScore(riskLikelihoodEl.value, riskImpactEl.value);
        riskScoreEl.textContent = score ? String(score) : '--';
        var level = getRiskLevel(score);
        if (level) {
          riskLevelEl.innerHTML = '<span class="badge ' + getRiskBadgeClass(level) + '"><span class="badge-dot"></span>' + esc(level) + ' (' + (RISK_LEVELS[level] || '') + ')</span>';
        } else {
          riskLevelEl.textContent = '--';
        }
        scheduleRefreshIcons();
      }

      if (riskLikelihoodEl) addPageEventListener(riskLikelihoodEl, 'change', updateRiskScore);
      if (riskImpactEl) addPageEventListener(riskImpactEl, 'change', updateRiskScore);
    }

    // -------------------------------------------------------
    // renderAssetDetail
    // -------------------------------------------------------
    async function renderAssetDetail(assetId) {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in"><div class="empty-state" style="padding:40px 0;text-align:center;">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div></div>';
      scheduleRefreshIcons();

      var asset;
      try {
        var resp = await apiCall('GET', '/' + assetId);
        asset = resp && resp.item ? resp.item : resp;
      } catch (err) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state" style="padding:40px 0;text-align:center;color:#c0392b;">'
          + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
          + '<button class="btn btn-outline" data-action="backToList">\u8fd4\u56de\u5217\u8868</button></div></div>';
        scheduleRefreshIcons();
        registerActionHandlers('app', { backToList: function () { navigate('asset-list'); } });
        return;
      }

      var a = asset || {};
      var riskScore = computeRiskScore(a.riskLikelihood, a.riskImpact);
      var riskLevel = a.riskLevel || getRiskLevel(riskScore);
      var protLevel = a.protectionLevel || computeProtectionLevel(a.ciaC, a.ciaI, a.ciaA);

      function detailRow(label, value) {
        return '<tr><td style="font-weight:600;width:180px;vertical-align:top;padding:8px 12px;white-space:nowrap;">' + esc(label) + '</td>'
          + '<td style="padding:8px 12px;">' + esc(value || '\u2014') + '</td></tr>';
      }

      function detailBadgeRow(label, badgeHtml) {
        return '<tr><td style="font-weight:600;width:180px;vertical-align:top;padding:8px 12px;white-space:nowrap;">' + esc(label) + '</td>'
          + '<td style="padding:8px 12px;">' + badgeHtml + '</td></tr>';
      }

      var basicTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u8cc7\u7522\u7de8\u865f', a.assetId)
        + detailRow('\u8cc7\u7522\u540d\u7a31', a.assetName)
        + detailRow('\u82f1\u6587\u540d\u7a31', a.assetNameEn)
        + detailRow('\u4e3b\u5206\u985e', getCategoryLabel(a.category))
        + detailRow('\u5b50\u5206\u985e', a.subCategory)
        + detailRow('\u64c1\u6709\u8005', a.ownerName)
        + detailRow('\u4fdd\u7ba1\u55ae\u4f4d', a.ownerUnit)
        + detailRow('\u8cc7\u7522\u8aaa\u660e', a.description)
        + '</table>';

      var locationTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u5b58\u653e\u4f4d\u7f6e', a.location)
        + detailRow('\u7db2\u8def\u4f4d\u5740 / IP', a.networkAddress)
        + detailRow('\u5ee0\u724c', a.brand)
        + detailRow('\u578b\u865f', a.model)
        + detailRow('\u5e8f\u865f', a.serialNumber)
        + detailRow('\u6570\u91cf', a.quantity)
        + detailRow('\u55ae\u4f4d', a.quantityUnit)
        + '</table>';

      var securityTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u5b58\u53d6\u63a7\u5236\u65b9\u5f0f', a.accessControl)
        + detailRow('\u52a0\u5bc6\u65b9\u5f0f', a.encryption)
        + detailRow('\u5099\u4efd\u65b9\u5f0f', a.backupMethod)
        + detailRow('\u5099\u4efd\u983b\u7387', a.backupFrequency)
        + '</table>';

      var ciaTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u6a5f\u5bc6\u6027 (C)', a.ciaC)
        + detailRow('\u5b8c\u6574\u6027 (I)', a.ciaI)
        + detailRow('\u53ef\u7528\u6027 (A)', a.ciaA)
        + detailBadgeRow('\u9632\u8b77\u9700\u6c42\u7b49\u7d1a', '<strong>' + esc(protLevel || '\u2014') + '</strong>')
        + '</table>';

      var piiTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u5305\u542b\u500b\u4eba\u8cc7\u6599', a.hasPii ? '\u662f' : '\u5426');
      if (a.hasPii) {
        piiTable += detailRow('\u500b\u8cc7\u985e\u5225', a.piiCategory)
          + detailRow('\u500b\u8cc7\u7b46\u6578', a.piiCount)
          + detailRow('\u500b\u8cc7\u8aaa\u660e', a.piiDescription);
      }
      piiTable += '</table>';

      var versionTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u76e4\u9ede\u5e74\u5ea6', a.inventoryYear)
        + detailRow('\u7570\u52d5\u985e\u578b', a.changeType)
        + detailBadgeRow('\u72c0\u614b', '<span class="badge ' + getStatusBadgeClass(a.status) + '"><span class="badge-dot"></span>' + esc(a.status || '') + '</span>')
        + detailRow('\u7570\u52d5\u8aaa\u660e', a.changeDescription)
        + '</table>';

      var itSystemTable = '';
      if (a.isItSystem) {
        itSystemTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
          + detailRow('\u8cc7\u901a\u5b89\u5168\u7cfb\u7d71', '\u662f')
          + detailRow('\u7cfb\u7d71\u7d1a\u5225', a.systemLevel)
          + detailRow('\u7cfb\u7d71\u7c7b\u578b', a.systemType)
          + detailRow('\u7cfb\u7d71\u7dad\u904b\u5ee0\u5546', a.systemVendor)
          + detailRow('\u670d\u52d9\u5951\u7d04\u5230\u671f\u65e5', a.contractExpiry)
          + detailRow('\u7cfb\u7d71\u529f\u80fd\u8aaa\u660e', a.systemDescription)
          + '</table>';
      }

      var itProtectionTable = '';
      if (a.isItSystem) {
        itProtectionTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
          + detailRow('\u5b58\u53d6\u63a7\u5236\u63aa\u65bd', a.itAccessControl)
          + detailRow('\u65e5\u8a8c\u7ba1\u7406\u63aa\u65bd', a.itLogManagement)
          + detailRow('\u60e1\u610f\u7a0b\u5f0f\u9632\u8b77', a.itMalwareProtection)
          + detailRow('\u5f31\u9ede\u6aa2\u6e2c\u63aa\u65bd', a.itVulnerabilityMgmt)
          + detailRow('\u5176\u4ed6\u9632\u8b77\u63aa\u65bd', a.itOtherProtection)
          + '</table>';
      }

      var chinaBrandTable = '';
      if (a.isChinaBrand) {
        chinaBrandTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
          + detailRow('\u5927\u9678\u5ee0\u724c\u7522\u54c1', '\u662f')
          + detailRow('\u5ee0\u724c\u540d\u7a31', a.chinaBrandName)
          + detailRow('\u7522\u54c1\u578b\u865f', a.chinaBrandModel)
          + detailRow('\u66ff\u4ee3\u65b9\u6848\u8aaa\u660e', a.chinaReplacementPlan)
          + detailRow('\u9810\u8a08\u6c70\u63db\u65e5\u671f', a.chinaReplacementDate)
          + '</table>';
      }

      var riskTable = '<table class="detail-table" style="width:100%;border-collapse:collapse;">'
        + detailRow('\u53ef\u80fd\u6027', a.riskLikelihood)
        + detailRow('\u885d\u64ca\u6027', a.riskImpact)
        + detailRow('\u98a8\u96aa\u5206\u6578', riskScore ? String(riskScore) : '\u2014')
        + detailBadgeRow('\u98a8\u96aa\u7b49\u7d1a', riskLevel ? '<span class="badge ' + getRiskBadgeClass(riskLevel) + '"><span class="badge-dot"></span>' + esc(riskLevel) + '</span>' : '\u2014')
        + detailRow('\u98a8\u96aa\u8655\u7406\u65b9\u5f0f', a.riskTreatment)
        + detailRow('\u6b98\u9918\u98a8\u96aa\u8aaa\u660e', a.residualRiskNote)
        + '</table>';

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic('file-text') + ' \u8cc7\u7522\u8a73\u60c5</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;">'
        + '<button class="btn btn-primary" data-action="editThisAsset">' + ic('edit') + ' \u7de8\u8f2f</button>'
        + '<button class="btn btn-outline" data-action="backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + buildCollapsibleSection('detail-basic', '1. \u57fa\u672c\u8cc7\u6599', basicTable, { open: true })
        + buildCollapsibleSection('detail-location', '2. \u4f4d\u7f6e\u8207\u898f\u683c', locationTable, { open: true })
        + buildCollapsibleSection('detail-security', '3. \u5b89\u5168\u8a2d\u5b9a', securityTable, { open: true })
        + buildCollapsibleSection('detail-cia', '4. CIA \u9632\u8b77\u9700\u6c42\u5206\u7d1a', ciaTable, { open: true })
        + buildCollapsibleSection('detail-pii', '5. \u500b\u8cc7\u76f8\u95dc', piiTable, { open: true })
        + buildCollapsibleSection('detail-version', '6. \u5e74\u5ea6\u7248\u672c\u7ba1\u7406', versionTable, { open: true })
        + (a.isItSystem ? buildCollapsibleSection('detail-itSystem', '7. \u8cc7\u901a\u7cfb\u7d71\u5c08\u5c6c', itSystemTable, { open: true, borderColor: '#3498db' }) : '')
        + (a.isItSystem ? buildCollapsibleSection('detail-itProtection', '8. \u9632\u8b77\u7b49\u7d1a\u8a55\u4f30', itProtectionTable, { open: true, borderColor: '#3498db' }) : '')
        + (a.isChinaBrand ? buildCollapsibleSection('detail-chinaBrand', '9. \u5927\u9678\u5ee0\u724c', chinaBrandTable, { open: true, borderColor: '#e67e22' }) : '')
        + buildCollapsibleSection('detail-risk', '10. \u98a8\u96aa\u8a55\u9451', riskTable, { open: true, borderColor: '#27ae60' })

        + '<div style="padding-bottom:40px;"></div>'
        + '</div>';

      scheduleRefreshIcons();

      registerActionHandlers('app', {
        editThisAsset: function () {
          navigate('asset-edit', assetId);
        },
        backToList: function () {
          navigate('asset-list');
        }
      });

      // Bind section toggle
      addPageEventListener(appEl, 'click', function (e) {
        var header = e.target.closest && e.target.closest('[data-toggle-section]');
        if (!header) return;
        var sectionId = header.getAttribute('data-toggle-section');
        var bodyEl = document.getElementById('asset-section-body-' + sectionId);
        if (!bodyEl) return;
        var isVisible = bodyEl.style.display !== 'none';
        bodyEl.style.display = isVisible ? 'none' : '';
        var iconSpan = header.querySelector('.section-toggle-icon');
        if (iconSpan) {
          iconSpan.innerHTML = ic(isVisible ? 'chevron-down' : 'chevron-up');
          scheduleRefreshIcons();
        }
      });
    }

    // -------------------------------------------------------
    // renderAppendix10 (stub)
    // -------------------------------------------------------
    function renderAppendix10(assetId) {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic('clipboard-list') + ' \u9644\u8868\u5341\u8a55\u4f30</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;">'
        + '<button class="btn btn-outline" data-action="backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'
        + '<div class="card" style="padding:40px;text-align:center;">'
        + '<div style="margin-bottom:16px;">' + ic('construction') + '</div>'
        + '<h3>\u9644\u8868\u5341\u8a55\u4f30 - \u958b\u767c\u4e2d</h3>'
        + '<p style="color:#666;">\u6b64\u529f\u80fd\u76ee\u524d\u6b63\u5728\u958b\u767c\u4e2d\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002</p>'
        + (assetId ? '<p style="color:#999;font-size:0.85em;">\u8cc7\u7522 ID\uff1a' + esc(assetId) + '</p>' : '')
        + '</div>'
        + '</div>';

      scheduleRefreshIcons();

      registerActionHandlers('app', {
        backToList: function () {
          navigate('asset-list');
        }
      });
    }

    // -------------------------------------------------------
    // renderRiskAssessment (stub)
    // -------------------------------------------------------
    function renderRiskAssessment(assetId) {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic('shield') + ' \u98a8\u96aa\u8a55\u9451</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;">'
        + '<button class="btn btn-outline" data-action="backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'
        + '<div class="card" style="padding:40px;text-align:center;">'
        + '<div style="margin-bottom:16px;">' + ic('construction') + '</div>'
        + '<h3>\u98a8\u96aa\u8a55\u9451 - \u958b\u767c\u4e2d</h3>'
        + '<p style="color:#666;">\u6b64\u529f\u80fd\u76ee\u524d\u6b63\u5728\u958b\u767c\u4e2d\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002</p>'
        + (assetId ? '<p style="color:#999;font-size:0.85em;">\u8cc7\u7522 ID\uff1a' + esc(assetId) + '</p>' : '')
        + '</div>'
        + '</div>';

      scheduleRefreshIcons();

      registerActionHandlers('app', {
        backToList: function () {
          navigate('asset-list');
        }
      });
    }

    // -------------------------------------------------------
    // renderAssetDashboard (admin only)
    // -------------------------------------------------------
    async function renderAssetDashboard() {
      var appEl = document.getElementById('app');
      if (!appEl) return;

      if (!isAdmin()) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state" style="padding:40px 0;text-align:center;color:#c0392b;">'
          + ic('lock') + '<p>\u60a8\u6c92\u6709\u6b0a\u9650\u6aa2\u8996\u6b64\u9801\u9762\u3002</p>'
          + '<button class="btn btn-outline" data-action="backToList">\u8fd4\u56de\u5217\u8868</button></div></div>';
        scheduleRefreshIcons();
        registerActionHandlers('app', { backToList: function () { navigate('asset-list'); } });
        return;
      }

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<h2>' + ic('bar-chart-2') + ' \u8cc7\u7522\u76e4\u9ede\u7e3d\u89bd\u5100\u8868\u677f</h2>'
        + '<div class="page-header-actions" style="display:flex;gap:8px;">'
        + '<button class="btn btn-outline" data-action="backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'
        + '<div id="asset-dashboard-content">'
        + '<div class="empty-state" style="padding:40px 0;text-align:center;">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div>'
        + '</div>'
        + '</div>';

      scheduleRefreshIcons();

      registerActionHandlers('app', {
        backToList: function () {
          navigate('asset-list');
        }
      });

      // Load summary data
      try {
        var data = await apiCall('GET', '/summary');
        var units = Array.isArray(data) ? data : (data && Array.isArray(data.units) ? data.units : []);
        var dashEl = document.getElementById('asset-dashboard-content');
        if (!dashEl) return;

        if (!units.length) {
          dashEl.innerHTML = '<div class="empty-state" style="padding:40px 0;text-align:center;">'
            + ic('inbox') + '<p>\u7121\u76e4\u9ede\u8cc7\u6599</p></div>';
          scheduleRefreshIcons();
          return;
        }

        // Summary stat cards
        var totalAssets = 0;
        var totalItSystems = 0;
        var totalChinaBrand = 0;
        var totalHighRisk = 0;
        for (var i = 0; i < units.length; i++) {
          var u = units[i];
          totalAssets += parseInt(u.assetCount, 10) || 0;
          totalItSystems += parseInt(u.itSystemCount, 10) || 0;
          totalChinaBrand += parseInt(u.chinaBrandCount, 10) || 0;
          totalHighRisk += parseInt(u.highRiskCount, 10) || 0;
        }

        var statsHtml = '<div class="stat-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">'
          + '<div class="stat-card" style="text-align:center;padding:16px;background:#f0f4ff;border-radius:8px;">'
          + '<div class="stat-value" style="font-size:1.8em;font-weight:bold;color:#2c3e50;">' + totalAssets + '</div>'
          + '<div class="stat-label" style="color:#666;">\u7e3d\u8cc7\u7522\u6578</div></div>'
          + '<div class="stat-card" style="text-align:center;padding:16px;background:#e8f8f5;border-radius:8px;">'
          + '<div class="stat-value" style="font-size:1.8em;font-weight:bold;color:#27ae60;">' + totalItSystems + '</div>'
          + '<div class="stat-label" style="color:#666;">\u8cc7\u901a\u7cfb\u7d71\u6578</div></div>'
          + '<div class="stat-card" style="text-align:center;padding:16px;background:#fef5e7;border-radius:8px;">'
          + '<div class="stat-value" style="font-size:1.8em;font-weight:bold;color:#e67e22;">' + totalChinaBrand + '</div>'
          + '<div class="stat-label" style="color:#666;">\u5927\u9678\u5ee0\u724c\u6578</div></div>'
          + '<div class="stat-card" style="text-align:center;padding:16px;background:#fdedec;border-radius:8px;">'
          + '<div class="stat-value" style="font-size:1.8em;font-weight:bold;color:#e74c3c;">' + totalHighRisk + '</div>'
          + '<div class="stat-label" style="color:#666;">\u9ad8\u98a8\u96aa\u6578</div></div>'
          + '</div>';

        // Unit table
        var rowsHtml = '';
        for (var j = 0; j < units.length; j++) {
          var unit = units[j];
          var statusLabel = unit.status || '\u2014';
          rowsHtml += '<tr>'
            + '<td>' + esc(unit.unitName || '') + '</td>'
            + '<td style="text-align:center;">' + esc(String(unit.assetCount || 0)) + '</td>'
            + '<td style="text-align:center;">' + esc(String(unit.itSystemCount || 0)) + '</td>'
            + '<td style="text-align:center;">' + esc(String(unit.chinaBrandCount || 0)) + '</td>'
            + '<td style="text-align:center;">'
            + (parseInt(unit.highRiskCount, 10) > 0
              ? '<span class="badge badge-danger"><span class="badge-dot"></span>' + esc(String(unit.highRiskCount)) + '</span>'
              : esc(String(unit.highRiskCount || 0)))
            + '</td>'
            + '<td>' + esc(statusLabel) + '</td>'
            + '</tr>';
        }

        dashEl.innerHTML = statsHtml
          + '<div class="table-wrapper" tabindex="0">'
          + '<table>'
          + '<caption class="sr-only">\u5404\u55ae\u4f4d\u8cc7\u7522\u76e4\u9ede\u7e3d\u89bd</caption>'
          + '<thead><tr>'
          + '<th scope="col">\u55ae\u4f4d</th>'
          + '<th scope="col" style="text-align:center;">\u8cc7\u7522\u6578</th>'
          + '<th scope="col" style="text-align:center;">\u8cc7\u901a\u7cfb\u7d71\u6578</th>'
          + '<th scope="col" style="text-align:center;">\u5927\u9678\u5ee0\u724c\u6578</th>'
          + '<th scope="col" style="text-align:center;">\u9ad8\u98a8\u96aa\u6578</th>'
          + '<th scope="col">\u72c0\u614b</th>'
          + '</tr></thead>'
          + '<tbody>' + rowsHtml + '</tbody>'
          + '</table>'
          + '</div>';

        scheduleRefreshIcons();
      } catch (err) {
        var dashEl2 = document.getElementById('asset-dashboard-content');
        if (dashEl2) {
          dashEl2.innerHTML = '<div class="empty-state" style="padding:40px 0;text-align:center;color:#c0392b;">'
            + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p></div>';
          scheduleRefreshIcons();
        }
      }
    }

    // -------------------------------------------------------
    // Return public API
    // -------------------------------------------------------
    return {
      renderAssetList: renderAssetList,
      renderAssetCreate: renderAssetCreate,
      renderAssetEdit: renderAssetEdit,
      renderAssetDetail: renderAssetDetail,
      renderAppendix10: renderAppendix10,
      renderRiskAssessment: renderRiskAssessment,
      renderAssetDashboard: renderAssetDashboard
    };
  };
})();
