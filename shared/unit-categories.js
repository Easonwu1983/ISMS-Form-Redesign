// @ts-check
/**
 * 單位分類共用常數 — 全專案唯一真實來源 (Single Source of Truth)
 *
 * 前端 (app.js, unit-module.js, asset-inventory-module.js) 和
 * 後端 (unit-governance-backend.cjs) 都引用這份白名單。
 * 新增/移除行政或學術單位時只需改這裡。
 */

/** 行政單位白名單（依據 https://www.ntu.edu.tw/administration/administration.html） */
const ADMIN_UNITS = [
  // 主要行政單位
  '秘書室',
  '教務處',
  '學生事務處',
  '總務處',
  '研究發展處',
  '國際事務處',
  '財務管理處',
  '法務處',
  '稽核室',
  '主計室',
  '人事室',
  '圖書館',
  '計算機及資訊網路中心',
  '出版中心',
  '環境保護暨職業安全衛生中心',
  // 其他行政單位
  '研究誠信辦公室',
  '永續辦公室',
  '校務研究辦公室',
  '學校分部總辦事處',
  '藝文中心',
  '校園規劃小組',
  '校友中心',
  '保健中心',
  '校園安全中心',
];

/** 學術單位白名單（依據 https://www.ntu.edu.tw/academics/academics.html） */
const ACADEMIC_UNITS = [
  '共同教育中心',
  '進修推廣學院'
];

/** 分類名稱常數 */
const CATEGORY_ADMIN = '行政單位';
const CATEGORY_ACADEMIC = '學術單位';
const CATEGORY_CENTER = '中心 / 研究單位';

/** 分類順序 */
const CATEGORY_ORDER = [CATEGORY_ADMIN, CATEGORY_ACADEMIC, CATEGORY_CENTER];

/**
 * 判斷一級單位的分類
 * @param {string} unitName — 一級單位名稱（不含「／」後的二級）
 * @returns {string} CATEGORY_ADMIN | CATEGORY_ACADEMIC | CATEGORY_CENTER
 */
function categorizeUnit(unitName) {
  const unit = String(unitName || '').split('\uFF0F')[0].trim();
  if (!unit) return CATEGORY_ADMIN;
  if (ADMIN_UNITS.indexOf(unit) >= 0) return CATEGORY_ADMIN;
  if (ACADEMIC_UNITS.indexOf(unit) >= 0) return CATEGORY_ACADEMIC;
  const academicKw = ['學院', '學系', '研究所', '學位學程', '國際學院'];
  const centerKw = ['中心', '研究中心', '辦公室', '委員會', '聯盟', '聯合辦公室', '館'];
  if (academicKw.some(function (k) { return unit.indexOf(k) >= 0; })) return CATEGORY_ACADEMIC;
  if (centerKw.some(function (k) { return unit.indexOf(k) >= 0; })) return CATEGORY_CENTER;
  return CATEGORY_ADMIN;
}

// 支援前端 (IIFE global) 和後端 (CJS require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ADMIN_UNITS, ACADEMIC_UNITS, CATEGORY_ADMIN, CATEGORY_ACADEMIC, CATEGORY_CENTER, CATEGORY_ORDER, categorizeUnit };
}
if (typeof window !== 'undefined') {
  window.__UNIT_CATEGORIES__ = { ADMIN_UNITS: ADMIN_UNITS, ACADEMIC_UNITS: ACADEMIC_UNITS, CATEGORY_ADMIN: CATEGORY_ADMIN, CATEGORY_ACADEMIC: CATEGORY_ACADEMIC, CATEGORY_CENTER: CATEGORY_CENTER, CATEGORY_ORDER: CATEGORY_ORDER, categorizeUnit: categorizeUnit };
}
