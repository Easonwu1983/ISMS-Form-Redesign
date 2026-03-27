(function () {
  window.createCacheInvalidationModule = function createCacheInvalidationModule() {
    const SCOPES = Object.freeze({
      ALL: 'all',
      ACCESS_PROFILE: 'access-profile',
      ADMIN: 'admin',
      SYSTEM_USERS: 'system-users',
      UNIT_CONTACT_REVIEW: 'unit-contact-review',
      AUDIT_TRAIL: 'audit-trail',
      UNIT_GOVERNANCE: 'unit-governance',
      SECURITY_WINDOW: 'security-window',
      GOVERNANCE_SECURITY: 'governance-security',
      TRAINING: 'training',
      TRAINING_FORMS: 'training-forms',
      TRAINING_SUMMARY: 'training-summary',
      TRAINING_DASHBOARD: 'training-dashboard',
      TRAINING_ROSTERS: 'training-rosters',
      TRAINING_SIGNOFF: 'training-signoff',
      CHECKLISTS: 'checklists',
      CHECKLISTS_LIST: 'checklists-list',
      CHECKLISTS_SUMMARY: 'checklists-summary',
      CHECKLISTS_TEMPLATE: 'checklists-template',
      CHECKLIST_EVIDENCE: 'checklist-evidence'
    });

    const ALIASES = Object.freeze({
      [SCOPES.GOVERNANCE_SECURITY]: [SCOPES.GOVERNANCE_SECURITY, SCOPES.UNIT_GOVERNANCE, SCOPES.SECURITY_WINDOW],
      [SCOPES.ADMIN]: [SCOPES.ADMIN, SCOPES.SYSTEM_USERS, SCOPES.UNIT_CONTACT_REVIEW, SCOPES.AUDIT_TRAIL, SCOPES.GOVERNANCE_SECURITY],
      [SCOPES.TRAINING]: [SCOPES.TRAINING, SCOPES.TRAINING_FORMS, SCOPES.TRAINING_SUMMARY, SCOPES.TRAINING_DASHBOARD, SCOPES.TRAINING_ROSTERS, SCOPES.TRAINING_SIGNOFF],
      [SCOPES.CHECKLISTS]: [SCOPES.CHECKLISTS, SCOPES.CHECKLISTS_LIST, SCOPES.CHECKLISTS_SUMMARY, SCOPES.CHECKLISTS_TEMPLATE, SCOPES.CHECKLIST_EVIDENCE]
    });

    function normalizeScope(scope, fallback) {
      const normalized = String(scope || '').trim().toLowerCase();
      if (normalized) return normalized;
      return String(fallback || SCOPES.ALL).trim().toLowerCase() || SCOPES.ALL;
    }

    function normalizeScopes(scopes, fallback) {
      return Array.from(new Set((Array.isArray(scopes) ? scopes : [scopes])
        .map(function (scope) { return normalizeScope(scope, fallback); })
        .filter(Boolean)));
    }

    function expandScope(scope) {
      const normalized = normalizeScope(scope, '');
      if (!normalized) return [];
      return normalizeScopes(ALIASES[normalized] || [normalized], normalized);
    }

    function matchesScope(scope, acceptedScopes) {
      const expandedScope = expandScope(scope);
      const expandedAccepted = normalizeScopes(acceptedScopes, '').flatMap(expandScope);
      if (!expandedScope.length || !expandedAccepted.length) return false;
      return expandedScope.some(function (entry) { return expandedAccepted.includes(entry); });
    }

    function buildDetail(scope, reason, extra) {
      const extras = extra && typeof extra === 'object' ? extra : {};
      return {
        ...extras,
        scope: normalizeScope(scope, SCOPES.ALL),
        reason: String(reason || 'cache-invalidated').trim() || 'cache-invalidated',
        at: String(extras.at || '').trim() || new Date().toISOString()
      };
    }

    function dispatch(scope, reason, extra) {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
      const detail = buildDetail(scope, reason, extra);
      try {
        window.dispatchEvent(new CustomEvent('isms:cache-invalidate', { detail: detail }));
      } catch (_) {
        // Ignore browser event failures.
      }
    }

    return {
      SCOPES: SCOPES,
      normalizeScope: normalizeScope,
      normalizeScopes: normalizeScopes,
      expandScope: expandScope,
      matchesScope: matchesScope,
      buildDetail: buildDetail,
      dispatch: dispatch
    };
  };

  if (typeof window !== 'undefined' && typeof window.createCacheInvalidationModule === 'function' && !window.__ISMS_CACHE_INVALIDATION__) {
    window.__ISMS_CACHE_INVALIDATION__ = window.createCacheInvalidationModule();
  }
})();
