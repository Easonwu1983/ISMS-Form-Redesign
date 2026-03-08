const path = require('path');
const {
  attachDiagnostics,
  createResultEnvelope,
  currentHash,
  finalizeResults,
  gotoHash,
  launchBrowser,
  login,
  logout,
  resetApp,
  runStep,
  writeJson
} = require('./_role-test-utils.cjs');

const OUT_DIR = path.join(process.cwd(), 'test-artifacts', 'role-flow-round3-2026-03-07');
const RESULT_PATH = path.join(OUT_DIR, 'permission-matrix.json');
const ROUTES = ['dashboard', 'list', 'create', 'checklist', 'checklist-fill', 'training', 'training-fill', 'users', 'login-log', 'checklist-manage', 'unit-review', 'training-roster'];
const ROLES = [
  {
    id: 'admin',
    title: '最高管理者',
    auth: { username: 'admin', password: 'admin123' },
    allowed: new Set(ROUTES)
  },
  {
    id: 'unit1',
    title: '單位窗口',
    auth: { username: 'unit1', password: 'unit123' },
    allowed: new Set(['dashboard', 'list', 'checklist', 'checklist-fill', 'training', 'training-fill'])
  },
  {
    id: 'user1',
    title: '單位代理窗口',
    auth: { username: 'user1', password: 'user123' },
    allowed: new Set(['dashboard', 'list', 'checklist', 'checklist-fill', 'training', 'training-fill'])
  },
  {
    id: 'viewer1',
    title: '跨單位檢視者',
    auth: { username: 'viewer1', password: 'viewer123' },
    allowed: new Set(['dashboard', 'list', 'checklist', 'training'])
  }
];

function isRouteAccessible(route, hash) {
  return hash === '#' + route || hash.startsWith('#' + route + '/');
}

(async () => {
  const results = createResultEnvelope({ routes: ROUTES, roles: {}, steps: [] });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  attachDiagnostics(page, results);
  try {
    await resetApp(page);
    for (const role of ROLES) {
      await runStep(results, 'MATRIX-' + role.id.toUpperCase(), role.title, '頝舐甈??拚', async () => {
        await login(page, role.auth.username, role.auth.password);
        const whitelist = await page.evaluate(() => window._routeWhitelist ? window._routeWhitelist() : {});
        const matrix = {};
        for (const route of ROUTES) {
          await gotoHash(page, route);
          await page.waitForTimeout(180);
          const hash = await currentHash(page);
          const accessible = isRouteAccessible(route, hash);
          matrix[route] = {
            expected: role.allowed.has(route),
            actual: accessible,
            finalHash: hash
          };
        }
        const mismatches = Object.entries(matrix).filter(([, entry]) => entry.expected !== entry.actual);
        results.roles[role.id] = {
          title: role.title,
          whitelist,
          matrix,
          mismatches
        };
        await logout(page);
        if (mismatches.length) {
          throw new Error('permission mismatches: ' + mismatches.map(([route, entry]) => `${route}:${entry.finalHash}`).join(', '));
        }
        return 'all routes matched expected permission matrix';
      });
    }
  } finally {
    await browser.close();
    writeJson(RESULT_PATH, finalizeResults(results));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

