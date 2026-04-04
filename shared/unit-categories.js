// @ts-check
/**
 * 單位分類共用常數 — 全專案唯一真實來源 (Single Source of Truth)
 *
 * 分類依據：units-data.json 的組織代碼
 *   0.01-0.27 → 行政單位
 *   0.37-0.40 → 特殊教學單位（歸學術）
 *   0.41-0.48 → 校級研究中心（歸中心）
 *   0.51-0.74 → 學院（歸學術，關鍵字自動判斷）
 *   0.80      → 分部（歸行政）
 *   0.A1-0.Q3 → 各類研究中心/委員會（歸中心，關鍵字自動判斷）
 *
 * 前端 (app.js, unit-module.js, asset-inventory-module.js) 和
 * 後端 (unit-governance-backend.cjs) 都引用這份白名單。
 * 新增/移除單位時只需改這裡。
 */

/**
 * 行政單位白名單（代碼 0.01-0.27 + 0.80）
 * 名稱含「中心」「辦公室」但實際是行政編制的放這裡
 */
var ADMIN_UNITS = [
  '校長室',                       // 0.01
  '稽核室',                       // 0.06
  '秘書室',                       // 0.11
  '教務處',                       // 0.12
  '學生事務處',                    // 0.13
  '總務處',                       // 0.14
  '研究發展處',                    // 0.15
  '國際事務處',                    // 0.17
  '財務管理處',                    // 0.18
  '圖書館',                       // 0.19
  '主計室',                       // 0.20
  '人事室',                       // 0.21
  '計算機及資訊網路中心',            // 0.22
  '出版中心',                      // 0.23
  '環境保護暨職業安全衛生中心',       // 0.24
  '法務處',                       // 0.27
  '學校分部總辦事處'                // 0.80
];

/**
 * 學術單位白名單（嚴格比對，依據 https://www.ntu.edu.tw/academics/academics.html）
 * 只有這 17 個單位歸學術，其他全部靠關鍵字歸中心
 */
var ACADEMIC_UNITS = [
  '文學院',                        // 0.51
  '理學院',                        // 0.52
  '社會科學院',                     // 0.53
  '醫學院',                        // 0.54
  '工學院',                        // 0.55
  '生物資源暨農學院',                // 0.56
  '管理學院',                       // 0.58 (管理學院 in units-data)
  '公共衛生學院',                    // 0.58
  '電機資訊學院',                    // 0.59
  '法律學院',                       // 0.60
  '生命科學院',                     // 0.61
  '國際政經學院',                    // 0.74
  '國際學院',                       // 0.72
  '創新設計學院',                    // 0.K6
  '重點科技研究學院',                // 0.73
  '共同教育中心',                    // 0.37
  '進修推廣學院'                    // 0.40
];

/**
 * 不應出現在系統下拉選單的單位
 * 醫院/分院不在資安稽核範圍內，系統層級或已廢止的也隱藏
 */
var HIDDEN_UNITS = [
  '國立臺灣大學系統',
  '臺灣永續棧',
  '臺大醫院環境及職業醫學部',
  '臺大新竹分院',
  '臺大雲林分院',
  '臺大金山分院',
  '臺大癌醫中心醫院',
  '臺大新竹生醫園區分院'
];

/** 分類名稱常數 */
var CATEGORY_ADMIN = '行政單位';
var CATEGORY_ACADEMIC = '學術單位';
var CATEGORY_CENTER = '中心 / 研究單位';

/** 分類順序 */
var CATEGORY_ORDER = [CATEGORY_ADMIN, CATEGORY_ACADEMIC, CATEGORY_CENTER];

/**
 * 判斷一級單位的分類
 * @param {string} unitName — 一級單位名稱（不含「／」後的二級）
 * @returns {string} CATEGORY_ADMIN | CATEGORY_ACADEMIC | CATEGORY_CENTER
 */
function categorizeUnit(unitName) {
  var unit = String(unitName || '').split('\uFF0F')[0].trim();
  if (!unit) return CATEGORY_ADMIN;
  if (ADMIN_UNITS.indexOf(unit) >= 0) return CATEGORY_ADMIN;
  if (ACADEMIC_UNITS.indexOf(unit) >= 0) return CATEGORY_ACADEMIC;
  // 不在白名單的 → 除了 fallback 行政外，其他都歸中心/研究單位
  var centerKw = ['中心', '研究中心', '研究院', '辦公室', '委員會', '聯盟', '聯合辦公室', '館', '基金會', '學院', '學程', '研究所'];
  if (centerKw.some(function (k) { return unit.indexOf(k) >= 0; })) return CATEGORY_CENTER;
  return CATEGORY_ADMIN;
}

// 支援前端 (IIFE global) 和後端 (CJS require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ADMIN_UNITS: ADMIN_UNITS, ACADEMIC_UNITS: ACADEMIC_UNITS, HIDDEN_UNITS: HIDDEN_UNITS, CATEGORY_ADMIN: CATEGORY_ADMIN, CATEGORY_ACADEMIC: CATEGORY_ACADEMIC, CATEGORY_CENTER: CATEGORY_CENTER, CATEGORY_ORDER: CATEGORY_ORDER, categorizeUnit: categorizeUnit };
}
if (typeof window !== 'undefined') {
  window.__UNIT_CATEGORIES__ = { ADMIN_UNITS: ADMIN_UNITS, ACADEMIC_UNITS: ACADEMIC_UNITS, HIDDEN_UNITS: HIDDEN_UNITS, CATEGORY_ADMIN: CATEGORY_ADMIN, CATEGORY_ACADEMIC: CATEGORY_ACADEMIC, CATEGORY_CENTER: CATEGORY_CENTER, CATEGORY_ORDER: CATEGORY_ORDER, categorizeUnit: categorizeUnit };
}
