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
        ? '目前為瀏覽器模擬模式，申請資料僅保存在本機。若要正式送件，請切換到校內正式後端模式。'
        : '目前為正式後端模式，申請資料會同步寫入系統資料庫，並開啟正式的校內審核與查詢流程。';
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
        + '<div><span>電子郵件</span><strong>' + esc(application.applicantEmail) + '</strong></div>'
        + '</div>';
    }

    function buildApplicationStatusCard(application) {
      const detail = String(application && application.statusDetail || '').trim()
        || '系統正在處理您的申請，若有進一步結果會透過電子郵件通知。';
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
      setUnsavedChangesGuard(true, '您有尚未送出的申請資料，離開後變更將不會保留。');
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
          '校內帳號申請流程',
          '申請單位管理人員',
          '請填寫單位、聯絡方式與申請人資訊。送出後，系統會建立申請編號，供您後續查詢審核與帳號啟用進度。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請狀態</a>'
        )
        + buildModeNotice()
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('plus-circle', 'icon-sm') + ' 申請資料</div>'
        + '<form id="unit-contact-apply-form" data-testid="unit-contact-apply-form">'
        + '<div class="form-row"><div class="form-group"><label class="form-label form-required">申請單位</label>'
        + buildUnitCascadeControl('uca-unit', '', false, true)
        + '<div class="form-hint">請先選擇一級單位，若有二級單位可再進一步指定。</div></div></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請人姓名</label><input type="text" class="form-input" id="uca-name" data-testid="unit-contact-name" placeholder="請輸入聯絡窗口姓名" required></div>'
        + '<div class="form-group"><label class="form-label form-required">分機</label><input type="text" class="form-input" id="uca-extension" data-testid="unit-contact-extension" placeholder="例如 61234 或 3366" required></div>'
        + '</div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">電子郵件</label><input type="email" class="form-input" id="uca-email" data-testid="unit-contact-email" placeholder="請輸入校內聯絡電子郵件" required></div>'
        + '<div class="form-group"><label class="form-label">備註</label><input type="text" class="form-input" id="uca-note" data-testid="unit-contact-note" placeholder="例如代理人資訊或特殊說明"></div></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">登入帳號</label><input type="text" class="form-input" id="uca-username" data-testid="unit-contact-username" placeholder="請輸入登入帳號" required autocomplete="off"></div>'
        + '<div class="form-group"><label class="form-label form-required">初始密碼</label><input type="password" class="form-input" id="uca-password" data-testid="unit-contact-password" placeholder="至少 8 碼" minlength="8" required autocomplete="new-password"></div>'
        + '</div>'
        + '<div class="form-actions">'
        + '<button type="submit" class="btn btn-primary" data-testid="unit-contact-submit">' + ic('send', 'icon-sm') + ' 送出申請</button>'
        + '<a class="btn btn-ghost" href="#apply-unit-contact-status">已有申請編號？前往查詢</a>'
        + '</div>'
        + '</form></div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('route', 'icon-sm') + ' 流程說明</div>'
        + buildStepCard('1. 填寫並送出申請', '確認申請單位、聯絡方式與申請人資訊，送出後系統會產生申請編號。')
        + buildStepCard('2. 系統建立帳號交接流程', '管理端完成審核後，您會收到可查詢的申請進度與後續啟用資訊。')
        + buildStepCard('3. 啟用後登入系統', '帳號啟用完成後，即可使用既有帳號密碼登入系統進行填報。')
        + '</div>'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('sparkles', 'icon-sm') + ' 送出前確認</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>申請單位是否選擇正確。</li>'
        + '<li>電子郵件是否為可正常收信的校內信箱。</li>'
        + '<li>送出後請保留申請編號，方便後續查詢。</li>'
        + '<li>正式模式下，資料會寫入系統資料庫供後續流程使用。</li>'
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
        const requestedUsername = String(document.getElementById('uca-username').value || '').trim();
        const requestedPassword = String(document.getElementById('uca-password').value || '');
        if (!requestedUsername) {
          toast('請填寫登入帳號。', 'error');
          return;
        }
        if (requestedPassword.length < 8) {
          toast('初始密碼至少需 8 碼。', 'error');
          return;
        }
        if (!unitState.unitValue) {
          toast('請先選擇申請單位。', 'error');
          return;
        }
        try {
          const result = await submitUnitContactApplication({
            ...unitState,
            unitCode: getUnitCode(unitState.unitValue),
            applicantName,
            extensionNumber,
            applicantEmail,
            note,
            requestedUsername,
            requestedPassword
          });
          if (!result || !result.application) throw new Error('系統未回傳申請結果。');
          saveLastEmail(applicantEmail);
          clearDirty();
          toast('申請已送出，請記下申請編號並留意後續電子郵件通知。');
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
            '申請完成',
            '找不到申請資料',
            '目前無法讀取這筆申請資料。您可以重新送出申請，或改用申請進度查詢頁確認現有申請。',
            '<a class="btn btn-primary" href="#apply-unit-contact">重新送出申請</a>'
          )
          + '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">尚未找到申請編號</div><div class="empty-state-desc">請確認網址中的申請編號是否正確，或改到查詢頁以電子郵件搜尋既有申請。</div></div>'
          + '</section>';
        refreshIcons();
        return;
      }
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '申請完成',
          '申請已成功建立',
          '系統已建立申請編號。後續若有審核結果或帳號交接進度，請回到查詢頁追蹤最新狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請狀態</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-success-card">'
        + '<div class="unit-contact-success-mark">' + ic('badge-check', 'icon-xl') + '</div>'
        + buildApplicationSummary(application)
        + '<div class="unit-contact-success-note">請保留申請編號與送出時使用的電子郵件。若後續需要追蹤進度、確認帳號啟用，查詢頁會以這兩項資料作為主要依據。</div>'
        + '<div class="form-actions"><a class="btn btn-primary" href="#apply-unit-contact-status">前往查詢狀態</a><a class="btn btn-ghost" href="#apply-unit-contact">再送一筆申請</a></div>'
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
          '查詢申請狀態',
          '請輸入申請時使用的電子郵件。系統會列出該信箱相關的申請紀錄與目前處理狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact">' + ic('arrow-left', 'icon-sm') + ' 返回申請頁</a>'
        )
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('mail', 'icon-sm') + ' 電子郵件查詢</div>'
        + '<form id="unit-contact-status-form">'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請信箱</label><input type="email" class="form-input" id="uca-status-email" value="' + esc(defaultEmail) + '" placeholder="請輸入送出申請時使用的電子郵件" required></div>'
        + '<div class="form-group unit-contact-status-action"><button type="submit" class="btn btn-primary" style="width:100%">' + ic('search', 'icon-sm') + ' 開始查詢</button></div>'
        + '</div></form>'
        + '<div id="unit-contact-status-results"></div>'
        + '</div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('info', 'icon-sm') + ' 查詢說明</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>請輸入送出申請時使用的電子郵件。</li>'
        + '<li>若查無資料，請確認是否使用了其他信箱或重新送出申請。</li>'
        + '<li>帳號啟用完成後，系統會在狀態頁顯示後續說明。</li>'
        + '</ul></div></aside>'
        + '</div></section>';

      const form = document.getElementById('unit-contact-status-form');
      const resultsEl = document.getElementById('unit-contact-status-results');

      async function runLookup() {
        const email = String(document.getElementById('uca-status-email').value || '').trim().toLowerCase();
        if (!email) {
          toast('請輸入電子郵件。', 'error');
          return;
        }
        saveLastEmail(email);
        resultsEl.innerHTML = '<div class="unit-contact-results-loading">查詢中...</div>';
        try {
          const applications = await lookupUnitContactApplicationsByEmail(email);
          if (!applications.length) {
            resultsEl.innerHTML = '<div class="empty-state unit-contact-inline-empty"><div class="empty-state-icon">' + ic('inbox', 'icon-lg') + '</div><div class="empty-state-title">查無申請紀錄</div><div class="empty-state-desc">目前找不到與此電子郵件相關的申請。請確認信箱是否正確，或回到申請頁重新送件。</div></div>';
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
          '帳號啟用流程',
          '帳號啟用說明',
          '當管理端完成審核後，您可以依申請狀態頁提供的資訊完成帳號交接與首次登入。若尚未收到啟用資訊，請先回查詢頁確認最新進度。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢申請狀態</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-side-card">'
        + '<div class="section-header">' + ic('key', 'icon-sm') + ' 啟用步驟</div>'
        + '<div class="unit-contact-activation-copy">帳號啟用完成後，請依管理端提供的帳號資訊登入系統，並盡快確認單位、角色與登入狀態是否正確。如有異常，請回到申請狀態頁或聯絡管理端處理。</div>'
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
