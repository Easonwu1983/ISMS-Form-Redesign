(function () {
  window.createUnitContactApplicationModule = function createUnitContactApplicationModule(deps) {
    const {
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
      submitUnitContactApplication,
      getUnitContactApplication,
      lookupUnitContactApplicationsByEmail
    } = deps;

    const LAST_EMAIL_KEY = 'unit-contact-last-email';

    function getMount() {
      return document.getElementById('app');
    }

    function getRouteParam() {
      if (typeof window === 'undefined' || !window.location.hash) return '';
      const parts = window.location.hash.replace(/^#/, '').split('/');
      return parts[1] ? decodeURIComponent(parts[1]) : '';
    }

    function saveLastEmail(email) {
      try {
        window.sessionStorage.setItem(LAST_EMAIL_KEY, String(email || '').trim().toLowerCase());
      } catch (_) { }
    }

    function loadLastEmail() {
      try {
        return String(window.sessionStorage.getItem(LAST_EMAIL_KEY) || '').trim().toLowerCase();
      } catch (_) {
        return '';
      }
    }

    function buildPublicHero(eyebrow, title, subtitle, actions) {
      return ''
        + '<div class="page-header unit-contact-hero">'
        + '<div class="page-eyebrow">' + esc(eyebrow) + '</div>'
        + '<h1 class="page-title">' + esc(title) + '</h1>'
        + '<p class="page-subtitle">' + esc(subtitle) + '</p>'
        + '<div class="unit-contact-hero-actions">' + actions + '</div>'
        + '</div>';
    }

    function buildModeNotice() {
      const modeKey = getM365ModeKey();
      const description = modeKey === 'local-emulator'
        ? '目前先以校內前端驗證模式收件，後續會切換到 A3 可落地的 SharePoint / Power Automate 流程。'
        : '目前已接上 M365 流程，送出後會進入人工審核、建帳通知與首次登入交接。';
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
      const tone = String(application && application.statusTone || 'pending').trim();
      const label = String(application && application.statusLabel || '處理中').trim();
      return '<span class="unit-contact-status-badge unit-contact-status-badge--' + esc(tone) + '">' + esc(label) + '</span>';
    }

    function buildApplicationSummary(application) {
      return ''
        + '<div class="unit-contact-summary-grid">'
        + '<div><span>申請編號</span><strong>' + esc(application.id) + '</strong></div>'
        + '<div><span>申請單位</span><strong>' + esc(application.unitValue) + '</strong></div>'
        + '<div><span>申請人</span><strong>' + esc(application.applicantName) + '</strong></div>'
        + '<div><span>聯絡信箱</span><strong>' + esc(application.applicantEmail) + '</strong></div>'
        + '</div>';
    }

    function buildApplicationStatusCard(application) {
      return ''
        + '<article class="card unit-contact-status-card">'
        + '<div class="unit-contact-status-card-top">'
        + '<div><div class="unit-contact-status-id">' + esc(application.id) + '</div><div class="unit-contact-status-unit">' + esc(application.unitValue) + '</div></div>'
        + buildStatusBadge(application)
        + '</div>'
        + '<div class="unit-contact-status-detail">' + esc(application.statusDetail || '申請已建立。') + '</div>'
        + '<div class="unit-contact-status-meta">'
        + '<span>申請人 ' + esc(application.applicantName) + '</span>'
        + '<span>分機 ' + esc(application.extensionNumber || '-') + '</span>'
        + '<span>送出時間 ' + esc(fmtTime(application.submittedAt)) + '</span>'
        + '</div>'
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
      setUnsavedChangesGuard(true, '目前有尚未送出的窗口申請資料，確定要離開嗎？');
    }

    function clearDirty() {
      clearUnsavedChangesGuard();
    }

    function renderApplyForm() {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          'M365 x Campus Frontend',
          '申請單位資安窗口',
          '以校內前端收件、M365 後端審核與啟用的方式，讓各單位自行申請窗口帳號。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請進度</a>'
        )
        + buildModeNotice()
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('plus-circle', 'icon-sm') + ' 填寫申請資料</div>'
        + '<form id="unit-contact-apply-form" data-testid="unit-contact-apply-form">'
        + '<div class="form-row"><div class="form-group"><label class="form-label form-required">申請單位</label>'
        + buildUnitCascadeControl('uca-unit', '', false, true)
        + '<div class="form-hint">請直接選本校正式一、二級單位，後續將依此綁定窗口權限。</div></div></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">姓名</label><input type="text" class="form-input" id="uca-name" data-testid="unit-contact-name" placeholder="請輸入聯絡窗口姓名" required></div>'
        + '<div class="form-group"><label class="form-label form-required">分機</label><input type="text" class="form-input" id="uca-extension" data-testid="unit-contact-extension" placeholder="例如 61234 或 3366" required></div>'
        + '</div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">信箱</label><input type="email" class="form-input" id="uca-email" data-testid="unit-contact-email" placeholder="可使用校外信箱，但需能收信完成啟用" required></div>'
        + '<div class="form-group"><label class="form-label">備註</label><input type="text" class="form-input" id="uca-note" data-testid="unit-contact-note" placeholder="例如：新任窗口、原窗口交接"></div></div>'
        + '<div class="form-actions">'
        + '<button type="submit" class="btn btn-primary" data-testid="unit-contact-submit">' + ic('send', 'icon-sm') + ' 送出申請</button>'
        + '<a class="btn btn-ghost" href="#apply-unit-contact-status">已有申請編號？改查詢進度</a>'
        + '</div>'
        + '</form></div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('route', 'icon-sm') + ' 申請流程</div>'
        + buildStepCard('1. 送出申請', '先填單位、姓名、分機與信箱，系統會產生申請編號。')
        + buildStepCard('2. 管理端審核', '資安管理端確認單位與窗口資格，必要時會退回補件。')
        + buildStepCard('3. 帳號開通', '核准後由管理端建立或開通帳號，再寄送首次登入或改密碼說明。')
        + '</div>'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('sparkles', 'icon-sm') + ' 這版先完成什麼</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>首頁 CTA 與公共申請頁</li>'
        + '<li>單位一、二級連動選擇</li>'
        + '<li>申請編號與進度查詢頁</li>'
        + '<li>後續可直接改接 SharePoint / Flow</li>'
        + '</ul></div>'
        + '</aside></div></section>';

      initUnitCascade('uca-unit', '', { disabled: false });
      const form = document.getElementById('unit-contact-apply-form');
      form.addEventListener('input', markDirty);
      form.addEventListener('change', markDirty);
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const unitState = readUnitFormState('uca-unit');
        const applicantName = String(document.getElementById('uca-name').value || '').trim();
        const extensionNumber = String(document.getElementById('uca-extension').value || '').trim();
        const applicantEmail = String(document.getElementById('uca-email').value || '').trim().toLowerCase();
        const note = String(document.getElementById('uca-note').value || '').trim();
        if (!unitState.unitValue) {
          toast('請先完整選擇申請單位', 'error');
          return;
        }
        try {
          const result = await submitUnitContactApplication({
            ...unitState,
            unitCode: getUnitCode(unitState.unitValue),
            applicantName,
            extensionNumber,
            applicantEmail,
            note
          });
          if (!result || !result.application) throw new Error('申請送出失敗');
          saveLastEmail(applicantEmail);
          clearDirty();
          toast('申請已送出，系統已產生申請編號。');
          navigate('apply-unit-contact-success/' + encodeURIComponent(result.application.id), { allowDirtyNavigation: true });
        } catch (error) {
          toast(String(error && error.message || error || '申請送出失敗'), 'error');
        }
      });
      refreshIcons();
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
          + buildPublicHero('Application', '找不到申請資料', '這筆申請可能尚未建立，或瀏覽器已清除暫存資料。', '<a class="btn btn-primary" href="#apply-unit-contact">返回申請頁</a>')
          + '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">尚無可顯示的申請資料</div><div class="empty-state-desc">你可以重新填寫申請，或改用信箱查詢目前的申請進度。</div></div>'
          + '</section>';
        refreshIcons();
        return;
      }
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          'Application Created',
          '申請已送出',
          '系統已建立申請編號。接下來會依 A3 流程進入人工審核，再由管理端寄送帳號開通資訊。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢進度</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-success-card">'
        + '<div class="unit-contact-success-mark">' + ic('badge-check', 'icon-xl') + '</div>'
        + buildApplicationSummary(application)
        + '<div class="unit-contact-success-note">請保留申請編號與申請信箱。A3 版會由管理端審核後寄送帳號開通或首次登入說明，不在前端直接發送明碼密碼。</div>'
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">用信箱查詢進度</a><a class="btn btn-ghost" href="#apply-unit-contact">再送另一筆申請</a></div>'
        + '</div></div></div></section>';
      refreshIcons();
    }

    function renderApplyStatus() {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      const defaultEmail = loadLastEmail();
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          'Application Status',
          '查詢申請進度',
          '輸入申請時使用的信箱，即可查看目前待審、退回補件、待建帳或已開通狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact">' + ic('arrow-left', 'icon-sm') + ' 返回申請頁</a>'
        )
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('mail', 'icon-sm') + ' 以信箱查詢</div>'
        + '<form id="unit-contact-status-form">'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請信箱</label><input type="email" class="form-input" id="uca-status-email" value="' + esc(defaultEmail) + '" placeholder="請輸入申請時填寫的信箱" required></div>'
        + '<div class="form-group unit-contact-status-action"><button type="submit" class="btn btn-primary" style="width:100%">' + ic('search', 'icon-sm') + ' 查詢</button></div>'
        + '</div></form>'
        + '<div id="unit-contact-status-results"></div>'
        + '</div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('info', 'icon-sm') + ' 查詢提醒</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>同一信箱可以查到自己送出的所有申請</li>'
        + '<li>正式上線後會顯示審核、建帳與帳號開通進度</li>'
        + '<li>若審核退回，會顯示待補件狀態與說明</li>'
        + '</ul></div></aside>'
        + '</div></section>';

      const form = document.getElementById('unit-contact-status-form');
      const resultsEl = document.getElementById('unit-contact-status-results');

      async function runLookup() {
        const email = String(document.getElementById('uca-status-email').value || '').trim().toLowerCase();
        if (!email) {
          toast('請輸入申請信箱', 'error');
          return;
        }
        saveLastEmail(email);
        resultsEl.innerHTML = '<div class="unit-contact-results-loading">查詢中...</div>';
        try {
          const applications = await lookupUnitContactApplicationsByEmail(email);
          if (!applications.length) {
            resultsEl.innerHTML = '<div class="empty-state unit-contact-inline-empty"><div class="empty-state-icon">' + ic('inbox', 'icon-lg') + '</div><div class="empty-state-title">查無申請資料</div><div class="empty-state-desc">目前沒有找到這個信箱的申請紀錄，請確認信箱是否填寫正確。</div></div>';
            refreshIcons();
            return;
          }
          resultsEl.innerHTML = '<div class="unit-contact-status-list">' + applications.map(buildApplicationStatusCard).join('') + '</div>';
          refreshIcons();
        } catch (error) {
          resultsEl.innerHTML = '';
          toast(String(error && error.message || error || '查詢失敗'), 'error');
        }
      }

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        runLookup();
      });
      if (defaultEmail) runLookup();
      refreshIcons();
    }

    function renderActivate(param) {
      const mount = getMount();
      if (!mount) return;
      clearDirty();
      const application = param ? getUnitContactApplication(param) : null;
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          'Account Handoff',
          '窗口帳號開通說明',
          'A3 版會把這頁作為管理端寄出帳號開通通知後的交接頁，可放首次登入與改密碼指引。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢目前申請狀態</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-side-card">'
        + '<div class="section-header">' + ic('key', 'icon-sm') + ' A3 交接方式</div>'
        + '<div class="unit-contact-activation-copy">正式串接後，核准的申請會由管理端建立或確認帳號，再由 M365 信件寄送首次登入、改密碼或開通說明。未來若升級到 Azure / External ID，再把這頁改成真正的自助啟用流程即可。</div>'
        + (application ? buildApplicationSummary(application) : '')
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact">返回申請頁</a></div>'
        + '</div></div></div></section>';
      refreshIcons();
    }

    return {
      renderApplyForm,
      renderApplySuccess,
      renderApplyStatus,
      renderActivate
    };
  };
})();
