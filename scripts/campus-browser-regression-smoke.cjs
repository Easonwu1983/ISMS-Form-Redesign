const path = require('path');

process.env.ISMS_CLOUDFLARE_PAGES_BASE = process.env.ISMS_CAMPUS_BROWSER_BASE || 'http://127.0.0.1:8088';
process.env.ISMS_UI_SMOKE_OUT = process.env.ISMS_CAMPUS_BROWSER_OUT || path.join(process.cwd(), 'logs', 'campus-browser-regression-smoke.json');

require('./cloudflare-pages-regression-smoke.cjs');
