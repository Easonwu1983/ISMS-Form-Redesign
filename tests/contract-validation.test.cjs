'use strict';

// Tests for core contract validation functions across all API modules

describe('System User Contract', () => {
  const { validateSystemUserPayload, validatePasswordComplexity, cleanText, createError, parseSecurityRoles } = require('../m365/azure-function/system-user-api/src/shared/contract');

  test('rejects missing username', () => {
    expect(() => validateSystemUserPayload({ name: 'Test', email: 'test@ntu.edu.tw', role: '單位管理員', authorizedUnits: ['秘書室'], securityRoles: ['一級單位資安窗口'] }))
      .toThrow('Missing username');
  });

  test('rejects missing display name', () => {
    expect(() => validateSystemUserPayload({ username: 'test', email: 'test@ntu.edu.tw', role: '單位管理員', authorizedUnits: ['秘書室'], securityRoles: ['一級單位資安窗口'] }))
      .toThrow('Missing display name');
  });

  test('rejects missing email', () => {
    expect(() => validateSystemUserPayload({ username: 'test', name: 'Test', role: '單位管理員', authorizedUnits: ['秘書室'], securityRoles: ['一級單位資安窗口'] }))
      .toThrow('Missing email');
  });

  test('rejects unit admin without authorized units', () => {
    expect(() => validateSystemUserPayload({ username: 'test', name: 'Test', email: 'test@ntu.edu.tw', role: '單位管理員', authorizedUnits: [], securityRoles: ['一級單位資安窗口'] }))
      .toThrow('At least one authorized unit');
  });

  test('rejects unit admin without security roles', () => {
    expect(() => validateSystemUserPayload({ username: 'test', name: 'Test', email: 'test@ntu.edu.tw', role: '單位管理員', authorizedUnits: ['秘書室'], securityRoles: [] }))
      .toThrow('At least one security role');
  });

  test('accepts valid admin payload', () => {
    expect(() => validateSystemUserPayload({ username: 'admin', name: 'Admin', email: 'admin@ntu.edu.tw', role: '最高管理員' }))
      .not.toThrow();
  });

  test('accepts valid unit admin payload', () => {
    expect(() => validateSystemUserPayload({ username: 'test', name: 'Test', email: 'test@ntu.edu.tw', role: '單位管理員', authorizedUnits: ['秘書室'], securityRoles: ['一級單位資安窗口'] }))
      .not.toThrow();
  });

  test('password complexity requires 8+ chars', () => {
    expect(() => validatePasswordComplexity('Ab1!xyz')).toThrow('at least 8');
  });

  test('password complexity requires lowercase', () => {
    expect(() => validatePasswordComplexity('ABCDEFG1!')).toThrow('lowercase');
  });

  test('password complexity requires uppercase', () => {
    expect(() => validatePasswordComplexity('abcdefg1!')).toThrow('uppercase');
  });

  test('password complexity requires number', () => {
    expect(() => validatePasswordComplexity('Abcdefgh!')).toThrow('number');
  });

  test('password complexity accepts valid password', () => {
    expect(() => validatePasswordComplexity('Test1234!')).not.toThrow();
  });

  test('parseSecurityRoles handles array', () => {
    expect(parseSecurityRoles(['一級單位資安窗口', '二級單位資安窗口'])).toEqual(['一級單位資安窗口', '二級單位資安窗口']);
  });

  test('parseSecurityRoles handles empty', () => {
    expect(parseSecurityRoles([])).toEqual([]);
  });

  test('cleanText trims whitespace', () => {
    expect(cleanText('  hello  ')).toBe('hello');
  });
});

describe('Corrective Action Contract', () => {
  const { STATUSES, ACTIONS, validateCreatePayload, normalizeCreatePayload } = require('../m365/azure-function/corrective-action-api/src/shared/contract');

  test('STATUSES has all 6 values', () => {
    expect(Object.keys(STATUSES)).toHaveLength(6);
    expect(STATUSES.CREATED).toBe('開立');
    expect(STATUSES.CLOSED).toBe('結案');
  });

  test('ACTIONS has all expected actions', () => {
    expect(ACTIONS.CREATE).toBeDefined();
    expect(ACTIONS.RESPOND).toBeDefined();
    expect(ACTIONS.REVIEW).toBeDefined();
  });

  test('validateCreatePayload rejects missing problemDesc', () => {
    expect(() => validateCreatePayload({
      proposerUnit: '秘書室', proposerName: 'Test', proposerDate: '2026-04-02',
      handlerUnit: '秘書室', handlerName: 'Handler',
      deficiencyType: '主要缺失', source: '內部稽核', category: ['人員'],
      correctiveDueDate: '2026-05-01'
    })).toThrow();
  });
});

describe('Checklist Contract', () => {
  const { STATUSES, ACTIONS } = require('../m365/azure-function/checklist-api/src/shared/contract');

  test('STATUSES has draft and submitted', () => {
    expect(STATUSES.DRAFT).toBe('草稿');
    expect(STATUSES.SUBMITTED).toBe('已送出');
  });

  test('ACTIONS has save_draft and submit', () => {
    expect(ACTIONS.SAVE_DRAFT).toBeDefined();
    expect(ACTIONS.SUBMIT).toBeDefined();
  });
});

describe('Training Contract', () => {
  const { FORM_STATUSES, FORM_ACTIONS, ROSTER_ACTIONS } = require('../m365/azure-function/training-api/src/shared/contract');

  test('FORM_STATUSES has 4 values', () => {
    expect(FORM_STATUSES.DRAFT).toBe('暫存');
    expect(FORM_STATUSES.PENDING_SIGNOFF).toBe('待簽核');
    expect(FORM_STATUSES.SUBMITTED).toBe('已完成填報');
    expect(FORM_STATUSES.RETURNED).toBe('退回更正');
  });

  test('ROSTER_ACTIONS has upsert and delete', () => {
    expect(ROSTER_ACTIONS.UPSERT).toBeDefined();
    expect(ROSTER_ACTIONS.DELETE).toBeDefined();
  });
});

describe('Attachment Contract', () => {
  const { ATTACHMENT_ACTIONS, sanitizeFileName, sanitizePathSegment } = require('../m365/azure-function/attachment-api/src/shared/contract');

  test('sanitizeFileName removes dangerous characters', () => {
    const result = sanitizeFileName('test<file>.pdf');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  test('sanitizePathSegment returns fallback for empty', () => {
    expect(sanitizePathSegment('', 'default')).toBe('default');
  });

  test('ATTACHMENT_ACTIONS has upload and delete', () => {
    expect(ATTACHMENT_ACTIONS.UPLOAD).toBeDefined();
    expect(ATTACHMENT_ACTIONS.DELETE).toBeDefined();
  });
});
