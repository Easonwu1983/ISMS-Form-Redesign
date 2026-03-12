(function () {
  const DATA_KEY = 'cats_data';
  const CHECKLIST_KEY = 'cats_checklists';
  const TRAINING_KEY = 'cats_training_hours';
  const SYSTEM_USERS_CONTRACT_VERSION = '2026-03-12';
  const CHECKLIST_CONTRACT_VERSION = '2026-03-12';
  const TRAINING_CONTRACT_VERSION = '2026-03-12';
  const CORRECTIVE_ACTION_CONTRACT_VERSION = '2026-03-12';
  const DEFAULT_BACKEND_BASE = 'http://127.0.0.1:8791';
  const CHECKLIST_STATUS_DRAFT = '\u8349\u7a3f';
  const TRAINING_STATUSES = {
    DRAFT: '\u66ab\u5b58',
    PENDING_SIGNOFF: '\u5f85\u7c3d\u6838',
    SUBMITTED: '\u5df2\u5b8c\u6210\u586b\u5831',
    RETURNED: '\u9000\u56de\u66f4\u6b63'
  };
  const CASE_STATUSES = {
    PENDING: '\u5f85\u77ef\u6b63',
    PROPOSED: '\u5df2\u63d0\u6848',
    REVIEWING: '\u5be9\u6838\u4e2d',
    TRACKING: '\u8ffd\u8e64\u4e2d',
    CLOSED: '\u7d50\u6848'
  };
  const REVIEW_DECISIONS = {
    START_REVIEW: 'start_review',
    CLOSE: 'close',
    TRACKING: 'tracking'
  };
  const TRACKING_REVIEW_DECISIONS = {
    CLOSE: 'close',
    CONTINUE: 'continue'
  };
  const TRACKING_RESULTS = {
    REQUEST_CLOSE: '\u64ec\u8acb\u540c\u610f\u7d50\u6848',
    CONTINUE: '\u5efa\u8b70\u6301\u7e8c\u8ffd\u8e64'
  };

  function cleanText(value) {
    return String(value || '').trim();
  }

  function cleanArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function unwrapStore(raw, fallback) {
    if (!raw) return typeof fallback === 'function' ? fallback() : fallback;
    let parsed = raw;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (_) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }
    }
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
      return parsed.data;
    }
    return parsed;
  }

  function getRuntimeConfig() {
    return window.__M365_UNIT_CONTACT_CONFIG__ || {};
  }

  function getEndpoint(name, fallback) {
    const config = getRuntimeConfig();
    const overrideBase = cleanText(window.__ISMS_M365_MIGRATION_BASE__) || DEFAULT_BACKEND_BASE;
    if (name === 'systemUsersEndpoint') return cleanText(config[name]) || (overrideBase + '/api/system-users');
    if (name === 'checklistEndpoint') return cleanText(config[name]) || (overrideBase + '/api/checklists');
    if (name === 'trainingRostersEndpoint') return cleanText(config[name]) || (overrideBase + '/api/training/rosters');
    if (name === 'trainingFormsEndpoint') return cleanText(config[name]) || (overrideBase + '/api/training/forms');
    if (name === 'correctiveActionsEndpoint') return cleanText(config[name]) || (overrideBase + '/api/corrective-actions');
    return cleanText(config[name]) || fallback;
  }

  async function requestJson(url, options) {
    const requestOptions = options || {};
    const response = await fetch(url, {
      method: requestOptions.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(requestOptions.headers || {})
      },
      body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
      credentials: 'omit'
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        parsed = { ok: false, message: text };
      }
    }
    if (!response.ok) {
      throw new Error(cleanText(parsed && (parsed.message || parsed.error || parsed.detail)) || ('HTTP ' + response.status));
    }
    return parsed || { ok: true };
  }

  function buildEnvelope(action, payload, contractVersion) {
    return {
      action: action,
      payload: payload && typeof payload === 'object' ? payload : {},
      clientContext: {
        contractVersion: contractVersion,
        source: 'browser-m365-live-migration',
        frontendOrigin: window.location.origin,
        frontendHash: String(window.location.hash || ''),
        sentAt: new Date().toISOString()
      }
    };
  }

  function getMigrationStores() {
    const data = unwrapStore(localStorage.getItem(DATA_KEY), function () { return { users: [], items: [] }; }) || { users: [], items: [] };
    const checklists = unwrapStore(localStorage.getItem(CHECKLIST_KEY), function () { return { items: [] }; }) || { items: [] };
    const training = unwrapStore(localStorage.getItem(TRAINING_KEY), function () { return { forms: [], rosters: [] }; }) || { forms: [], rosters: [] };
    return {
      users: cleanArray(data.users),
      correctiveActions: cleanArray(data.items),
      checklists: cleanArray(checklists.items),
      trainingForms: cleanArray(training.forms),
      trainingRosters: cleanArray(training.rosters)
    };
  }

  async function migrateUsers(report, stores) {
    const endpoint = getEndpoint('systemUsersEndpoint', '/api/system-users');
    for (const user of stores.users) {
      const username = cleanText(user && user.username);
      if (!username) continue;
      try {
        await requestJson(endpoint + '/upsert', {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': SYSTEM_USERS_CONTRACT_VERSION },
          body: buildEnvelope('system-user.upsert', user, SYSTEM_USERS_CONTRACT_VERSION)
        });
        report.users.success += 1;
      } catch (error) {
        report.users.failed.push({ username, error: cleanText(error && error.message || error) });
      }
    }
  }

  async function migrateChecklists(report, stores) {
    const endpoint = getEndpoint('checklistEndpoint', '/api/checklists');
    for (const item of stores.checklists) {
      const id = cleanText(item && item.id);
      if (!id) continue;
      try {
        await requestJson(endpoint + '/' + encodeURIComponent(id) + '/save-draft', {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': CHECKLIST_CONTRACT_VERSION },
          body: buildEnvelope('checklist.save-draft', item, CHECKLIST_CONTRACT_VERSION)
        });
        if (cleanText(item.status) !== CHECKLIST_STATUS_DRAFT) {
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/submit', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': CHECKLIST_CONTRACT_VERSION },
            body: buildEnvelope('checklist.submit', item, CHECKLIST_CONTRACT_VERSION)
          });
        }
        report.checklists.success += 1;
      } catch (error) {
        report.checklists.failed.push({ id, error: cleanText(error && error.message || error) });
      }
    }
  }

  async function migrateTrainingRosters(report, stores) {
    const endpoint = getEndpoint('trainingRostersEndpoint', '/api/training/rosters');
    for (const roster of stores.trainingRosters) {
      const id = cleanText(roster && roster.id) || cleanText(roster && roster.name);
      if (!id) continue;
      try {
        await requestJson(endpoint + '/upsert', {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': TRAINING_CONTRACT_VERSION },
          body: buildEnvelope('training.roster.upsert', roster, TRAINING_CONTRACT_VERSION)
        });
        report.trainingRosters.success += 1;
      } catch (error) {
        report.trainingRosters.failed.push({ id, error: cleanText(error && error.message || error) });
      }
    }
  }

  async function migrateTrainingForms(report, stores) {
    const endpoint = getEndpoint('trainingFormsEndpoint', '/api/training/forms');
    for (const form of stores.trainingForms) {
      const id = cleanText(form && form.id);
      if (!id) continue;
      try {
        await requestJson(endpoint + '/' + encodeURIComponent(id) + '/save-draft', {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': TRAINING_CONTRACT_VERSION },
          body: buildEnvelope('training.form.save-draft', form, TRAINING_CONTRACT_VERSION)
        });
        const status = cleanText(form.status);
        if (status === TRAINING_STATUSES.PENDING_SIGNOFF || status === TRAINING_STATUSES.RETURNED || status === TRAINING_STATUSES.SUBMITTED) {
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/submit-step-one', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': TRAINING_CONTRACT_VERSION },
            body: buildEnvelope('training.form.submit-step-one', form, TRAINING_CONTRACT_VERSION)
          });
        }
        if (status === TRAINING_STATUSES.RETURNED) {
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/return', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': TRAINING_CONTRACT_VERSION },
            body: buildEnvelope('training.form.return', form, TRAINING_CONTRACT_VERSION)
          });
        }
        if (status === TRAINING_STATUSES.SUBMITTED) {
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/finalize', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': TRAINING_CONTRACT_VERSION },
            body: buildEnvelope('training.form.finalize', form, TRAINING_CONTRACT_VERSION)
          });
        }
        report.trainingForms.success += 1;
      } catch (error) {
        report.trainingForms.failed.push({ id, error: cleanText(error && error.message || error) });
      }
    }
  }

  async function advanceCorrectiveAction(item, endpoint) {
    const id = cleanText(item && item.id);
    if (!id) return;
    const status = cleanText(item.status);
    if (status === CASE_STATUSES.PENDING) return;
    await requestJson(endpoint + '/' + encodeURIComponent(id) + '/respond', {
      method: 'POST',
      headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
      body: buildEnvelope('corrective-action.respond', item, CORRECTIVE_ACTION_CONTRACT_VERSION)
    });
    if (status === CASE_STATUSES.PROPOSED) return;
    await requestJson(endpoint + '/' + encodeURIComponent(id) + '/review', {
      method: 'POST',
      headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
      body: buildEnvelope('corrective-action.review', {
        ...item,
        decision: REVIEW_DECISIONS.START_REVIEW,
        reviewer: item.reviewer || item.handlerName || item.proposerName
      }, CORRECTIVE_ACTION_CONTRACT_VERSION)
    });
    if (status === CASE_STATUSES.REVIEWING) return;
    if (status === CASE_STATUSES.TRACKING || status === CASE_STATUSES.CLOSED) {
      const existingTrackings = cleanArray(item.trackings);
      if (existingTrackings.length || item.pendingTracking) {
        await requestJson(endpoint + '/' + encodeURIComponent(id) + '/review', {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
          body: buildEnvelope('corrective-action.review', {
            ...item,
            decision: REVIEW_DECISIONS.TRACKING,
            reviewer: item.reviewer || item.handlerName || item.proposerName
          }, CORRECTIVE_ACTION_CONTRACT_VERSION)
        });
        for (let index = 0; index < existingTrackings.length; index += 1) {
          const tracking = existingTrackings[index];
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/tracking-submit', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
            body: buildEnvelope('corrective-action.tracking.submit', {
              ...tracking,
              tracker: tracking.tracker || item.handlerName,
              result: index === existingTrackings.length - 1 && status === CASE_STATUSES.CLOSED ? TRACKING_RESULTS.REQUEST_CLOSE : (tracking.result || TRACKING_RESULTS.CONTINUE)
            }, CORRECTIVE_ACTION_CONTRACT_VERSION)
          });
          await requestJson(endpoint + '/' + encodeURIComponent(id) + '/tracking-review', {
            method: 'POST',
            headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
            body: buildEnvelope('corrective-action.tracking.review', {
              decision: index === existingTrackings.length - 1 && status === CASE_STATUSES.CLOSED ? TRACKING_REVIEW_DECISIONS.CLOSE : TRACKING_REVIEW_DECISIONS.CONTINUE,
              reviewer: tracking.reviewer || item.reviewer || item.handlerName
            }, CORRECTIVE_ACTION_CONTRACT_VERSION)
          });
        }
        return;
      }
      await requestJson(endpoint + '/' + encodeURIComponent(id) + '/review', {
        method: 'POST',
        headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
        body: buildEnvelope('corrective-action.review', {
          ...item,
          decision: status === CASE_STATUSES.CLOSED ? REVIEW_DECISIONS.CLOSE : REVIEW_DECISIONS.TRACKING,
          reviewer: item.reviewer || item.handlerName || item.proposerName
        }, CORRECTIVE_ACTION_CONTRACT_VERSION)
      });
    }
  }

  async function migrateCorrectiveActions(report, stores) {
    const endpoint = getEndpoint('correctiveActionsEndpoint', '/api/corrective-actions');
    for (const item of stores.correctiveActions) {
      const id = cleanText(item && item.id);
      if (!id) continue;
      try {
        await requestJson(endpoint, {
          method: 'POST',
          headers: { 'X-ISMS-Contract-Version': CORRECTIVE_ACTION_CONTRACT_VERSION },
          body: buildEnvelope('corrective-action.create', item, CORRECTIVE_ACTION_CONTRACT_VERSION)
        });
        await advanceCorrectiveAction(item, endpoint);
        report.correctiveActions.success += 1;
      } catch (error) {
        report.correctiveActions.failed.push({ id, error: cleanText(error && error.message || error) });
      }
    }
  }

  async function runMigration() {
    const stores = getMigrationStores();
    const report = {
      startedAt: new Date().toISOString(),
      backendBase: cleanText(window.__ISMS_M365_MIGRATION_BASE__) || DEFAULT_BACKEND_BASE,
      users: { total: stores.users.length, success: 0, failed: [] },
      correctiveActions: { total: stores.correctiveActions.length, success: 0, failed: [] },
      checklists: { total: stores.checklists.length, success: 0, failed: [] },
      trainingForms: { total: stores.trainingForms.length, success: 0, failed: [] },
      trainingRosters: { total: stores.trainingRosters.length, success: 0, failed: [] }
    };

    console.group('ISMS browser -> M365 live migration');
    console.log('Stores summary', report);
    await migrateUsers(report, stores);
    await migrateCorrectiveActions(report, stores);
    await migrateChecklists(report, stores);
    await migrateTrainingRosters(report, stores);
    await migrateTrainingForms(report, stores);
    report.finishedAt = new Date().toISOString();
    console.log('Migration report', report);
    console.groupEnd();
    window.__ISMS_M365_LIVE_MIGRATION_REPORT__ = report;
    return report;
  }

  runMigration().then(function (report) {
    console.log('ISMS M365 live migration completed.', report);
  }).catch(function (error) {
    console.error('ISMS M365 live migration failed.', error);
  });
})();