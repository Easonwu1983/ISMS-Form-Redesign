const path = require('path');
const {
  attachDiagnostics,
  BASE_URL,
  createArtifactRun,
  createResultEnvelope,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = createArtifactRun('accessibility-regression').outDir;
const RESULT_PATH = path.join(OUT_DIR, 'accessibility-regression.json');

async function waitForRouteSurface(page, selector, timeout = 20000) {
  await page.waitForFunction((targetSelector) => {
    const app = document.getElementById('app');
    return !!app && !!document.querySelector(targetSelector);
  }, selector, { timeout });
}

async function collectTableSemantics(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('#app table')).map((table) => {
      const caption = table.querySelector('caption');
      const headers = Array.from(table.querySelectorAll('th'));
      return {
        caption: caption ? String(caption.textContent || '').trim() : '',
        headerCount: headers.length,
        scopedHeaders: headers.filter((cell) => String(cell.getAttribute('scope') || '').trim().toLowerCase() === 'col').length
      };
    });
  });
}

(async () => {
  const results = createResultEnvelope({ steps: [] });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);

  try {
    await runStep(results, 'A11Y-01', 'Public', 'Login shell exposes landmarks and skip link', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="login-form"]', { timeout: 45000 });
      const state = await page.evaluate(() => {
        const skipLink = document.querySelector('.skip-link');
        const main = document.getElementById('app');
        const loginError = document.getElementById('login-error');
        const username = document.getElementById('login-user');
        const password = document.getElementById('login-pass');
        return {
          skipHref: skipLink ? String(skipLink.getAttribute('href') || '').trim() : '',
          mainRole: main ? String(main.getAttribute('role') || '').trim() : '',
          mainLabelledBy: main ? String(main.getAttribute('aria-labelledby') || '').trim() : '',
          errorRole: loginError ? String(loginError.getAttribute('role') || '').trim() : '',
          errorLive: loginError ? String(loginError.getAttribute('aria-live') || '').trim() : '',
          usernameAutocomplete: username ? String(username.getAttribute('autocomplete') || '').trim() : '',
          passwordAutocomplete: password ? String(password.getAttribute('autocomplete') || '').trim() : ''
        };
      });
      if (state.skipHref !== '#app') throw new Error('skip link missing or incorrect');
      if (state.mainRole !== 'main') throw new Error('login main landmark missing');
      if (!state.mainLabelledBy) throw new Error('login main aria-labelledby missing');
      if (state.errorRole !== 'alert' || state.errorLive !== 'assertive') {
        throw new Error('login error live region missing');
      }
      if (state.usernameAutocomplete !== 'username') throw new Error('login username autocomplete missing');
      if (state.passwordAutocomplete !== 'current-password') throw new Error('login password autocomplete missing');
      return 'login landmarks ready';
    });

    await runStep(results, 'A11Y-02', 'Public', 'Modal focus trap and describedby work', async () => {
      await page.focus('#login-user');
      await page.waitForFunction(() => !!(window._uiModule && typeof window._uiModule.openPromptDialog === 'function'), { timeout: 10000 });
      await page.evaluate(() => {
        window._uiModule.openPromptDialog('測試描述文字', {
          title: '無障礙測試',
          label: '測試輸入',
          confirmLabel: '確認',
          cancelLabel: '取消',
          defaultValue: 'seed'
        });
        return true;
      });
      await page.waitForSelector('.modal-card[role="dialog"][aria-modal="true"]', { timeout: 10000 });
      const before = await page.evaluate(() => {
        const dialog = document.querySelector('.modal-card[role="dialog"]');
        const input = dialog && dialog.querySelector('#modal-prompt-input');
        const buttons = dialog ? Array.from(dialog.querySelectorAll('button')) : [];
        const focusables = dialog
          ? Array.from(dialog.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'))
          : [];
        const describe = (element) => {
          if (!element) return '';
          return String(
            element.id
            || element.getAttribute('aria-label')
            || element.textContent
            || element.className
            || element.tagName
          ).trim();
        };
        return {
          describedBy: dialog ? String(dialog.getAttribute('aria-describedby') || '').trim() : '',
          activeId: document.activeElement ? String(document.activeElement.id || '').trim() : '',
          buttonCount: buttons.length,
          firstFocusable: describe(focusables[0]),
          lastFocusable: describe(focusables[focusables.length - 1])
        };
      });
      if (!before.describedBy) throw new Error('modal aria-describedby missing');
      if (before.activeId !== 'modal-prompt-input') throw new Error('modal did not focus first input');

      await page.evaluate(() => {
        const dialog = document.querySelector('.modal-card[role="dialog"]');
        const focusables = dialog
          ? Array.from(dialog.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'))
          : [];
        const last = focusables[focusables.length - 1];
        if (last && typeof last.focus === 'function') last.focus();
      });
      await page.keyboard.press('Tab');
      const wrappedForward = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return '';
        return String(active.id || active.getAttribute('aria-label') || active.textContent || active.className || active.tagName).trim();
      });
      if (wrappedForward !== before.firstFocusable) throw new Error('modal tab loop did not wrap to first control');

      await page.keyboard.press('Shift+Tab');
      const wrappedBackward = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return '';
        return String(active.textContent || active.id || active.className || '').trim();
      });
      if (wrappedBackward !== before.lastFocusable) throw new Error('modal shift+tab loop did not wrap to last control');

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.modal-card[role="dialog"]'), { timeout: 5000 });
      const restoredFocus = await page.evaluate(() => String(document.activeElement && document.activeElement.id || '').trim());
      if (restoredFocus !== 'login-user') throw new Error('modal focus did not return to opener');
      return `buttons=${before.buttonCount}`;
    });

    await runStep(results, 'A11Y-03', 'Public', 'Public apply/status forms announce validation errors', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await gotoHash(page, 'apply-unit-contact', { handleUnsaved: false });
      await page.waitForSelector('[data-testid="unit-contact-apply-form"]', { timeout: 20000 });
      await page.click('[data-testid="unit-contact-submit"]');
      await page.waitForFunction(() => {
        const feedback = document.getElementById('unit-contact-apply-feedback');
        return !!feedback && !feedback.hidden && String(feedback.getAttribute('role') || '').trim().length > 0;
      }, { timeout: 10000 });
      const applyState = await page.evaluate(() => {
        const feedback = document.getElementById('unit-contact-apply-feedback');
        const unitError = document.getElementById('uca-unit-error');
        const email = document.getElementById('uca-email');
        const authDoc = document.getElementById('uca-authorization-doc');
        const toastContainer = document.getElementById('toast-container');
        return {
          feedbackRole: feedback ? String(feedback.getAttribute('role') || '').trim() : '',
          feedbackHidden: feedback ? feedback.hidden : true,
          unitErrorHidden: unitError ? unitError.hidden : true,
          emailInvalid: email ? String(email.getAttribute('aria-invalid') || '').trim() : '',
          emailErrorMessage: email ? String(email.getAttribute('aria-errormessage') || '').trim() : '',
          authDocErrorMessage: authDoc ? String(authDoc.getAttribute('aria-errormessage') || '').trim() : '',
          toastLive: toastContainer ? String(toastContainer.getAttribute('aria-live') || '').trim() : '',
          toastRelevant: toastContainer ? String(toastContainer.getAttribute('aria-relevant') || '').trim() : ''
        };
      });
      if (applyState.feedbackHidden || applyState.feedbackRole !== 'alert') throw new Error('public apply feedback live region missing');
      if (applyState.unitErrorHidden) throw new Error('public apply unit error not exposed');
      if (applyState.emailInvalid !== 'true' || !applyState.emailErrorMessage) throw new Error('public apply email error semantics missing');
      if (!applyState.authDocErrorMessage) throw new Error('public apply auth document errormessage missing');
      if (applyState.toastLive !== 'polite' || !applyState.toastRelevant) throw new Error('toast container live region missing');

      await gotoHash(page, 'apply-unit-contact-status', { handleUnsaved: false });
      await page.waitForSelector('#unit-contact-status-form', { timeout: 20000 });
      await page.click('#unit-contact-status-form button[type="submit"]');
      await page.waitForFunction(() => {
        const feedback = document.getElementById('unit-contact-status-feedback');
        return !!feedback && !feedback.hidden;
      }, { timeout: 10000 });
      const statusState = await page.evaluate(() => {
        const feedback = document.getElementById('unit-contact-status-feedback');
        const email = document.getElementById('uca-status-email');
        return {
          feedbackRole: feedback ? String(feedback.getAttribute('role') || '').trim() : '',
          emailInvalid: email ? String(email.getAttribute('aria-invalid') || '').trim() : '',
          emailErrorMessage: email ? String(email.getAttribute('aria-errormessage') || '').trim() : ''
        };
      });
      if (statusState.feedbackRole !== 'alert') throw new Error('public status feedback live region missing');
      if (statusState.emailInvalid !== 'true' || !statusState.emailErrorMessage) throw new Error('public status email error semantics missing');
      return 'public validation semantics ready';
    });

    await runStep(results, 'A11Y-04', 'Admin', 'Authenticated shell exposes main landmark and unit switch label', async () => {
      await login(page, 'easonwu', '2wsx#EDC');
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => {
        const skipLink = document.querySelector('.skip-link');
        const main = document.getElementById('app');
        const switcher = document.getElementById('header-unit-switch');
        return {
          skipHref: skipLink ? String(skipLink.getAttribute('href') || '').trim() : '',
          mainRole: main ? String(main.getAttribute('role') || '').trim() : '',
          mainLabelledBy: main ? String(main.getAttribute('aria-labelledby') || '').trim() : '',
          hasSwitcher: !!switcher,
          switcherLabel: switcher ? String(switcher.getAttribute('aria-label') || '').trim() : ''
        };
      });
      if (state.skipHref !== '#app') throw new Error('authenticated skip link missing');
      if (state.mainRole !== 'main') throw new Error('authenticated main landmark missing');
      if (!state.mainLabelledBy) throw new Error('authenticated main aria-labelledby missing');
      if (state.hasSwitcher && !state.switcherLabel) throw new Error('unit switch aria-label missing');
      return 'shell landmarks ready';
    });

    await runStep(results, 'A11Y-05', 'Admin', 'Key tables expose captions and scoped headers', async () => {
      const checks = [];

      await gotoHash(page, 'users');
      await waitForRouteSurface(page, '#system-users-page-limit');
      checks.push({ route: 'users', tables: await collectTableSemantics(page) });

      await gotoHash(page, 'training');
      await page.waitForFunction(() => document.querySelectorAll('#app table').length > 0, { timeout: 10000 });
      checks.push({ route: 'training', tables: await collectTableSemantics(page) });

      await gotoHash(page, 'checklist');
      await waitForRouteSurface(page, '#cl-list-keyword');
      const checklistFiltersReady = await page.evaluate(() => {
        const keyword = document.getElementById('cl-list-keyword');
        const status = document.getElementById('cl-list-status');
        const keywordLabel = keyword && keyword.closest('.form-group') && keyword.closest('.form-group').querySelector('.form-label');
        const statusLabel = status && status.closest('.form-group') && status.closest('.form-group').querySelector('.form-label');
        return !!keyword && !!status && !!keywordLabel && !!statusLabel;
      });
      if (!checklistFiltersReady) throw new Error('checklist filter labels missing');

      await gotoHash(page, 'list');
      await waitForRouteSurface(page, '#search-input');
      checks.push({ route: 'cases', tables: await collectTableSemantics(page) });

      const failures = checks.filter((entry) => !entry.tables.length || entry.tables.some((table) => !table.caption || table.headerCount === 0 || table.scopedHeaders !== table.headerCount));
      if (failures.length) {
        throw new Error(`table semantics incomplete on ${failures.map((entry) => entry.route).join(', ')}`);
      }
      return checks.map((entry) => `${entry.route}:${entry.tables.length}`).join(', ');
    });
  } finally {
    finalizeResults(results);
    writeJson(RESULT_PATH, results);
    await browser.close();
  }

  if (results.summary && results.summary.failed > 0) {
    process.exit(1);
  }
})();
