const path = require('path');

process.env.ISMS_UNIT_CONTACT_PUBLIC_BASE = process.env.ISMS_CAMPUS_PUBLIC_BASE || 'http://127.0.0.1:8088';
process.env.ISMS_UNIT_CONTACT_PUBLIC_OUT = process.env.ISMS_CAMPUS_PUBLIC_OUT || path.join(process.cwd(), 'logs', 'campus-unit-contact-public-visual-smoke.json');

require('./unit-contact-public-visual-smoke.cjs');
