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

    function isNtuEmail(email) {
      return /@ntu\.edu\.tw$/i.test(String(email || '').trim());
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
        ? '目前為本機模擬模式，申請資料只會保留在目前瀏覽器。若要讓最高管理員實際審核，請切換到正式後端。'
        : '目前為正式後端模式，送出的申請會同步到系統後端，供最高管理員審核並直接啟用。';
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
      const label = String(application && application.statusLabel || '待審核').trim() || '待審核';
      return '<span class="unit-contact-status-badge unit-contact-status-badge--' + esc(tone) + '">' + esc(label) + '</span>';
    }

    function buildApplicationSummary(application) {
      return ''
        + '<div class="unit-contact-summary-grid">'
        + '<div><span>申請編號</span><strong>' + esc(application.id) + '</strong></div>'
        + '<div><span>申請單位</span><strong>' + esc(application.unitValue) + '</strong></div>'
        + '<div><span>申請人</span><strong>' + esc(application.applicantName) + '</strong></div>'
        + '<div><span>申請信箱</span><strong>' + esc(application.applicantEmail) + '</strong></div>'
        + '</div>';
    }

    function buildStatusActions(application) {
      const status = String(application && application.status || '').trim();
      const id = encodeURIComponent(String(application && application.id || '').trim());
      const actions = [];
      if (status === UNIT_CONTACT_APPLICATION_STATUSES.RETURNED) {
        actions.push('<a class="btn btn-primary" href="#apply-unit-contact">補件後重新送出</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">重新查詢</a>');
      } else if (
        status === UNIT_CONTACT_APPLICATION_STATUSES.APPROVED
        || status === UNIT_CONTACT_APPLICATION_STATUSES.ACTIVATION_PENDING
        || status === UNIT_CONTACT_APPLICATION_STATUSES.ACTIVE
      ) {
        actions.push('<a class="btn btn-primary" href="#activate-unit-contact/' + id + '">查看啟用說明</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">返回查詢</a>');
      } else if (status === UNIT_CONTACT_APPLICATION_STATUSES.REJECTED) {
        actions.push('<a class="btn btn-primary" href="#apply-unit-contact">重新送出申請</a>');
        actions.push('<a class="btn btn-secondary" href="#apply-unit-contact-status">重新查詢</a>');
      }
      if (!actions.length) return '';
      return '<div class="form-actions unit-contact-status-actions">' + actions.join('') + '</div>';
    }

    function buildApplicationStatusCard(application) {
      const detail = String(application && application.statusDetail || '').trim()
        || '申請已送出，請留意後續審核通知並使用申請信箱回到系統查詢進度。';
      return ''
        + '<article class="card unit-contact-status-card">'
        + '<div class="unit-contact-status-card-top">'
        + '<div><div class="unit-contact-status-id">' + esc(application.id) + '</div><div class="unit-contact-status-unit">' + esc(application.unitValue) + '</div></div>'
        + buildStatusBadge(application)
        + '</div>'
        + '<div class="unit-contact-status-detail">' + esc(detail) + '</div>'
        + '<div class="unit-contact-status-meta">'
        + '<span>申請人：' + esc(application.applicantName) + '</span>'
        + '<span>分機：' + esc(application.extensionNumber || '-') + '</span>'
        + '<span>送出時間：' + esc(fmtTime(application.submittedAt)) + '</span>'
        + '</div>'
        + buildStatusActions(application)
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
      setUnsavedChangesGuard(true, '申請資料尚未送出，若現在離開頁面，剛剛填寫的內容將不會保留。');
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
          '公開申請單位管理人',
          '申請單位管理人帳號',
          '若需新增或異動各單位管理窗口，請先送出申請。最高管理員審核通過後，系統會直接啟用帳號並寄送登入資訊。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請進度</a>'
        )
        + buildModeNotice()
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('plus-circle', 'icon-sm') + ' 送出申請</div>'
        + '<form id="unit-contact-apply-form" data-testid="unit-contact-apply-form">'
        + '<div class="form-row"><div class="form-group"><label class="form-label form-required">申請單位</label>'
        + buildUnitCascadeControl('uca-unit', '', false, true)
        + '<div class="form-hint">請選擇正式單位名稱。若選單中沒有對應單位，可先選其他後輸入完整名稱。</div></div></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請人姓名</label><input type="text" class="form-input" id="uca-name" data-testid="unit-contact-name" placeholder="請輸入申請人姓名" required></div>'
        + '<div class="form-group"><label class="form-label form-required">分機</label><input type="text" class="form-input" id="uca-extension" data-testid="unit-contact-extension" placeholder="例如 61234 或 3366" required></div>'
        + '</div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請信箱</label><input type="email" class="form-input" id="uca-email" data-testid="unit-contact-email" placeholder="請輸入 @ntu.edu.tw 信箱" required></div>'
        + '<div class="form-group"><label class="form-label">備註</label><input type="text" class="form-input" id="uca-note" data-testid="unit-contact-note" placeholder="可補充職稱、代理原因或其他說明"></div></div>'
        + '<div class="form-actions">'
        + '<button type="submit" class="btn btn-primary" data-testid="unit-contact-submit">' + ic('send', 'icon-sm') + ' 送出申請</button>'
        + '<a class="btn btn-ghost" href="#apply-unit-contact-status">改為查詢進度</a>'
        + '</div>'
        + '</form></div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('route', 'icon-sm') + ' 申請流程</div>'
        + buildStepCard('1. 填寫並送出申請', '填妥申請單位、申請人與聯絡資訊後送出。')
        + buildStepCard('2. 等待最高管理員審核', '最高管理員會依申請內容進行通過、退回補件或拒絕。')
        + buildStepCard('3. 直接使用申請信箱登入', '審核通過後，系統會直接啟用帳號，並寄送初始密碼。登入帳號固定為申請時填寫的電子郵件。')
        + '</div>'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('sparkles', 'icon-sm') + ' 送出前請確認</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>申請單位已填寫正式名稱或完整自訂名稱。</li>'
        + '<li>申請信箱必須為 @ntu.edu.tw。</li>'
        + '<li>審核通過後會直接啟用帳號，登入帳號固定為申請時填寫的電子郵件。</li>'
        + '<li>送出後請記下申請信箱，後續可用來查詢申請進度。</li>'
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
          toast('請先選擇申請單位。', 'error');
          return;
        }
        if (!isNtuEmail(applicantEmail)) {
          toast('申請信箱必須為 @ntu.edu.tw。', 'error');
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
          if (!result || !result.application) throw new Error('申請送出後未收到有效回應。');
          saveLastEmail(applicantEmail);
          clearDirty();
          toast('申請已送出，請記下申請信箱並留意後續通知。');
          navigate('apply-unit-contact-success/' + encodeURIComponent(result.application.id), { allowDirtyNavigation: true });
        } catch (error) {
          toast(String(error && error.message || error || '申請送出失敗。'), 'error');
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
          + buildPublicHero(
            '申請已送出',
            '找不到申請資料',
            '目前無法載入這筆申請。若剛完成送件，請改由查詢頁輸入申請信箱查看進度。',
            '<a class="btn btn-primary" href="#apply-unit-contact">重新送出申請</a>'
          )
          + '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">找不到申請資料</div><div class="empty-state-desc">請改用申請信箱到查詢頁查看，或重新送出申請。</div></div>'
          + '</section>';
        refreshIcons();
        return;
      }
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '申請已送出',
          '申請已成功送出',
          '請記下申請編號與申請信箱，後續可回到查詢頁查看審核進度與登入資訊寄送結果。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請進度</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-success-card">'
        + '<div class="unit-contact-success-mark">' + ic('badge-check', 'icon-xl') + '</div>'
        + buildApplicationSummary(application)
        + '<div class="unit-contact-success-note">若管理端需要補件或已完成審核，系統會更新申請狀態。登入帳號會固定使用申請信箱。</div>'
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">立即查詢進度</a><a class="btn btn-ghost" href="#apply-unit-contact">送出另一筆申請</a></div>'
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
          '申請進度查詢',
          '查詢單位管理人申請進度',
          '請輸入送件時使用的 @ntu.edu.tw 信箱，系統會列出該信箱下的申請狀態與後續操作。',
          '<a class="btn btn-secondary" href="#apply-unit-contact">' + ic('arrow-left', 'icon-sm') + ' 返回申請</a>'
        )
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('mail', 'icon-sm') + ' 依信箱查詢</div>'
        + '<form id="unit-contact-status-form">'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請信箱</label><input type="email" class="form-input" id="uca-status-email" value="' + esc(defaultEmail) + '" placeholder="請輸入送件時使用的 @ntu.edu.tw 信箱" required></div>'
        + '<div class="form-group unit-contact-status-action"><button type="submit" class="btn btn-primary" style="width:100%">' + ic('search', 'icon-sm') + ' 開始查詢</button></div>'
        + '</div></form>'
        + '<div id="unit-contact-status-results"></div>'
        + '</div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('info', 'icon-sm') + ' 查詢說明</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>請輸入申請時使用的 @ntu.edu.tw 信箱。</li>'
        + '<li>若看到退回補件，可直接回到申請頁補正後重新送出。</li>'
        + '<li>若看到已通過或已啟用，代表系統會直接寄送登入資訊，可查看登入說明與後續通知。</li>'
        + '</ul></div></aside>'
        + '</div></section>';

      const form = document.getElementById('unit-contact-status-form');
      const resultsEl = document.getElementById('unit-contact-status-results');

      async function runLookup() {
        const email = String(document.getElementById('uca-status-email').value || '').trim().toLowerCase();
        if (!email) {
          toast('請輸入申請信箱。', 'error');
          return;
        }
        if (!isNtuEmail(email)) {
          toast('查詢信箱必須為 @ntu.edu.tw。', 'error');
          return;
        }
        saveLastEmail(email);
        resultsEl.innerHTML = '<div class="unit-contact-results-loading">查詢中...</div>';
        try {
          const applications = await lookupUnitContactApplicationsByEmail(email);
          if (!applications.length) {
            resultsEl.innerHTML = '<div class="empty-state unit-contact-inline-empty"><div class="empty-state-icon">' + ic('inbox', 'icon-lg') + '</div><div class="empty-state-title">找不到申請紀錄</div><div class="empty-state-desc">請確認申請信箱是否正確，或先回到申請頁重新送件。</div></div>';
            refreshIcons();
            return;
          }
          resultsEl.innerHTML = '<div class="unit-contact-status-list">' + applications.map(buildApplicationStatusCard).join('') + '</div>';
          refreshIcons();
        } catch (error) {
          resultsEl.innerHTML = '';
          toast(String(error && error.message || error || '查詢失敗。'), 'error');
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
          '帳號啟用說明',
          '單位管理人帳號啟用說明',
          '當申請已通過或已啟用時，可依此頁說明確認登入方式。登入帳號固定為申請時填寫的電子郵件。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請進度</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-side-card">'
        + '<div class="section-header">' + ic('key', 'icon-sm') + ' 登入說明</div>'
        + '<div class="unit-contact-activation-copy">若您已收到通知，請使用申請時填寫的電子郵件作為登入帳號，並搭配通知中的初始密碼登入系統，首次登入後請立即修改密碼。若狀態仍為待審核或退回補件，請先回到查詢頁確認最新進度。</div>'
        + (application ? buildApplicationSummary(application) : '')
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">返回查詢頁</a></div>'
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
