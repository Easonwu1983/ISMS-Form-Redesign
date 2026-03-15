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
        // ignore storage failures
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
        ? '目前為瀏覽器模擬模式，申請資料僅寫入本機儲存。若要正式送件，請切換到校內 M365 後端模式。'
        : '目前為校內 M365 正式模式，申請資料會送往校內後端與 SharePoint 清單，請使用真實聯絡資訊。';
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
      const detail = String(application && application.statusDetail || '').trim() || '系統尚未回寫狀態，請稍後再查詢。';
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
        + '<span>送件時間：' + esc(fmtTime(application.submittedAt)) + '</span>'
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
      setUnsavedChangesGuard(true, '目前表單尚未送出，若離開頁面會失去已填寫內容。');
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
          '請填寫單位、聯絡方式與申請資訊。送出後系統會交由管理者審核，核准後即可使用帳號登入系統。',
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
        + '<div class="form-hint">請先選擇正式單位。若為二級單位，請繼續選擇下層單位。</div></div></div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請人姓名</label><input type="text" class="form-input" id="uca-name" data-testid="unit-contact-name" placeholder="請輸入聯絡人姓名" required></div>'
        + '<div class="form-group"><label class="form-label form-required">分機</label><input type="text" class="form-input" id="uca-extension" data-testid="unit-contact-extension" placeholder="例如 61234 或 3366" required></div>'
        + '</div>'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">聯絡信箱</label><input type="email" class="form-input" id="uca-email" data-testid="unit-contact-email" placeholder="請輸入可收件的電子郵件" required></div>'
        + '<div class="form-group"><label class="form-label">備註</label><input type="text" class="form-input" id="uca-note" data-testid="unit-contact-note" placeholder="可補充需求、交接或特殊說明"></div></div>'
        + '<div class="form-actions">'
        + '<button type="submit" class="btn btn-primary" data-testid="unit-contact-submit">' + ic('send', 'icon-sm') + ' 送出申請</button>'
        + '<a class="btn btn-ghost" href="#apply-unit-contact-status">已有申請編號，改查詢狀態</a>'
        + '</div>'
        + '</form></div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('route', 'icon-sm') + ' 申請流程</div>'
        + buildStepCard('1. 填寫申請資料', '選擇申請單位，填寫聯絡人姓名、分機與電子郵件後送出。')
        + buildStepCard('2. 管理者審核', '系統管理者確認單位與聯絡資訊後，核發可登入帳號。')
        + buildStepCard('3. 啟用後登入', '核准後可用申請時填寫的電子郵件查詢狀態，並依提示登入系統。')
        + '</div>'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('sparkles', 'icon-sm') + ' 送件前確認</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>確認申請單位選擇正確</li>'
        + '<li>聯絡信箱可正常收件</li>'
        + '<li>送出後請保留申請編號</li>'
        + '<li>資料將寫入 SharePoint 與校內流程</li>'
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
          toast('請先選擇申請單位', 'error');
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
          toast('申請已送出，請保留申請編號並追蹤審核狀態。');
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
          + buildPublicHero(
            '申請資料',
            '找不到申請資料',
            '目前無法取得申請內容。請確認申請編號是否正確，或回到查詢頁重新輸入電子郵件。',
            '<a class="btn btn-primary" href="#apply-unit-contact">重新申請</a>'
          )
          + '<div class="empty-state"><div class="empty-state-icon">' + ic('alert-triangle', 'icon-lg') + '</div><div class="empty-state-title">查無對應申請</div><div class="empty-state-desc">請回到狀態查詢頁，重新輸入送件時使用的電子郵件或申請編號。</div></div>'
          + '</section>';
        refreshIcons();
        return;
      }
      mount.innerHTML = ''
        + '<section class="unit-contact-shell">'
        + buildPublicHero(
          '申請完成',
          '申請已送出',
          '系統已建立申請資料。後續會交由管理者審核，核准後可用同一個電子郵件查詢啟用狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢狀態</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-success-card">'
        + '<div class="unit-contact-success-mark">' + ic('badge-check', 'icon-xl') + '</div>'
        + buildApplicationSummary(application)
        + '<div class="unit-contact-success-note">請記下申請編號，並使用同一個電子郵件至狀態查詢頁追蹤進度。管理者核准後，系統會回寫啟用狀態與登入說明。</div>'
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
          '輸入送件時使用的電子郵件，系統會列出目前可查詢的申請進度與啟用狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact">' + ic('arrow-left', 'icon-sm') + ' 返回申請頁</a>'
        )
        + '<div class="unit-contact-layout">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-form-card">'
        + '<div class="section-header">' + ic('mail', 'icon-sm') + ' 依電子郵件查詢</div>'
        + '<form id="unit-contact-status-form">'
        + '<div class="form-row unit-contact-compact-row">'
        + '<div class="form-group"><label class="form-label form-required">申請信箱</label><input type="email" class="form-input" id="uca-status-email" value="' + esc(defaultEmail) + '" placeholder="請輸入申請時使用的電子郵件" required></div>'
        + '<div class="form-group unit-contact-status-action"><button type="submit" class="btn btn-primary" style="width:100%">' + ic('search', 'icon-sm') + ' 開始查詢</button></div>'
        + '</div></form>'
        + '<div id="unit-contact-status-results"></div>'
        + '</div></div>'
        + '<aside class="unit-contact-side">'
        + '<div class="card unit-contact-side-card"><div class="section-header">' + ic('info', 'icon-sm') + ' 查詢說明</div>'
        + '<ul class="unit-contact-checklist">'
        + '<li>請使用送件時填寫的電子郵件</li>'
        + '<li>若已核准，系統會顯示啟用狀態與後續提示</li>'
        + '<li>若查不到資料，請確認是否輸入了正確信箱</li>'
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
            resultsEl.innerHTML = '<div class="empty-state unit-contact-inline-empty"><div class="empty-state-icon">' + ic('inbox', 'icon-lg') + '</div><div class="empty-state-title">查無申請紀錄</div><div class="empty-state-desc">目前找不到這個電子郵件的申請資料，請確認是否使用了正確信箱，或回到申請頁重新送件。</div></div>';
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
          '帳號啟用流程',
          '帳號啟用說明',
          '當管理者完成審核後，系統會依校內流程建立可登入帳號。若你是接手人員，請回到狀態查詢頁確認目前狀態。',
          '<a class="btn btn-secondary" href="#apply-unit-contact-status">' + ic('search', 'icon-sm') + ' 查詢目前狀態</a>'
        )
        + '<div class="unit-contact-layout unit-contact-layout--single">'
        + '<div class="unit-contact-main">'
        + '<div class="card unit-contact-side-card">'
        + '<div class="section-header">' + ic('key', 'icon-sm') + ' 啟用流程</div>'
        + '<div class="unit-contact-activation-copy">此頁主要提供校內啟用與交接說明。正式帳號建立仍由後端與校內身分流程處理，不會直接在前端頁面發放密碼。</div>'
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
