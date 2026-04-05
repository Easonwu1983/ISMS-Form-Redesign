// @ts-check
(function () {
  window.createAssetInventoryModule = function createAssetInventoryModule(deps) {
    const {
      currentUser,
      isAdmin,
      navigate,
      toast,
      esc,
      ic,
      fmt,
      refreshIcons,
      splitUnitValue,
      buildUnitCascadeControl,
      initUnitCascade,
      registerActionHandlers,
      addPageEventListener,
      registerPageCleanup,
      openConfirmDialog,
      runWithBusyState,
      CONFIG,
      ASSET_CATEGORIES
    } = deps;

    // -------------------------------------------------------
    // Constants
    // -------------------------------------------------------
    const CATEGORIES = {
      PE: { label: '\u4eba\u54e1', subs: ['\u5168\u8077\u540c\u4ec1', '\u7d04\u8058\u4eba\u54e1', '\u59d4\u5916\u5ee0\u5546', '\u5176\u4ed6'] },
      DC: { label: '\u8cc7\u8a0a-\u6587\u4ef6', subs: ['\u516c\u6587', '\u5831\u8868', '\u8868\u55ae', '\u8a08\u756b', '\u4f7f\u7528\u624b\u518a', '\u7cfb\u7d71\u6587\u4ef6', 'ISMS\u6587\u4ef6', '\u5176\u4ed6'] },
      DA: { label: '\u8cc7\u8a0a-\u8cc7\u6599', subs: ['\u6a94\u6848', '\u8cc7\u6599\u5eab', '\u7cfb\u7d71\u8a18\u9304', '\u500b\u4eba\u8cc7\u6599', '\u539f\u59cb\u7a0b\u5f0f\u78bc', '\u6578\u4f4d\u6191\u8b49', '\u5176\u4ed6'] },
      SW: { label: '\u8edf\u9ad4', subs: ['\u4f5c\u696d\u7cfb\u7d71', '\u61c9\u7528\u7cfb\u7d71\u7a0b\u5f0f', '\u5957\u88dd\u8edf\u9ad4', '\u5176\u4ed6'] },
      HW: { label: '\u786c\u9ad4\u8a2d\u5099', subs: ['\u500b\u4eba\u96fb\u8166', '\u53ef\u651c\u5f0f\u8a2d\u5099', '\u4f3a\u670d\u5668', '\u5132\u5b58\u7cfb\u7d71', '\u901a\u8a0a\u8a2d\u5099', '\u74b0\u5883\u57fa\u790e\u8a2d\u65bd', '\u7db2\u8def\u5370\u8868\u6a5f/\u591a\u529f\u80fd\u4e8b\u52d9\u6a5f', '\u5176\u4ed6'] },
      VM: { label: '\u865b\u64ec\u4e3b\u6a5f', subs: ['\u865b\u64ec\u4e3b\u6a5f'] },
      BS: { label: '\u696d\u52d9', subs: ['\u7cfb\u7d71\u7dad\u904b', '\u670d\u52d9', '\u5176\u4ed6'] }
    };

    const CIA_OPTIONS = ['\u666e', '\u4e2d', '\u9ad8'];
    const STATUS_OPTIONS = ['\u586b\u5831\u4e2d', '\u5f85\u7c3d\u6838', '\u5df2\u5b8c\u6210'];
    const CHANGE_TYPE_OPTIONS = ['\u65b0\u589e', '\u4fee\u6539', '\u522a\u9664', '\u7121\u7570\u52d5'];
    const RISK_LEVELS = { '\u4f4e': '1-2', '\u4e2d': '3-4', '\u9ad8': '6-9' };

    const CIA_VALUE_MAP = { '\u666e': 1, '\u4e2d': 2, '\u9ad8': 3 };

    // -- Complete control measures data (附表十) --
    const APPENDIX10_DATA = [
      { d: '存取控制', c: '帳號管理', l: '高', t: '應依機關規定之情況及條件，使用資通系統' },
      { d: '存取控制', c: '帳號管理', l: '高', t: '監控資通系統帳號，如發現帳號違常使用時回報管理者' },
      { d: '存取控制', c: '帳號管理', l: '高', t: '等級「中」之所有控制措施' },
      { d: '存取控制', c: '帳號管理', l: '中', t: '機關應定義各系統之閒置時間或可使用期限與使用情況及條件' },
      { d: '存取控制', c: '帳號管理', l: '中', t: '逾越機關所許可之閒置時間或可使用期限時，系統應自動將使用者登出' },
      { d: '存取控制', c: '帳號管理', l: '中', t: '等級「普」之所有控制措施' },
      { d: '存取控制', c: '帳號管理', l: '普', t: '建立帳號管理機制，包含帳號之申請、開通、停用及刪除之程序' },
      { d: '存取控制', c: '帳號管理', l: '普', t: '已逾期之臨時或緊急帳號應刪除或禁用' },
      { d: '存取控制', c: '帳號管理', l: '普', t: '資通系統閒置帳號應禁用' },
      { d: '存取控制', c: '帳號管理', l: '普', t: '定期審核資通系統帳號之建立、修改、啟用、禁用及刪除' },
      { d: '存取控制', c: '最小權限', l: '共通', t: '採最小權限原則，僅允許使用者依機關任務及業務功能完成指派任務所需之授權存取' },
      { d: '存取控制', c: '遠端存取', l: '高', t: '資通系統遠端存取之來源應為機關已預先定義及管理之存取控制點' },
      { d: '存取控制', c: '遠端存取', l: '高', t: '應定期審查機關所保留資通系統之遠端存取之設定' },
      { d: '存取控制', c: '遠端存取', l: '高', t: '等級「普」之所有控制措施' },
      { d: '存取控制', c: '遠端存取', l: '高、中', t: '每種遠端存取建立使用限制、連線需求及文件化' },
      { d: '存取控制', c: '遠端存取', l: '高、中', t: '使用者之權限檢查作業應於伺服器端完成' },
      { d: '存取控制', c: '遠端存取', l: '高、中', t: '應監控遠端存取機關內部網段或資通系統後臺之連線' },
      { d: '存取控制', c: '遠端存取', l: '高、中', t: '應採用加密機制' },
      { d: '存取控制', c: '遠端存取', l: '普', t: '對於每一種允許之遠端存取類型，均應先取得授權，建立使用限制' },
      { d: '事件日誌與可歸責', c: '記錄事件', l: '高', t: '訂定日誌之記錄時間週期及留存政策，並保留日誌至少六個月' },
      { d: '事件日誌與可歸責', c: '記錄事件', l: '高', t: '確保資通系統有記錄特定事件之功能，並決定應記錄之特定資通系統事件' },
      { d: '事件日誌與可歸責', c: '記錄事件', l: '高', t: '應記錄資通系統管理者帳號所執行之各項功能' },
      { d: '事件日誌與可歸責', c: '日誌紀錄內容', l: '共通', t: '日誌應包含事件類型、發生時間、發生位置及使用者身分識別等資訊，採用單一日誌機制，確保輸出格式一致性' },
      { d: '事件日誌與可歸責', c: '日誌儲存容量', l: '共通', t: '依據日誌儲存需求，配置所需之儲存容量' },
      { d: '事件日誌與可歸責', c: '日誌處理失效之回應', l: '高', t: '規定需要即時因應之日誌處理失效事件，向特定人員發出警告' },
      { d: '事件日誌與可歸責', c: '日誌處理失效之回應', l: '中', t: '資通系統於日誌處理失效時，失效後自動執行動作' },
      { d: '事件日誌與可歸責', c: '時戳及校時', l: '共通', t: '使用系統內部時鐘產生日誌所需時戳，可對應UTC或GMT' },
      { d: '事件日誌與可歸責', c: '時戳及校時', l: '共通', t: '系統內部時鐘定期與授權時間源同步' },
      { d: '事件日誌與可歸責', c: '日誌資訊之保護', l: '高', t: '備份事件日誌至原系統外之其他系統' },
      { d: '事件日誌與可歸責', c: '日誌資訊之保護', l: '高、中', t: '以邏輯或實體方式確保日誌完整' },
      { d: '事件日誌與可歸責', c: '日誌資訊之保護', l: '普', t: '日誌之存取管理，僅限授權使用者' },
      { d: '營運持續計畫', c: '系統備份', l: '高', t: '意外事故還原，建立資料備份還原驗證' },
      { d: '營運持續計畫', c: '系統備份', l: '中', t: '系統中斷可從備份復原' },
      { d: '營運持續計畫', c: '系統備份', l: '普', t: '定期備份，可含還原驗證' },
      { d: '營運持續計畫', c: '系統備援', l: '高', t: '啟動備援作為' },
      { d: '營運持續計畫', c: '系統備援', l: '中', t: '最大可容忍中斷時間內完成備援' },
      { d: '營運持續計畫', c: '系統備援', l: '普', t: '定期從備援恢復至正常服務' },
      { d: '識別與鑑別', c: '使用者之識別與鑑別', l: '共通', t: '識別及鑑別使用者，禁止使用共用帳號' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '高', t: '認證機制採多因子鑑別' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '中', t: '帳戶自動化程序之驗證及密碼變換確認' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '中', t: '使用預設密碼登入系統時，應於登入後立即變更' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '中', t: '帳號鎖定機制：登入驗證失敗達5次後，至少15分鐘內不允許繼續嘗試' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '中', t: '使用密碼進行驗證時，應強制最低密碼複雜度及效期限制' },
      { d: '識別與鑑別', c: '身分驗證管理', l: '中', t: '密碼變更時，至少不可以與前三次使用過之密碼相同' },
      { d: '識別與鑑別', c: '鑑別資訊回饋', l: '共通', t: '資通系統應遮蔽鑑別過程中之資訊' },
      { d: '識別與鑑別', c: '加密模組鑑別', l: '高、中', t: '以密碼進行鑑別時，該密碼應加密或經雜湊處理後儲存' },
      { d: '識別與鑑別', c: '非內部使用者之識別與鑑別', l: '共通', t: '資通系統應識別及鑑別非機關使用者' },
      { d: '系統與服務獲得', c: '需求階段', l: '共通', t: '針對系統安全需求（含機密性、可用性、完整性）進行確認' },
      { d: '系統與服務獲得', c: '設計階段', l: '高、中', t: '根據系統功能與要求，識別可能影響系統之威脅，進行風險分析及評估' },
      { d: '系統與服務獲得', c: '開發階段', l: '高', t: '執行「原始碼品質」安全檢測' },
      { d: '系統與服務獲得', c: '開發階段', l: '高、中', t: '以安全需求作為驗收點，避免常見漏洞' },
      { d: '系統與服務獲得', c: '測試階段', l: '高', t: '執行「滲透測試」安全檢測' },
      { d: '系統與服務獲得', c: '測試階段', l: '高、中', t: '執行「弱點掃描」安全檢測' },
      { d: '系統與服務獲得', c: '部署與維運階段', l: '高', t: '版本異動及變更管理' },
      { d: '系統與服務獲得', c: '部署與維運階段', l: '中', t: '部署環境規範' },
      { d: '系統與服務獲得', c: '部署與維運階段', l: '普', t: '識別無授權行為、維護紀錄' },
      { d: '系統與服務獲得', c: '委外階段', l: '共通', t: '開發委外需將系統發展生命週期各階段安全需求納入委外契約' },
      { d: '系統與服務獲得', c: '獲得程序', l: '高、中', t: '開發、測試及正式作業環境隔離' },
      { d: '系統與服務獲得', c: '獲得程序', l: '普', t: '識別使用第三方軟體、服務' },
      { d: '系統與服務獲得', c: '系統文件', l: '共通', t: '應儲存管理系統發展生命週期之相關文件' },
      { d: '系統與通訊保護', c: '傳輸之機密性與完整性', l: '高', t: '使用公開國際標準加密、到期換憑、加密連線' },
      { d: '系統與通訊保護', c: '傳輸之機密性與完整性', l: '中', t: '加密金鑰或強度到期應汰換' },
      { d: '系統與通訊保護', c: '傳輸之機密性與完整性', l: '普', t: '資通系統傳輸應加密' },
      { d: '系統與通訊保護', c: '資料儲存之安全', l: '共通', t: '資通系統應妥善儲存資料並以加密或其他適當方式儲存' },
      { d: '系統與資訊完整性', c: '漏洞修復', l: '高', t: '定期確認相關漏洞修復之狀態' },
      { d: '系統與資訊完整性', c: '漏洞修復', l: '中', t: '使用完整性驗證工具' },
      { d: '系統與資訊完整性', c: '漏洞修復', l: '普', t: '定期檢查並更新，發現漏洞後修復' },
      { d: '系統與資訊完整性', c: '資通系統監控', l: '高', t: '自動化工具監控進出流量，對特殊事件進行分析' },
      { d: '系統與資訊完整性', c: '資通系統監控', l: '中', t: '監控資通系統偵測未授權連線' },
      { d: '系統與資訊完整性', c: '資通系統監控', l: '普', t: '發現資通系統有被入侵跡象時，通報特定人員' },
      { d: '系統與資訊完整性', c: '軟體及資訊完整性', l: '高', t: '完整性檢核工具偵測未授權變更' },
      { d: '系統與資訊完整性', c: '軟體及資訊完整性', l: '中', t: '使用完整性驗證工具，發現違反完整性時通報' },
      { d: '系統與資訊完整性', c: '軟體及資訊完整性', l: '普', t: '使用者輸入資料合法性檢查' }
    ];

    const THREAT_SCENARIOS = {
      PE: [
        { id: 'pe1', threat: '人員離職未完成交接', vuln: '知識集中風險', likelihood: 2, impact: 2 },
        { id: 'pe2', threat: '權限過大或未即時回收', vuln: '存取控制不當', likelihood: 2, impact: 3 },
        { id: 'pe3', threat: '遭社交工程攻擊', vuln: '人員訓練不足', likelihood: 2, impact: 2 },
        { id: 'pe4', threat: '內部人員故意洩密', vuln: '缺乏監控機制', likelihood: 1, impact: 3 }
      ],
      DC: [
        { id: 'dc1', threat: '文件未加密儲存', vuln: '缺乏加密', likelihood: 2, impact: 2 },
        { id: 'dc2', threat: '文件未依規定分級標示', vuln: '分類分級不當', likelihood: 2, impact: 1 },
        { id: 'dc3', threat: '不當人員存取機密文件', vuln: '存取控制不當', likelihood: 2, impact: 3 },
        { id: 'dc4', threat: '文件保存期限過期未銷毀', vuln: '生命週期管理不足', likelihood: 1, impact: 2 }
      ],
      DA: [
        { id: 'da1', threat: '資料庫遭SQL注入攻擊', vuln: '未做輸入驗證', likelihood: 2, impact: 3 },
        { id: 'da2', threat: '個資外洩', vuln: '缺乏加密或存取控制', likelihood: 2, impact: 3 },
        { id: 'da3', threat: '資料未備份導致遺失', vuln: '缺乏備份', likelihood: 2, impact: 3 },
        { id: 'da4', threat: '資料遭竄改', vuln: '缺乏完整性驗證', likelihood: 1, impact: 3 }
      ],
      SW: [
        { id: 'sw1', threat: '軟體漏洞未及時修補', vuln: '未及時更新修補', likelihood: 3, impact: 3 },
        { id: 'sw2', threat: '軟體授權到期或違規使用', vuln: '授權管理不當', likelihood: 2, impact: 2 },
        { id: 'sw3', threat: '遭植入惡意程式', vuln: '缺乏防毒機制', likelihood: 2, impact: 3 },
        { id: 'sw4', threat: '使用弱密碼或預設密碼', vuln: '密碼強度不足', likelihood: 2, impact: 3 },
        { id: 'sw5', threat: '未經授權存取系統', vuln: '存取控制不當', likelihood: 2, impact: 3 }
      ],
      HW: [
        { id: 'hw1', threat: '設備老化故障', vuln: '缺乏維護保養', likelihood: 2, impact: 2 },
        { id: 'hw2', threat: '韌體或驅動程式未更新', vuln: '未及時更新修補', likelihood: 2, impact: 3 },
        { id: 'hw3', threat: '實體設備竊盜或遺失', vuln: '實體安全不足', likelihood: 1, impact: 3 },
        { id: 'hw4', threat: '天然災害損壞', vuln: '缺乏災害防護', likelihood: 1, impact: 3 },
        { id: 'hw5', threat: '電力中斷', vuln: '缺乏不斷電系統', likelihood: 2, impact: 2 }
      ],
      VM: [
        { id: 'vm1', threat: 'VM逃逸攻擊', vuln: 'Hypervisor漏洞', likelihood: 1, impact: 3 },
        { id: 'vm2', threat: '快照管理不當導致資料外洩', vuln: '快照存取控制不足', likelihood: 2, impact: 2 },
        { id: 'vm3', threat: '資源耗盡（CPU/RAM/Storage）', vuln: '資源監控不足', likelihood: 2, impact: 2 },
        { id: 'vm4', threat: '映像檔外洩', vuln: '映像檔未加密', likelihood: 1, impact: 3 }
      ],
      BS: [
        { id: 'bs1', threat: '核心業務服務中斷', vuln: '缺乏備援機制', likelihood: 2, impact: 3 },
        { id: 'bs2', threat: '供應鏈/委外廠商風險', vuln: '供應鏈管理不足', likelihood: 2, impact: 2 },
        { id: 'bs3', threat: 'SLA違約', vuln: '監控不足', likelihood: 2, impact: 2 },
        { id: 'bs4', threat: '災難恢復能力不足', vuln: '缺乏營運持續計畫', likelihood: 1, impact: 3 }
      ]
    };

    // -- Determine if a row applies to a given protection level --
    function isApplicable(protLevel, rowLevel) {
      if (!protLevel || !rowLevel) return true;
      if (rowLevel === '共通') return true;
      if (protLevel === '高') return true;
      if (protLevel === '中') {
        return rowLevel === '中' || rowLevel === '普' || rowLevel === '共通'
          || rowLevel === '高、中' || rowLevel === '高、中、普';
      }
      if (protLevel === '普') {
        return rowLevel === '普' || rowLevel === '共通' || rowLevel === '高、中、普';
      }
      return true;
    }

    // -- Build inline appendix10 checklist for IT system section --
    function buildInlineAppendix10Checklist(protLevel, existingAssessments) {
      const existing = {};
      (existingAssessments || []).forEach(function(a) {
        existing[a.dimension + '|' + a.code + '|' + a.control] = a;
      });

      const filtered = APPENDIX10_DATA.filter(function(row) {
        return isApplicable(protLevel, row.l);
      });

      if (!protLevel) {
        return '<div class="empty-state">請先選擇「系統級別」以顯示對應的防護基準項目</div>';
      }
      if (filtered.length === 0) {
        return '<div class="empty-state">無適用項目</div>';
      }

      let html = '<div class="toolbar">'
        + '<span class="text-muted">共 ' + filtered.length + ' 項適用（防護等級：' + esc(protLevel) + '）</span>'
        + '<button type="button" class="btn btn-sm btn-primary" data-action="app.a10AllConform">' + ic('check-circle', 'icon-xs') + ' \u5168\u90e8\u7b26\u5408</button>'
        + '</div>';
      html += '<table class="data-table">';
      html += '<thead><tr>'
        + '<th>構面</th>'
        + '<th>措施代碼</th>'
        + '<th>控制措施</th>'
        + '<th class="text-center">評估</th>'
        + '</tr></thead><tbody>';

      filtered.forEach(function(row, idx) {
        const key = row.d + '|' + row.c + '|' + row.t;
        const saved = existing[key] || {};
        const isConform = saved.result === '符合';
        const isNonConform = saved.result === '不符合';
        const isNA = saved.result === '不適用';
        const resultAttr = isConform ? ' data-result="\u7b26\u5408"' : isNonConform ? ' data-result="\u4e0d\u7b26\u5408"' : isNA ? ' data-result="\u4e0d\u9069\u7528"' : '';

        html += '<tr' + resultAttr + '>'
          + '<td>' + esc(row.d) + '</td>'
          + '<td>' + esc(row.c) + '</td>'
          + '<td>' + esc(row.t) + '</td>'
          + '<td class="text-center">'
          + '<select class="form-select" name="a10_' + idx + '" data-a10-idx="' + idx + '">'
          + '<option value="">--</option>'
          + '<option value="符合"' + (isConform ? ' selected' : '') + '>符合</option>'
          + '<option value="不符合"' + (isNonConform ? ' selected' : '') + '>不符合</option>'
          + '<option value="不適用"' + (isNA ? ' selected' : '') + '>不適用</option>'
          + '</select>'
          + '</td>'
          + '</tr>';
      });

      html += '</tbody></table>';
      return html;
    }

    function buildRiskScenarios(category, checkedIds) {
      const scenarios = THREAT_SCENARIOS[category] || THREAT_SCENARIOS['SW'];
      const catLabel = getCategoryLabel(category) || getCategoryLabel('SW');
      const checked = {};
      (checkedIds || []).forEach(function(id) { checked[id] = true; });

      const likelihoodBadge = function(v) {
        const tone = v === 3 ? 'high' : v === 2 ? 'medium' : 'low';
        const label = v === 3 ? '\u9ad8' : v === 2 ? '\u4e2d' : '\u4f4e';
        return '<span class="risk-scenario-badge risk-scenario-badge--' + tone + '">' + label + '</span>';
      };

      let html = '<div class="toolbar">'
        + '<div class="text-muted">'
        + ic('shield-alert', 'icon-sm') + ' \u4f9d\u8cc7\u7522\u5206\u985e\u300c<b>' + esc(catLabel) + '</b>\u300d\u5217\u51fa ' + scenarios.length + ' \u9805\u5e38\u898b\u5a01\u8105\u60c5\u5883'
        + '</div>'
        + '<span id="risk-checked-count" class="text-muted">\u5df2\u52fe\u9078 0 \u9805</span>'
        + '</div>';

      html += '<div class="risk-scenario-list">';
      scenarios.forEach(function(s) {
        const isChecked = checked[s.id];
        html += '<label class="risk-scenario-card">'
          + '<input type="checkbox" class="risk-scenario-check" data-scenario-id="' + s.id + '" data-likelihood="' + s.likelihood + '" data-impact="' + s.impact + '"' + (isChecked ? ' checked' : '') + '>'
          + '<div class="risk-scenario-body">'
          + '<div class="risk-scenario-threat">' + ic('alert-triangle', 'icon-xs') + ' ' + esc(s.threat) + '</div>'
          + '<div class="risk-scenario-vuln">' + ic('shield-x', 'icon-xs') + ' \u5f31\u9ede\uff1a' + esc(s.vuln) + '</div>'
          + '</div>'
          + '<div class="risk-scenario-scores">'
          + '<div><div class="risk-scenario-label">\u53ef\u80fd\u6027</div>' + likelihoodBadge(s.likelihood) + '</div>'
          + '<div><div class="risk-scenario-label">\u885d\u64ca</div>' + likelihoodBadge(s.impact) + '</div>'
          + '</div>'
          + '</label>';
      });
      html += '</div>';
      return html;
    }

    // -------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------

    // Custom action delegation — uses window global to survive ESM bundle scoping.
    if (!window.__ismsAssetActions) window.__ismsAssetActions = {};
    if (!window.__ismsAssetDelegation) {
      window.__ismsAssetDelegation = true;
      document.addEventListener('click', function (e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        let action = el.getAttribute('data-action') || '';
        const key = action.replace(/^app\./, '');
        const handler = window.__ismsAssetActions[key];
        if (typeof handler !== 'function') return;
        e.preventDefault();
        // Navigation actions — handle directly to avoid ESM bundle closure issues
        const navRoutes = {
          createAsset: '#asset-create',
          backToList: '#assets'
        };
        const paramRoutes = {
          editAsset: '#asset-edit/',
          viewAsset: '#asset-detail/',
          backToDetail: '#asset-detail/'
        };
        if (navRoutes[key]) { window.location.hash = navRoutes[key]; return; }
        if (paramRoutes[key]) { const pid = (el.dataset && el.dataset.id) || ''; if (pid) window.location.hash = paramRoutes[key] + pid; return; }
        // Non-navigation actions — call handler normally
        try { handler({ event: e, element: el, dataset: Object.assign({}, el.dataset) }); } catch (_) {}
      }, true);
    }
    function bindActions(handlers) {
      Object.keys(handlers).forEach(function (k) { window.__ismsAssetActions[k] = handlers[k]; });
    }

    function scheduleRefreshIcons() {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(refreshIcons);
        return;
      }
      refreshIcons();
    }

    // Map backend field names to frontend short names
    function adaptAsset(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (obj.confidentiality !== undefined) { obj.ciaC = obj.confidentiality; }
      if (obj.integrity !== undefined) { obj.ciaI = obj.integrity; }
      if (obj.availability !== undefined) { obj.ciaA = obj.availability; }
      if (obj.legalCompliance !== undefined) { obj.ciaL = obj.legalCompliance; }
      // Adapt arrays of items
      if (Array.isArray(obj.items)) { obj.items.forEach(adaptAsset); }
      return obj;
    }

    async function apiCall(method, path, body) {
      const endpoint = (CONFIG && CONFIG.assetInventoryEndpoint) || '/api/assets';
      const opts = { method: method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
      if (body) opts.body = JSON.stringify({ payload: body });
      const res = await fetch(endpoint + path, opts);
      if (!res.ok) {
        const text = await res.text().catch(function () { return res.statusText; });
        throw new Error(text || ('\u8acb\u6c42\u5931\u6557 (' + res.status + ')'));
      }
      return res.json().then(adaptAsset);
    }

    function getCurrentRocYear() {
      return new Date().getFullYear() - 1911;
    }

    function computeProtectionLevel(c, i, a, l) {
      const cv = CIA_VALUE_MAP[c] || 0;
      const iv = CIA_VALUE_MAP[i] || 0;
      const av = CIA_VALUE_MAP[a] || 0;
      const lv = CIA_VALUE_MAP[l] || 0;
      const max = Math.max(cv, iv, av, lv);
      if (max >= 3) return '\u9ad8';
      if (max >= 2) return '\u4e2d';
      if (max >= 1) return '\u666e';
      return '';
    }

    function computeRiskScore(likelihood, impact) {
      let l = parseInt(likelihood, 10) || 0;
      const imp = parseInt(impact, 10) || 0;
      return l * imp;
    }

    function getRiskLevel(score) {
      if (score >= 6) return '\u9ad8';
      if (score >= 3) return '\u4e2d';
      if (score >= 1) return '\u4f4e';
      return '';
    }

    function getRiskBadgeClass(level) {
      if (level === '\u9ad8') return 'badge-danger';
      if (level === '\u4e2d') return 'badge-warning';
      if (level === '\u4f4e') return 'badge-success';
      return 'badge-secondary';
    }

    function getStatusBadgeClass(status) {
      if (status === '\u5df2\u5b8c\u6210') return 'badge-success';
      if (status === '\u5f85\u7c3d\u6838') return 'badge-warning';
      if (status === '\u586b\u5831\u4e2d') return 'badge-info';
      return 'badge-secondary';
    }

    function statusBadge(status) {
      if (status === '\u5df2\u5b8c\u6210') return '<span class="badge badge-success">' + ic('check', 'icon-xs') + ' \u5df2\u5b8c\u6210</span>';
      if (status === '\u586b\u5831\u4e2d') return '<span class="badge badge-warning">' + ic('edit', 'icon-xs') + ' \u586b\u5831\u4e2d</span>';
      if (status === '\u5f85\u7c3d\u6838') return '<span class="badge badge-info">' + ic('clock', 'icon-xs') + ' \u5f85\u7c3d\u6838</span>';
      return '<span class="text-muted">' + esc(status || '\u2014') + '</span>';
    }

    function getCategoryLabel(code) {
      const cat = CATEGORIES[code];
      return cat ? cat.label : code || '';
    }

    function getSubCategories(code) {
      const cat = CATEGORIES[code];
      return cat ? cat.subs : [];
    }

    function buildSelectOptions(options, selected, includeEmpty) {
      let html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      for (let i = 0; i < options.length; i++) {
        const val = options[i];
        html += '<option value="' + esc(val) + '"' + (val === selected ? ' selected' : '') + '>' + esc(val) + '</option>';
      }
      return html;
    }

    function buildCategorySelectOptions(selected, includeEmpty) {
      let html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      let keys = Object.keys(CATEGORIES);
      for (let i = 0; i < keys.length; i++) {
        const code = keys[i];
        const label = CATEGORIES[code].label;
        html += '<option value="' + esc(code) + '"' + (code === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
      }
      return html;
    }

    function buildSubCategorySelectOptions(categoryCode, selected, includeEmpty) {
      const subs = getSubCategories(categoryCode);
      let html = '';
      if (includeEmpty) {
        html += '<option value="">-- \u8acb\u9078\u64c7 --</option>';
      }
      for (let i = 0; i < subs.length; i++) {
        html += '<option value="' + esc(subs[i]) + '"' + (subs[i] === selected ? ' selected' : '') + '>' + esc(subs[i]) + '</option>';
      }
      return html;
    }

    function buildYearOptions(selected) {
      let current = getCurrentRocYear();
      let html = '';
      for (let y = current; y >= current - 5; y--) {
        html += '<option value="' + y + '"' + (String(y) === String(selected) ? ' selected' : '') + '>' + y + '</option>';
      }
      return html;
    }

    function buildCollapsibleSection(id, title, contentHtml, options) {
      const opts = options || {};
      const open = opts.open !== false;
      let borderColor = opts.borderColor || '';
      const borderStyle = borderColor ? ' style="border-left: 4px solid ' + borderColor + ';"' : '';
      const condDisplay = opts.hidden ? ' style="display:none;"' : '';
      const sectionId = 'asset-section-' + id;
      return '<div class="card asset-form-section" id="' + sectionId + '"' + condDisplay + borderStyle + '>'
        + '<div class="card-header asset-section-header" data-toggle-section="' + id + '" style="cursor:pointer;">'
        + '<span>' + esc(title) + '</span>'
        + '<span class="section-toggle-icon">' + ic(open ? 'chevron-up' : 'chevron-down') + '</span>'
        + '</div>'
        + '<div class="card-body asset-section-body" id="asset-section-body-' + id + '"' + (open ? '' : ' style="display:none;"') + '>'
        + contentHtml
        + '</div>'
        + '</div>';
    }

    function buildFormGroup(labelText, inputHtml, options) {
      const opts = options || {};
      const groupClass = 'form-group' + (opts.className ? ' ' + opts.className : '');
      const hint = opts.hint ? '<small class="form-hint">' + esc(opts.hint) + '</small>' : '';
      return '<div class="' + groupClass + '">'
        + '<label class="form-label">' + esc(labelText) + '</label>'
        + inputHtml
        + hint
        + '</div>';
    }

    function buildTextInput(name, value, options) {
      const opts = options || {};
      const readonly = opts.readonly ? ' readonly' : '';
      let placeholder = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
      const extra = opts.id ? ' id="' + opts.id + '"' : '';
      return '<input type="text" class="form-input" name="' + esc(name) + '" value="' + esc(value || '') + '"' + readonly + placeholder + extra + '>';
    }

    function buildTextarea(name, value, options) {
      const opts = options || {};
      let rows = opts.rows || 3;
      const readonly = opts.readonly ? ' readonly' : '';
      return '<textarea class="form-input" name="' + esc(name) + '" rows="' + rows + '"' + readonly + '>' + esc(value || '') + '</textarea>';
    }

    function buildSelect(name, optionsHtml, options) {
      const opts = options || {};
      const disabled = opts.disabled ? ' disabled' : '';
      const extra = opts.id ? ' id="' + opts.id + '"' : '';
      return '<select class="form-select" name="' + esc(name) + '"' + disabled + extra + '>' + optionsHtml + '</select>';
    }

    function buildCheckbox(name, label, checked) {
      return '<label class="form-check-label asset-flex-cursor">'
        + '<input type="checkbox" class="form-check-input" name="' + esc(name) + '"' + (checked ? ' checked' : '') + '>'
        + '<span>' + esc(label) + '</span>'
        + '</label>';
    }

    function readFormValues(container) {
      const result = {};
      const inputs = container.querySelectorAll('input, select, textarea');
      for (let i = 0; i < inputs.length; i++) {
        const el = inputs[i];
        let name = el.getAttribute('name');
        if (!name) continue;
        if (el.type === 'checkbox') {
          result[name] = el.checked;
        } else {
          result[name] = el.value;
        }
      }
      return result;
    }

    // -------------------------------------------------------
    // Browse state
    // -------------------------------------------------------
    const browseState = {
      year: String(getCurrentRocYear()),
      category: '',
      status: '',
      keyword: ''
    };

    // -------------------------------------------------------
    // renderAssetList
    // -------------------------------------------------------
    async function renderAssetList() {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header review-page-header page-header--integrated">'
        + '<div>'
        + '<div class="page-eyebrow">\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede</div>'
        + '<h1 class="page-title">' + ic('database') + ' \u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a</h1>'
        + '<p class="page-subtitle">\u7ba1\u7406\u672c\u55ae\u4f4d\u8cc7\u8a0a\u8cc7\u7522\uff0c\u4f9d\u5206\u985e\u3001CIA\u7b49\u7d1a\u3001\u98a8\u96aa\u9032\u884c\u76e4\u9ede\u8207\u8a55\u4f30\u3002</p>'
        + '</div>'
        + '<div class="review-header-actions">'
        + '<button class="btn btn-primary" data-action="app.createAsset">' + ic('plus') + ' \u65b0\u589e</button>'
        + '<button class="btn btn-secondary" data-action="app.exportAssets">' + ic('download') + ' \u532f\u51fa</button>'
        + '<button class="btn btn-outline" data-action="app.submitAllAssets" style="color:var(--color-success);border-color:var(--color-success);">' + ic('check-circle') + ' \u5e74\u5ea6\u5df2\u76e4\u9ede\u5b8c\u6210</button>'
        + '</div>'
        + '</div>'

        // Filter bar
        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-body--padded">'
        + '<div class="toolbar-filters">'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u5e74\u5ea6</label>'
        + '<select class="form-select" id="asset-filter-year">' + buildYearOptions(browseState.year) + '</select>'
        + '</div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u5206\u985e</label>'
        + '<select class="form-select" id="asset-filter-category">'
        + '<option value="">\u5168\u90e8</option>'
        + buildCategorySelectOptions(browseState.category, false)
        + '</select>'
        + '</div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u72c0\u614b</label>'
        + '<select class="form-select" id="asset-filter-status">'
        + '<option value="">\u5168\u90e8</option>'
        + buildSelectOptions(STATUS_OPTIONS, browseState.status, false)
        + '</select>'
        + '</div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u641c\u5c0b</label>'
        + '<input type="text" class="form-input" id="asset-filter-keyword" placeholder="\u8cc7\u7522\u540d\u7a31\u3001\u64c1\u6709\u8005..." value="' + esc(browseState.keyword) + '">'
        + '</div>'
        + '<div class="toolbar-actions">'
        + '<button class="btn btn-secondary btn-sm" data-action="app.filterAssets">' + ic('search') + ' \u67e5\u8a62</button>'
        + '</div>'
        + '</div>'
        + '</div></div>'

        // Stats summary bar
        + '<div class="stats-grid review-stats-grid asset-mb-16">'
        + '<div class="stat-card"><div class="stat-value">' + ic('layers', 'icon-sm') + ' <span id="stat-total">-</span></div><div class="stat-label">\u8cc7\u7522\u7e3d\u6578</div></div>'
        + '<div class="stat-card"><div class="stat-value">' + ic('server', 'icon-sm') + ' <span id="stat-it">-</span></div><div class="stat-label">\u8cc7\u901a\u7cfb\u7d71</div></div>'
        + '<div class="stat-card"><div class="stat-value">' + ic('shield-alert', 'icon-sm') + ' <span id="stat-risk">-</span></div><div class="stat-label">\u9ad8\u98a8\u96aa</div></div>'
        + '<div class="stat-card"><div class="stat-value">' + ic('check-circle', 'icon-sm') + ' <span id="stat-done">-</span></div><div class="stat-label">\u5df2\u5b8c\u6210</div></div>'
        + '</div>'

        // Table
        + '<div class="card review-table-card">'
        + '<div class="card-header"><span class="card-title">\u8cc7\u7522\u6e05\u518a</span><span class="review-card-subtitle">\u8f09\u5165\u4e2d...</span></div>'
        + '<div class="card-body asset-pad-0">'
        + '<div id="asset-list-table-wrapper" class="asset-scroll-x">'
        + '<div class="empty-state asset-empty">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div>'
        + '</div>'
        + '</div></div>'
        + '</div>';

      scheduleRefreshIcons();

      // Set up event handlers
      bindActions({
        createAsset: function () {
          return '#asset-create';
        },
        exportAssets: function () {
          const rows = document.querySelectorAll('#asset-list-table-wrapper tbody tr');
          if (!rows.length) { toast('\u6c92\u6709\u8cc7\u6599\u53ef\u532f\u51fa', 'warning'); return; }

          // Collect data
          const headers = ['\u8cc7\u7522\u7de8\u865f', '\u8cc7\u7522\u540d\u7a31', '\u5206\u985e', '\u64c1\u6709\u8005', '\u9632\u8b77\u7b49\u7d1a', '\u98a8\u96aa\u7b49\u7d1a', '\u72c0\u614b'];
          const data = [];
          rows.forEach(function (row) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
              const rowData = [];
              for (let i = 0; i < 7; i++) rowData.push((cells[i].textContent || '').trim());
              data.push(rowData);
            }
          });

          // Try xlsx export (if XLSX library available)
          if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet([headers].concat(data));
            // Auto column widths
            ws['!cols'] = headers.map(function (h, i) {
              const maxLen = Math.max(h.length * 2, Math.max.apply(null, data.map(function (r) { return (r[i] || '').length; }).concat([6])));
              return { wch: Math.min(maxLen + 2, 40) };
            });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '\u8cc7\u7522\u6e05\u518a');
            XLSX.writeFile(wb, '\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a_' + new Date().toISOString().slice(0, 10) + '.xlsx');
            toast('\u5df2\u532f\u51fa Excel', 'success');
          } else {
            // Fallback: CSV
            let csv = '\uFEFF' + headers.join(',') + '\n';
            data.forEach(function (row) {
              csv += row.map(function (v) { return '"' + v.replace(/"/g, '""') + '"'; }).join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = '\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a_' + new Date().toISOString().slice(0, 10) + '.csv';
            link.click();
            toast('\u5df2\u532f\u51fa CSV\uff08\u5efa\u8b70\u7528 Excel \u958b\u555f\uff09', 'success');
          }
        },
        submitAllAssets: function () {
          let year = (document.getElementById('asset-filter-year') || {}).value || getCurrentRocYear();
          if (!window.confirm('\u78ba\u5b9a\u8981\u5c07 ' + year + ' \u5e74\u5ea6\u6240\u6709\u8cc7\u7522\u6a19\u8a18\u70ba\u300c\u5df2\u5b8c\u6210\u300d\uff1f\n\n\u9019\u4ee3\u8868\u672c\u55ae\u4f4d\u4eca\u5e74\u5ea6\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u5df2\u5b8c\u6210\uff0c\u6700\u9ad8\u7ba1\u7406\u8005\u5c07\u53ef\u5728\u5f8c\u53f0\u67e5\u770b\u5b8c\u6210\u72c0\u614b\u3002')) return;
          const endpoint = (window.__M365_UNIT_CONTACT_CONFIG__ && window.__M365_UNIT_CONTACT_CONFIG__.assetInventoryEndpoint) || '/api/assets';
          fetch(endpoint + '/batch-status', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: { status: '\u5df2\u5b8c\u6210', unitCode: '', year: parseInt(year, 10) } })
          }).then(function (r) { return r.json(); })
            .then(function (data) {
              alert('\u5df2\u5b8c\u6210\uff01\u5171 ' + (data.updated || 0) + ' \u7b46\u8cc7\u7522\u6a19\u8a18\u70ba\u300c\u5df2\u5b8c\u6210\u300d');
              window.location.reload();
            }).catch(function (e) {
              alert('\u64cd\u4f5c\u5931\u6557\uff1a' + String(e && e.message || e));
            });
        },
        filterAssets: function () {
          applyFiltersAndReload();
        },
        editAsset: function (ctx) {
          let id = ctx.dataset && ctx.dataset.id;
          if (id) return '#asset-edit/' + id;
        },
        viewAsset: function (ctx) {
          let id = ctx.dataset && ctx.dataset.id;
          if (id) return '#asset-detail/' + id;
        },
        deleteAsset: function (ctx) {
          let id = ctx.dataset && ctx.dataset.id;
          if (!id) return;
          if (!window.confirm('\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u8cc7\u7522\u55ce\uff1f\u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\u3002')) return;
          const endpoint = (window.__M365_UNIT_CONTACT_CONFIG__ && window.__M365_UNIT_CONTACT_CONFIG__.assetInventoryEndpoint) || '/api/assets';
          fetch(endpoint + '/' + id + '/delete', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }).then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.success) {
                alert('\u5df2\u6210\u529f\u522a\u9664\u8cc7\u7522');
                window.location.hash = '#assets';
                window.location.reload();
              } else {
                alert('\u522a\u9664\u5931\u6557\uff1a' + (data.error || '\u672a\u77e5\u932f\u8aa4'));
              }
            }).catch(function (err) {
              alert('\u522a\u9664\u5931\u6557\uff1a' + String(err && err.message || err));
            });
        }
      });

      // Event listeners for filters
      const yearEl = document.getElementById('asset-filter-year');
      const categoryEl = document.getElementById('asset-filter-category');
      const statusEl = document.getElementById('asset-filter-status');
      const keywordEl = document.getElementById('asset-filter-keyword');

      if (yearEl) addPageEventListener(yearEl, 'change', function () { browseState.year = yearEl.value; });
      if (categoryEl) addPageEventListener(categoryEl, 'change', function () { browseState.category = categoryEl.value; });
      if (statusEl) addPageEventListener(statusEl, 'change', function () { browseState.status = statusEl.value; });
      if (keywordEl) addPageEventListener(keywordEl, 'input', function () { browseState.keyword = keywordEl.value; });

      // Load data
      await loadAssetListData();
    }

    function applyFiltersAndReload() {
      const yearEl = document.getElementById('asset-filter-year');
      const categoryEl = document.getElementById('asset-filter-category');
      const statusEl = document.getElementById('asset-filter-status');
      const keywordEl = document.getElementById('asset-filter-keyword');

      if (yearEl) browseState.year = yearEl.value;
      if (categoryEl) browseState.category = categoryEl.value;
      if (statusEl) browseState.status = statusEl.value;
      if (keywordEl) browseState.keyword = keywordEl.value;

      loadAssetListData();
    }

    async function loadAssetListData() {
      const wrapper = document.getElementById('asset-list-table-wrapper');
      if (!wrapper) return;

      try {
        const queryParts = [];
        if (browseState.year) queryParts.push('year=' + encodeURIComponent(browseState.year));
        if (browseState.category) queryParts.push('category=' + encodeURIComponent(browseState.category));
        if (browseState.status) queryParts.push('status=' + encodeURIComponent(browseState.status));
        const queryString = queryParts.length ? '?' + queryParts.join('&') : '';

        const data = await apiCall('GET', queryString);
        let items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);

        // Client-side keyword filter
        let keyword = (browseState.keyword || '').trim().toLowerCase();
        if (keyword) {
          items = items.filter(function (item) {
            const haystack = [
              item.assetId || '',
              item.assetName || '',
              item.ownerName || '',
              item.category || '',
              getCategoryLabel(item.category)
            ].join(' ').toLowerCase();
            return haystack.indexOf(keyword) !== -1;
          });
        }

        // Update card subtitle with count
        const subtitleEl = document.querySelector('.review-card-subtitle');
        if (subtitleEl) subtitleEl.textContent = '\u5171 ' + items.length + ' \u7b46';

        // Update stats summary bar
        const totalCount = items.length;
        const itCount = items.filter(function(i) { return i.isItSystem; }).length;
        const riskCount = items.filter(function(i) { const r = i.riskData || {}; return (i.riskLevel || r.riskLevel) === '\u9ad8'; }).length;
        const doneCount = items.filter(function(i) { return i.status === '\u5df2\u5b8c\u6210'; }).length;
        const el1 = document.getElementById('stat-total'); if (el1) el1.textContent = totalCount;
        const el2 = document.getElementById('stat-it'); if (el2) el2.textContent = itCount;
        const el3 = document.getElementById('stat-risk'); if (el3) el3.textContent = riskCount;
        const el4 = document.getElementById('stat-done'); if (el4) el4.textContent = doneCount;

        if (!items.length) {
          wrapper.innerHTML = '<div class="empty-state asset-empty">'
            + ic('inbox') + '<p>\u7121\u7b26\u5408\u689d\u4ef6\u7684\u8cc7\u7522\u8cc7\u6599</p>'
            + '</div>';
          scheduleRefreshIcons();
          return;
        }

        // Build table row HTML for a single item
        function buildAssetRow(item) {
          const riskScore = computeRiskScore(item.riskLikelihood, item.riskImpact);
          const riskLevel = item.riskLevel || getRiskLevel(riskScore);
          const protLevel = item.protectionLevel || computeProtectionLevel(item.ciaC, item.ciaI, item.ciaA, item.ciaL);
          return '<tr>'
            + '<td class="asset-td">' + esc(item.assetName || '') + '</td>'
            + '<td class="asset-td">' + esc(getCategoryLabel(item.category)) + '</td>'
            + '<td class="asset-td">' + esc(protLevel) + '</td>'
            + '<td class="asset-td"><span class="badge ' + getRiskBadgeClass(riskLevel) + '"><span class="badge-dot"></span>' + esc(riskLevel || '\u2014') + '</span></td>'
            + '<td class="asset-td">' + statusBadge(item.status) + '</td>'
            + '<td class="action-cell nowrap">'
            + '<button class="btn btn-sm btn-outline" data-action="app.editAsset" data-id="' + esc(item.id || '') + '" title="\u7de8\u8f2f" aria-label="\u7de8\u8f2f">' + ic('edit') + '</button> '
            + '<button class="btn btn-sm btn-outline" data-action="app.viewAsset" data-id="' + esc(item.id || '') + '" title="\u6aa2\u8996" aria-label="\u6aa2\u8996">' + ic('eye') + '</button> '
            + '<button class="btn btn-sm btn-danger" data-action="app.deleteAsset" data-id="' + esc(item.id || '') + '" title="\u522a\u9664" aria-label="\u522a\u9664">' + ic('trash-2') + '</button>'
            + '</td>'
            + '</tr>';
        }

        const tableHead = '<thead><tr>'
          + '<th scope="col" class="asset-th">\u8cc7\u7522\u540d\u7a31</th>'
          + '<th scope="col" class="asset-th">\u5206\u985e</th>'
          + '<th scope="col" class="asset-th">\u9632\u8b77\u7b49\u7d1a</th>'
          + '<th scope="col" class="asset-th">\u98a8\u96aa\u7b49\u7d1a</th>'
          + '<th scope="col" class="asset-th">\u72c0\u614b</th>'
          + '<th scope="col" class="asset-th">\u64cd\u4f5c</th>'
          + '</tr></thead>';

        // Admin sees grouped by unit; unit admin sees flat list
        const isAdminUser = typeof isAdmin === 'function' && isAdmin();
        const uniqueUnits = {};
        items.forEach(function (item) { const u = item.unitName || '\u672a\u5206\u985e'; if (!uniqueUnits[u]) uniqueUnits[u] = []; uniqueUnits[u].push(item); });
        const unitNames = Object.keys(uniqueUnits);

        if (isAdminUser && unitNames.length > 1) {
          // Grouped view for admin
          let groupedHtml = '';
          unitNames.forEach(function (unitName, idx) {
            const unitItems = uniqueUnits[unitName];
            const unitCompleted = unitItems.every(function (it) { return it.status === '\u5df2\u5b8c\u6210'; });
            const unitStatusLabel = unitCompleted
              ? '<span class="badge badge-success">' + ic('check', 'icon-xs') + ' \u5df2\u5b8c\u6210</span>'
              : '<span class="text-muted" style="color:var(--color-warning);">' + unitItems.length + ' \u7b46\u8cc7\u7522</span>';
            groupedHtml += '<div class="card asset-mb-12">'
              + '<div class="card-header" style="cursor:pointer;" data-action="app.toggleDashGroup" data-target="asset-group-' + idx + '">'
              + '<span class="card-title">' + ic('building', 'icon-sm') + ' ' + esc(unitName) + '</span>'
              + '<span class="review-card-subtitle">' + unitStatusLabel + ' <span>\u25be</span></span>'
              + '</div>'
              + '<div id="asset-group-' + idx + ' asset-pad-0">'
              + '<table class="asset-table">' + tableHead + '<tbody>';
            unitItems.forEach(function (item) { groupedHtml += buildAssetRow(item); });
            groupedHtml += '</tbody></table></div></div>';
          });
          wrapper.innerHTML = '<div class="text-muted asset-mb-8">\u5168\u6821\u5171 ' + items.length + ' \u7b46\u8cc7\u7522\uff0c' + unitNames.length + ' \u500b\u55ae\u4f4d</div>' + groupedHtml;
        } else {
          // Flat list for unit admin
          let rowsHtml = '';
          items.forEach(function (item) { rowsHtml += buildAssetRow(item); });
          wrapper.innerHTML = '<div class="table-wrapper" tabindex="0">'
            + '<table class="asset-table">'
            + '<caption class="sr-only">\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede\u6e05\u518a</caption>'
            + tableHead
            + '<tbody>' + rowsHtml + '</tbody>'
            + '</table>'
            + '</div>';
        }

        scheduleRefreshIcons();
      } catch (err) {
        wrapper.innerHTML = '<div class="empty-state asset-error">'
          + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
          + '</div>';
        scheduleRefreshIcons();
      }
    }

    // -------------------------------------------------------
    // renderAssetCreate / renderAssetEdit
    // -------------------------------------------------------
    function renderAssetCreate() {
      renderAssetForm(null);
    }

    function renderAssetEdit(assetId) {
      renderAssetForm(assetId);
    }

    async function renderAssetForm(assetId) {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      const isEdit = !!assetId;
      let title = isEdit ? '\u7de8\u8f2f\u8cc7\u8a0a\u8cc7\u7522' : '\u65b0\u589e\u8cc7\u8a0a\u8cc7\u7522';
      let asset = null;

      if (isEdit) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-empty">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div></div>';
        scheduleRefreshIcons();
        try {
          const resp = await apiCall('GET', '/' + assetId);
          asset = resp && resp.item ? resp.item : resp;
        } catch (err) {
          appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-error">'
            + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
            + '<button class="btn btn-outline" data-action="app.backToList">\u8fd4\u56de\u5217\u8868</button></div></div>';
          scheduleRefreshIcons();
          bindActions({ backToList: function () { return '#assets'; } });
          return;
        }
      }

      // Fetch existing appendix10 assessments if editing
      let existingA10Assessments = [];
      if (isEdit) {
        try {
          const a10Resp = await apiCall('GET', '/' + assetId + '/appendix10');
          const a10Data = a10Resp && a10Resp.item ? a10Resp.item : a10Resp;
          if (a10Data && a10Data.assessments) {
            existingA10Assessments = a10Data.assessments;
          } else if (Array.isArray(a10Data)) {
            existingA10Assessments = a10Data;
          }
        } catch (_) {
          // No existing appendix10 data — that's fine
        }
      }

      const a = asset || {};
      const user = currentUser() || {};
      const currentProtLevel = computeProtectionLevel(a.ciaC || '', a.ciaI || '', a.ciaA || '', a.ciaL || '');
      const riskScore = computeRiskScore(a.riskLikelihood, a.riskImpact);
      const riskLevel = getRiskLevel(riskScore);

      // Helper to build a form card section
      function formCard(sectionId, iconName, sectionTitle, subtitle, bodyHtml, opts) {
        const o = opts || {};
        const borderStyle = o.borderColor ? 'border-left:4px solid ' + o.borderColor + ';' : '';
        const displayStyle = o.hidden ? 'display:none;' : '';
        const bodyDisplay = o.collapsed ? 'display:none;' : '';
        const cardStyle = (borderStyle || displayStyle) ? ' style="' + borderStyle + displayStyle + '"' : '';
        return '<div class="card" id="section-card-' + sectionId + '"' + cardStyle + '>'
          + '<div class="card-header section-header" style="cursor:pointer;" data-action="app.toggleSection" data-target="section-' + sectionId + '">'
          + '<span class="card-title">'
          + ic(iconName) + ' ' + esc(sectionTitle)
          + (subtitle ? '<span class="text-muted" style="font-size:12px;">\uff08' + esc(subtitle) + '\uff09</span>' : '')
          + '</span>'
          + '<span class="section-toggle-icon">' + (o.collapsed ? '\u25b8' : '\u25be') + '</span>'
          + '</div>'
          + '<div class="card-body--padded" id="section-' + sectionId + '"' + (bodyDisplay ? ' style="' + bodyDisplay + '"' : '') + '>'
          + bodyHtml
          + '</div>'
          + '</div>';
      }

      // --- Section 1: Basic Information ---
      // Admin without unit: show notice and fallback
      if (!isEdit && !(user.primaryUnit || user.unit || '').trim()) {
        appEl.innerHTML = '<div class="animate-in"><div class="page-header"><div><h1 class="page-title">' + ic('alert-triangle') + ' 無法新增資產</h1>'
          + '<p class="page-subtitle">目前帳號未綁定單位，最高管理員請先至「帳號管理」設定主要單位，或切換至單位管理員帳號操作。</p></div></div>'
          + '<div style="margin-top:16px"><a class="btn btn-primary" href="#assets">' + ic('arrow-left') + ' 返回資產清冊</a>'
          + ' <a class="btn btn-secondary" href="#users">' + ic('settings') + ' 前往帳號管理</a></div></div>';
        scheduleRefreshIcons();
        return;
      }
      // 資產編號：新建時由系統自動產生（NTU-{unitCode}-IS3-{cat}-F{seq}）
      const userUnitCode = (user.primaryUnit || user.unit || '').replace(/\./g, '').replace(/^0+/, '').padStart(3, '0');
      const idPreview = isEdit ? a.assetId : 'NTU-' + userUnitCode + '-IS3-{分類}-F{序號}';
      const basicHtml = ''
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u8cc7\u7522\u7de8\u865f</label>'
        + '<input type="text" class="form-input" id="asset-id-display" name="assetId" value="' + esc(a.assetId || '') + '" placeholder="' + esc(idPreview) + '" ' + (isEdit ? '' : 'readonly') + ' style="' + (isEdit ? '' : 'background:#f8fafc;color:var(--text-muted);') + '">'
        + '<div class="form-hint" id="asset-id-hint">' + (isEdit ? '' : '\u7cfb\u7d71\u4f9d\u55ae\u4f4d\u4ee3\u78bc\u8207\u5206\u985e\u81ea\u52d5\u7522\u751f\uff0c\u5982 NTU-022-IS3-HW-F001') + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u8cc7\u7522\u540d\u7a31</label>'
        + '<input type="text" class="form-input" id="asset-name" name="assetName" value="' + esc(a.assetName || '') + '" placeholder="\u8acb\u8f38\u5165\u8cc7\u7522\u540d\u7a31" required>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u4e3b\u5206\u985e</label>'
        + '<select class="form-select" id="asset-category" name="category">' + buildCategorySelectOptions(a.category || '', true) + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u5b50\u5206\u985e</label>'
        + '<select class="form-select" id="asset-sub-category" name="subCategory">' + buildSubCategorySelectOptions(a.category || '', a.subCategory || '', true) + '</select>'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u64c1\u6709\u8005 / \u4fdd\u7ba1\u4eba</label>'
        + '<input type="text" class="form-input" id="asset-owner" name="ownerName" value="' + esc(a.ownerName || user.displayName || '') + '" placeholder="\u8acb\u8f38\u5165\u8ca0\u8cac\u4eba\u59d3\u540d">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u4fdd\u7ba1\u55ae\u4f4d</label>'
        + '<input type="text" class="form-input" id="asset-custodian" name="ownerUnit" value="' + esc(a.ownerUnit || user.unit || '') + '" placeholder="\u81ea\u52d5\u5e36\u5165\u586b\u5831\u4eba\u55ae\u4f4d\uff0c\u53ef\u81ea\u884c\u4fee\u6539">'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u8cc7\u7522\u8aaa\u660e</label>'
        + '<textarea class="form-textarea" id="asset-description" name="description" rows="3" placeholder="\u7c21\u8981\u63cf\u8ff0\u8cc7\u7522\u7528\u9014\u6216\u5167\u5bb9">' + esc(a.description || '') + '</textarea>'
        + '</div>';

      // --- Section 2: Location & Specifications ---
      const locationHtml = ''
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5b58\u653e\u4f4d\u7f6e\uff08\u5927\u6a13\uff09</label>'
        + '<input type="text" class="form-input" id="asset-location-building" name="location" value="' + esc(a.location || '') + '" placeholder="\u4f8b\u5982\uff1a\u8cc7\u8a0a\u5927\u6a13 3F">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u5b58\u653e\u4f4d\u7f6e\uff08\u623f\u9593\uff09</label>'
        + '<input type="text" class="form-input" id="asset-location-room" name="locationRoom" value="' + esc(a.locationRoom || '') + '" placeholder="\u4f8b\u5982\uff1aA303 \u6a5f\u623f">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">IP \u4f4d\u5740</label>'
        + '<input type="text" class="form-input" id="asset-ip" name="networkAddress" value="' + esc(a.networkAddress || '') + '" placeholder="\u4f8b\u5982\uff1a192.168.1.100">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u7db2\u57df\u540d\u7a31</label>'
        + '<input type="text" class="form-input" id="asset-domain" name="domainName" value="' + esc(a.domainName || '') + '" placeholder="\u9078\u586b">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5ee0\u724c</label>'
        + '<input type="text" class="form-input" id="asset-brand" name="brand" value="' + esc(a.brand || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u578b\u865f</label>'
        + '<input type="text" class="form-input" id="asset-model" name="model" value="' + esc(a.model || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u6578\u91cf</label>'
        + '<input type="number" class="form-input" id="asset-quantity" name="quantity" value="' + esc(a.quantity || '1') + '" min="1">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5e8f\u865f</label>'
        + '<input type="text" class="form-input" name="serialNumber" value="' + esc(a.serialNumber || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u55ae\u4f4d</label>'
        + '<input type="text" class="form-input" name="quantityUnit" value="' + esc(a.quantityUnit || '\u53f0') + '">'
        + '</div>'
        + '</div>';

      // --- Section 3: Security Settings ---
      const securityHtml = ''
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5b58\u53d6\u63a7\u5236\u65b9\u5f0f</label>'
        + '<input type="text" class="form-input" name="accessControl" value="' + esc(a.accessControl || '') + '" placeholder="\u4f8b\u5982\uff1a\u5e33\u5bc6\u63a7\u5236\u3001\u9580\u7981\u7ba1\u5236">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u52a0\u5bc6\u65b9\u5f0f</label>'
        + '<input type="text" class="form-input" name="encryption" value="' + esc(a.encryption || '') + '" placeholder="\u4f8b\u5982\uff1aAES-256\u3001TLS 1.2">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5099\u4efd\u65b9\u5f0f</label>'
        + '<input type="text" class="form-input" name="backupMethod" value="' + esc(a.backupMethod || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u5099\u4efd\u983b\u7387</label>'
        + '<input type="text" class="form-input" name="backupFrequency" value="' + esc(a.backupFrequency || '') + '" placeholder="\u4f8b\u5982\uff1a\u6bcf\u65e5 / \u6bcf\u9031">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5bc6\u78bc\u662f\u5426\u5df2\u8b8a\u66f4</label>'
        + '<select class="form-select" id="asset-password-changed" name="passwordChanged"><option value="">\u8acb\u9078\u64c7</option><option value="\u662f"' + (a.passwordChanged === '\u662f' ? ' selected' : '') + '>\u662f</option><option value="\u5426"' + (a.passwordChanged === '\u5426' ? ' selected' : '') + '>\u5426</option></select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u662f\u5426\u958b\u653e\u9060\u7aef\u7dad\u8b77</label>'
        + '<select class="form-select" id="asset-remote-maintenance" name="remoteMaintenance"><option value="">\u8acb\u9078\u64c7</option><option value="\u662f"' + (a.remoteMaintenance === '\u662f' ? ' selected' : '') + '>\u662f</option><option value="\u5426"' + (a.remoteMaintenance === '\u5426' ? ' selected' : '') + '>\u5426</option></select>'
        + '</div>'
        + '</div>';

      // --- Section 4: CIA Classification ---
      const ciaHtml = ''
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u6a5f\u5bc6\u6027 (C)</label>'
        + '<select class="form-select" id="asset-cia-c" name="ciaC">' + buildSelectOptions(CIA_OPTIONS, a.ciaC || '', true) + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u5b8c\u6574\u6027 (I)</label>'
        + '<select class="form-select" id="asset-cia-i" name="ciaI">' + buildSelectOptions(CIA_OPTIONS, a.ciaI || '', true) + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u53ef\u7528\u6027 (A)</label>'
        + '<select class="form-select" id="asset-cia-a" name="ciaA">' + buildSelectOptions(CIA_OPTIONS, a.ciaA || '', true) + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u6cd5\u5f8b\u9075\u5faa\u6027 (L)</label>'
        + '<select class="form-select" id="asset-cia-l" name="ciaL">' + buildSelectOptions(CIA_OPTIONS, a.ciaL || '', true) + '</select>'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u9632\u8b77\u9700\u6c42\u7b49\u7d1a\uff08\u81ea\u52d5\u8a08\u7b97 = max(C, I, A, L)\uff09</label>'
        + '<input type="text" class="form-input" id="asset-protection-level" value="' + esc(currentProtLevel || '--') + '" readonly style="background:#f5f5f5;font-weight:bold;">'
        + '</div>';

      // --- Section 5: PII ---
      const piiHtml = ''
        + '<div class="form-group">'
        + '<label class="form-check-label asset-flex-cursor">'
        + '<input type="checkbox" class="form-check-input" id="asset-has-pii" name="hasPii"' + (a.hasPii ? ' checked' : '') + '>'
        + '<span>\u6b64\u8cc7\u7522\u5305\u542b\u500b\u4eba\u8cc7\u6599</span>'
        + '</label>'
        + '</div>'
        + '<div id="asset-pii-details"' + (a.hasPii ? '' : ' style="display:none;"') + '>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u662f\u5426\u542b\u654f\u611f\u500b\u8cc7</label>'
        + '<select class="form-select" id="asset-has-sensitive-pii" name="hasSensitivePii"><option value="">\u8acb\u9078\u64c7</option><option value="\u662f"' + (a.hasSensitivePii === '\u662f' ? ' selected' : '') + '>\u662f</option><option value="\u5426"' + (a.hasSensitivePii === '\u5426' ? ' selected' : '') + '>\u5426</option></select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u500b\u8cc7\u7b46\u6578</label>'
        + '<input type="text" class="form-input" id="asset-pii-count" name="piiCount" value="' + esc(a.piiCount || '') + '" placeholder="\u4f8b\u5982\uff1a500 \u7b46">'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u500b\u8cc7\u985e\u5225 / \u8aaa\u660e</label>'
        + '<textarea class="form-textarea" name="piiDescription" rows="2" placeholder="\u4f8b\u5982\uff1a\u59d3\u540d\u3001\u8eab\u5206\u8b49\u5b57\u865f\u3001\u96fb\u8a71">' + esc(a.piiDescription || '') + '</textarea>'
        + '</div>'
        + '</div>';

      // Section 6 (年度版本管理) removed — system auto-sets inventoryYear, changeType, status

      // --- Section 7: IT System ---
      const itSystemHtml = ''
        + '<div class="form-group">'
        + '<label class="form-check-label asset-flex-cursor">'
        + '<input type="checkbox" class="form-check-input" id="asset-is-it-system" name="isItSystem"' + (a.isItSystem ? ' checked' : '') + '>'
        + '<span>\u6b64\u8cc7\u7522\u70ba\u8cc7\u901a\u7cfb\u7d71</span>'
        + '</label>'
        + '</div>'
        + '<div id="asset-it-system-details"' + (a.isItSystem ? '' : ' style="display:none;"') + '>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u7cfb\u7d71\u7d1a\u5225</label>'
        + '<select class="form-select" id="asset-sys-level" name="systemLevel">' + buildSelectOptions(['\u666e', '\u4e2d', '\u9ad8'], a.systemLevel || '', true) + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u7cfb\u7d71\u985e\u578b</label>'
        + '<input type="text" class="form-input" id="asset-sys-type" name="systemType" value="' + esc(a.systemType || '') + '">'
        + '</div>'
        + '</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u7cfb\u7d71\u7dad\u904b\u5ee0\u5546</label>'
        + '<input type="text" class="form-input" id="asset-sys-vendor" name="systemVendor" value="' + esc(a.systemVendor || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u670d\u52d9\u5951\u7d04\u5230\u671f\u65e5</label>'
        + '<input type="date" class="form-input" id="asset-sys-contract-expiry" name="contractExpiry" value="' + esc(a.contractExpiry || '') + '">'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u7cfb\u7d71\u529f\u80fd\u8aaa\u660e</label>'
        + '<textarea class="form-textarea" id="asset-sys-description" name="systemDescription" rows="2">' + esc(a.systemDescription || '') + '</textarea>'
        + '</div>'
        + '<hr class="form-divider">'
        + '<div class="form-section-title">' + ic('clock', 'icon-sm') + ' \u71df\u904b\u6301\u7e8c\u6307\u6a19</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label form-required">RTO\uff08\u7cfb\u7d71\u56de\u5fa9\u6642\u9593\u76ee\u6a19\uff09</label>'
        + '<select class="form-select" id="asset-sys-rto" name="rto">'
        + '<option value="">-- \u8acb\u9078\u64c7 --</option>'
        + '<option value="4\u5c0f\u6642\u5167"' + (a.rto === '4\u5c0f\u6642\u5167' ? ' selected' : '') + '>4\u5c0f\u6642\u5167</option>'
        + '<option value="1\u5929\u4ee5\u5167"' + (a.rto === '1\u5929\u4ee5\u5167' ? ' selected' : '') + '>1\u5929\u4ee5\u5167</option>'
        + '<option value="3\u5929\u4ee5\u5167"' + (a.rto === '3\u5929\u4ee5\u5167' ? ' selected' : '') + '>3\u5929\u4ee5\u5167</option>'
        + '<option value="7\u5929\u4ee5\u5167"' + (a.rto === '7\u5929\u4ee5\u5167' ? ' selected' : '') + '>7\u5929\u4ee5\u5167</option>'
        + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">RPO\uff08\u8cc7\u6599\u56de\u5fa9\u76ee\u6a19\u9ede\uff09</label>'
        + '<select class="form-select" id="asset-sys-rpo" name="rpo">'
        + '<option value="">-- \u8acb\u9078\u64c7 --</option>'
        + '<option value="\u7121\u5099\u4efd\u6a5f\u5236"' + (a.rpo === '\u7121\u5099\u4efd\u6a5f\u5236' ? ' selected' : '') + '>\u7121\u5099\u4efd\u6a5f\u5236</option>'
        + '<option value="1\u5929"' + (a.rpo === '1\u5929' ? ' selected' : '') + '>1\u5929</option>'
        + '<option value="7\u5929"' + (a.rpo === '7\u5929' ? ' selected' : '') + '>7\u5929</option>'
        + '<option value="30\u5929"' + (a.rpo === '30\u5929' ? ' selected' : '') + '>30\u5929</option>'
        + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">MTPD\uff08\u6700\u5927\u53ef\u5bb9\u5fcd\u4e2d\u65b7\u6642\u9593\uff09</label>'
        + '<select class="form-select" id="asset-sys-mtpd" name="mtpd">'
        + '<option value="">-- \u8acb\u9078\u64c7 --</option>'
        + '<option value="8\u5c0f\u6642"' + (a.mtpd === '8\u5c0f\u6642' ? ' selected' : '') + '>8\u5c0f\u6642</option>'
        + '<option value="2\u5929"' + (a.mtpd === '2\u5929' ? ' selected' : '') + '>2\u5929</option>'
        + '<option value="4\u5929"' + (a.mtpd === '4\u5929' ? ' selected' : '') + '>4\u5929</option>'
        + '<option value="7\u5929\u4ee5\u4e0a"' + (a.mtpd === '7\u5929\u4ee5\u4e0a' ? ' selected' : '') + '>7\u5929\u4ee5\u4e0a</option>'
        + '</select>'
        + '</div>'
        + '</div>'
        + '<hr class="form-divider">'
        + '<div class="form-section-title">'
        +   ic('clipboard-check') + ' \u9644\u8868\u5341 \u8cc7\u901a\u7cfb\u7d71\u9632\u8b77\u57fa\u6e96\uff08\u4f9d\u7cfb\u7d71\u7d1a\u5225\u81ea\u52d5\u7be9\u9078\uff09'
        + '</div>'
        + '<div id="asset-appendix10-inline">'
        +   buildInlineAppendix10Checklist(a.systemLevel || '', existingA10Assessments)
        + '</div>'
        + '</div>';

      // --- Section 8: China Brand ---
      const chinaBrandHtml = ''
        + '<div class="form-group">'
        + '<label class="form-check-label asset-flex-cursor">'
        + '<input type="checkbox" class="form-check-input" id="asset-is-china-brand" name="isChinaBrand"' + (a.isChinaBrand ? ' checked' : '') + '>'
        + '<span>\u6b64\u8cc7\u7522\u70ba\u5927\u9678\u5ee0\u724c\u7522\u54c1</span>'
        + '</label>'
        + '</div>'
        + '<div id="asset-china-brand-details"' + (a.isChinaBrand ? '' : ' style="display:none;"') + '>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">\u5ee0\u724c\u540d\u7a31</label>'
        + '<input type="text" class="form-input" id="asset-cn-brand" name="chinaBrandName" value="' + esc(a.chinaBrandName || '') + '">'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u7522\u54c1\u578b\u865f</label>'
        + '<input type="text" class="form-input" id="asset-cn-model" name="chinaBrandModel" value="' + esc(a.chinaBrandModel || '') + '">'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u66ff\u4ee3\u65b9\u6848\u8aaa\u660e</label>'
        + '<textarea class="form-textarea" id="asset-cn-replacement" name="chinaReplacementPlan" rows="2">' + esc(a.chinaReplacementPlan || '') + '</textarea>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u9810\u8a08\u6c70\u63db\u65e5\u671f</label>'
        + '<input type="date" class="form-input" id="asset-cn-replacement-date" name="chinaReplacementDate" value="' + esc(a.chinaReplacementDate || '') + '">'
        + '</div>'
        + '</div>';

      // --- Section 9: Risk Assessment (Scenario-based) ---
      let category = a.category || '';
      const existingRisk = a.riskData || {};
      const checkedIds = existingRisk.scenarioIds || [];

      const riskHtml = ''
        + '<div id="risk-scenarios-container">'
        + buildRiskScenarios(category, checkedIds)
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">'
        // Left: Risk score card
        + '<div style="background:linear-gradient(135deg,#f5f5f5,#e8eaf6);border-radius:12px;padding:20px;text-align:center;">'
        + '<div style="font-size:0.85em;color:#666;margin-bottom:4px;">\u98a8\u96aa\u503c\uff08\u81ea\u52d5\u8a08\u7b97\uff09</div>'
        + '<div id="risk-score-display" style="font-size:2.5em;font-weight:bold;color:#37474f;">--</div>'
        + '<div id="risk-level-display" style="font-size:1.1em;font-weight:bold;margin-top:4px;padding:4px 16px;border-radius:20px;display:inline-block;background:#e0e0e0;color:#666;">--</div>'
        + '</div>'
        // Right: Risk matrix
        + '<div style="background:white;border:1px solid #e0e0e0;border-radius:12px;padding:16px;">'
        + '<div style="font-weight:600;margin-bottom:8px;font-size:0.9em;color:#555;">' + ic('grid-3x3', 'icon-sm') + ' \u98a8\u96aa\u77e9\u9663</div>'
        + '<table id="risk-matrix-table" class="data-table">'
        + '<tr><th></th><th class="text-center">1(\u4f4e)</th><th class="text-center">2(\u4e2d)</th><th class="text-center">3(\u9ad8)</th></tr>'
        + '<tr><td style="font-weight:bold;">3(\u9ad8)</td><td class="text-center" style="background:#FFF9C4;" data-cell="1-3">3</td><td class="text-center" style="background:#FFCDD2;font-weight:bold;" data-cell="2-3">6</td><td class="text-center" style="background:#FFCDD2;font-weight:bold;" data-cell="3-3">9</td></tr>'
        + '<tr><td style="font-weight:bold;">2(\u4e2d)</td><td class="text-center" style="background:#C8E6C9;" data-cell="1-2">2</td><td class="text-center" style="background:#FFF9C4;" data-cell="2-2">4</td><td class="text-center" style="background:#FFCDD2;font-weight:bold;" data-cell="3-2">6</td></tr>'
        + '<tr><td style="font-weight:bold;">1(\u4f4e)</td><td class="text-center" style="background:#C8E6C9;" data-cell="1-1">1</td><td class="text-center" style="background:#C8E6C9;" data-cell="2-1">2</td><td class="text-center" style="background:#FFF9C4;" data-cell="3-1">3</td></tr>'
        + '</table>'
        + '<div style="margin-top:6px;font-size:11px;color:#999;display:flex;gap:12px;">'
        + '<span>\u25cf <span style="color:var(--color-success);">\u4f4e(1-2)</span></span>'
        + '<span>\u25cf <span style="color:var(--color-warning);">\u4e2d(3-4)</span></span>'
        + '<span>\u25cf <span style="color:var(--color-error);">\u9ad8(6-9)</span></span>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '<div id="risk-treatment-section" style="display:none;margin-top:12px;padding:12px;background:#fff8f8;border:1px solid #ffcdd2;border-radius:8px;">'
        + '<div style="font-weight:600;color:var(--color-error);margin-bottom:8px;">' + ic('alert-triangle', 'icon-sm') + ' \u9ad8\u98a8\u96aa \u2014 \u5fc5\u9808\u586b\u5beb\u8655\u7f6e\u65b9\u5f0f</div>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u98a8\u96aa\u8655\u7f6e\u65b9\u5f0f</label>'
        + '<select class="form-select" id="asset-risk-treatment" name="riskTreatment">'
        + '<option value="">-- \u8acb\u9078\u64c7 --</option>'
        + '<option value="\u964d\u4f4e"' + ((existingRisk.treatment === '\u964d\u4f4e') ? ' selected' : '') + '>\u964d\u4f4e</option>'
        + '<option value="\u8f49\u79fb"' + ((existingRisk.treatment === '\u8f49\u79fb') ? ' selected' : '') + '>\u8f49\u79fb</option>'
        + '<option value="\u907f\u514d"' + ((existingRisk.treatment === '\u907f\u514d') ? ' selected' : '') + '>\u907f\u514d</option>'
        + '</select>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">\u6b98\u9918\u98a8\u96aa\u7b49\u7d1a</label>'
        + '<select class="form-select" id="asset-risk-residual" name="riskResidual">'
        + '<option value="">-- \u8acb\u9078\u64c7 --</option>'
        + '<option value="\u4f4e"' + ((existingRisk.residualRisk === '\u4f4e') ? ' selected' : '') + '>\u4f4e</option>'
        + '<option value="\u4e2d"' + ((existingRisk.residualRisk === '\u4e2d') ? ' selected' : '') + '>\u4e2d</option>'
        + '</select>'
        + '</div>'
        + '</div>'
        + '<div class="form-group">'
        + '<label class="form-label form-required">\u63a7\u5236\u63aa\u65bd\u8aaa\u660e</label>'
        + '<textarea class="form-textarea" id="asset-risk-control-desc" name="riskControlDescription" rows="2" placeholder="\u8aaa\u660e\u5c07\u63a1\u53d6\u7684\u63a7\u5236\u63aa\u65bd...">' + esc(existingRisk.controlDescription || '') + '</textarea>'
        + '</div>'
        + '</div>';

      // ========== Assemble full form ==========
      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header asset-flex-between">'
        + '<h2>' + ic(isEdit ? 'edit' : 'plus-circle') + ' ' + esc(title) + '</h2>'
        + '<div class="page-header-actions asset-flex-gap8">'
        + '<button class="btn btn-outline" data-action="app.backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + '<form id="asset-form" autocomplete="off">'
        + '<input type="hidden" id="asset-id-hidden" name="_assetId" value="' + esc(isEdit ? assetId : '') + '">'

        + formCard('basic', 'file-text', '1. \u57fa\u672c\u8cc7\u6599', '\u5fc5\u586b', basicHtml, { collapsed: false })
        + formCard('location', 'map-pin', '2. \u4f4d\u7f6e\u8207\u898f\u683c', '\u786c\u9ad4\u4f4d\u7f6e\u3001\u7db2\u8def\u8cc7\u8a0a', locationHtml, { collapsed: true })
        + formCard('security', 'shield', '3. \u5b89\u5168\u8a2d\u5b9a', '\u5b58\u53d6\u63a7\u5236\u3001\u5099\u4efd', securityHtml, { collapsed: true })
        + formCard('cia', 'bar-chart-2', '4. CIA \u9632\u8b77\u9700\u6c42\u5206\u7d1a', '\u81ea\u52d5\u8a08\u7b97\u9632\u8b77\u7b49\u7d1a', ciaHtml, { collapsed: false })
        + formCard('pii', 'user-check', '5. \u500b\u8cc7\u76f8\u95dc', '\u500b\u4eba\u8cc7\u6599', piiHtml, { collapsed: false })
        // Section 6 removed (auto-managed)
        + formCard('itSystem', 'server', '6. \u8cc7\u901a\u7cfb\u7d71\u5c08\u5c6c', '\u50c5\u8cc7\u901a\u7cfb\u7d71\u9700\u586b', itSystemHtml, { borderColor: '#1976D2', collapsed: false })
        + formCard('chinaBrand', 'alert-circle', '7. \u5927\u9678\u5ee0\u724c', '\u50c5\u5927\u9678\u5ee0\u724c\u7522\u54c1\u9700\u586b', chinaBrandHtml, { borderColor: '#E65100', collapsed: false })
        + formCard('risk', 'activity', '8. \u98a8\u96aa\u8a55\u9451', '\u53ef\u80fd\u6027 \u00d7 \u885d\u64ca\u6027', riskHtml, { borderColor: '#2E7D32', collapsed: false })

        + '<div class="page-header-actions" style="justify-content:flex-end;margin-top:20px;padding-bottom:40px;">'
        + '<button type="button" class="btn btn-outline" data-action="app.backToList">\u53d6\u6d88</button>'
        + '<button type="button" class="btn btn-primary" data-action="app.saveAsset">' + ic('save') + ' \u5132\u5b58</button>'
        + '</div>'
        + '</form>'
        + '</div>';

      scheduleRefreshIcons();

      // ========== Action handlers ==========
      bindActions({
        backToList: function () {
          return '#assets';
        },
        a10AllConform: function () {
          const selects = document.querySelectorAll('[data-a10-idx]');
          selects.forEach(function (sel) {
            sel.value = '\u7b26\u5408';
            const tr = sel.closest('tr');
            if (tr) tr.style.background = '#e8f5e9';
          });
        },
        toggleSection: function (ctx) {
          const targetId = ctx.element && ctx.element.getAttribute('data-target');
          if (!targetId) return;
          const bodyEl = document.getElementById(targetId);
          if (!bodyEl) return;
          const isVisible = bodyEl.style.display !== 'none';
          bodyEl.style.display = isVisible ? 'none' : '';
          const iconSpan = ctx.element.querySelector('.section-toggle-icon');
          if (iconSpan) {
            iconSpan.textContent = isVisible ? '\u25b8' : '\u25be';
          }
        },
        saveAsset: function () {
          const form = document.getElementById('asset-form');
          if (!form) return;

          // Read all fields
          const payload = {};
          const inputs = form.querySelectorAll('input, select, textarea');
          for (let i = 0; i < inputs.length; i++) {
            const el = inputs[i];
            let name = el.getAttribute('name');
            if (!name || name === '_assetId') continue;
            if (el.type === 'checkbox') {
              payload[name] = el.checked;
            } else {
              payload[name] = el.value;
            }
          }

          // Validation
          if (!payload.assetName) {
            toast('\u8acb\u8f38\u5165\u8cc7\u7522\u540d\u7a31', 'error');
            const nameEl = document.getElementById('asset-name');
            if (nameEl) nameEl.focus();
            return;
          }
          if (!payload.category) {
            toast('\u8acb\u9078\u64c7\u4e3b\u5206\u985e', 'error');
            const catEl = document.getElementById('asset-category');
            if (catEl) catEl.focus();
            return;
          }

          // Map form field names to backend field names
          if (payload.ciaC) { payload.confidentiality = payload.ciaC; delete payload.ciaC; }
          if (payload.ciaI) { payload.integrity = payload.ciaI; delete payload.ciaI; }
          if (payload.ciaA) { payload.availability = payload.ciaA; delete payload.ciaA; }
          if (payload.ciaL) { payload.legalCompliance = payload.ciaL; delete payload.ciaL; }

          // Auto-set version fields (no longer user-facing)
          const hiddenId = (document.getElementById('asset-id-hidden') || {}).value || '';
          if (!payload.inventoryYear) payload.inventoryYear = getCurrentRocYear();
          if (!payload.changeType) payload.changeType = hiddenId ? '\u4fee\u6539' : '\u65b0\u589e';
          if (!payload.status) payload.status = '\u586b\u5831\u4e2d';

          // Remove inline appendix10 select fields from payload (they use name="a10_*")
          Object.keys(payload).forEach(function(k) {
            if (k.indexOf('a10_') === 0) delete payload[k];
          });

          // Collect inline appendix10 assessments
          const a10Selects = form.querySelectorAll('[data-a10-idx]');
          const a10Assessments = [];
          const filteredA10Data = APPENDIX10_DATA.filter(function(row) {
            return isApplicable(payload.systemLevel || '', row.l);
          });
          a10Selects.forEach(function(sel, i) {
            if (sel.value && filteredA10Data[i]) {
              a10Assessments.push({
                dimension: filteredA10Data[i].d,
                code: filteredA10Data[i].c,
                control: filteredA10Data[i].t,
                result: sel.value,
                note: ''
              });
            }
          });

          // Collect risk scenario data
          const riskChecks = form.querySelectorAll('.risk-scenario-check:checked');
          const scenarioIds = [];
          let maxL = 0, maxI = 0;
          riskChecks.forEach(function(cb) {
            scenarioIds.push(cb.getAttribute('data-scenario-id'));
            let l = parseInt(cb.getAttribute('data-likelihood'), 10) || 0;
            let i = parseInt(cb.getAttribute('data-impact'), 10) || 0;
            if (l > maxL) maxL = l;
            if (i > maxI) maxI = i;
          });
          const riskScore = maxL * maxI;
          const riskLevel = riskScore >= 6 ? '\u9ad8' : riskScore >= 3 ? '\u4e2d' : riskScore >= 1 ? '\u4f4e' : '';
          payload.riskData = {
            scenarioIds: scenarioIds,
            likelihood: maxL,
            impact: maxI,
            riskScore: riskScore,
            riskLevel: riskLevel,
            treatment: (form.querySelector('#asset-risk-treatment') || {}).value || '',
            residualRisk: (form.querySelector('#asset-risk-residual') || {}).value || '',
            controlDescription: (form.querySelector('#asset-risk-control-desc') || {}).value || ''
          };

          const endpoint = (CONFIG && CONFIG.assetInventoryEndpoint) || '/api/assets';
          // hiddenId already declared above in this scope
          const editMode = !!hiddenId;
          const url = endpoint + (editMode ? '/' + hiddenId : '');

          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ payload: payload })
          }).then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.ok === false) {
                toast('\u5132\u5b58\u5931\u6557\uff1a' + (data.message || '\u672a\u77e5\u932f\u8aa4'), 'error');
                return;
              }
              // Save appendix10 assessments if this is an IT system with assessments
              if (payload.isItSystem && a10Assessments.length > 0) {
                const assetSavedId = data.id || hiddenId;
                if (assetSavedId) {
                  fetch(endpoint + '/' + assetSavedId + '/appendix10', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ payload: {
                      protectionLevel: payload.systemLevel || '',
                      assessments: a10Assessments
                    }})
                  });
                }
              }
              toast(editMode ? '\u8cc7\u7522\u5df2\u66f4\u65b0' : '\u8cc7\u7522\u5df2\u65b0\u589e', 'success');
              window.location.hash = '#assets';
            })
            .catch(function (err) {
              toast('\u5132\u5b58\u5931\u6557\uff1a' + String(err && err.message || err), 'error');
            });
        }
      });

      // ========== Dynamic form events via document-level delegation ==========
      bindFormDynamicBehaviors();
    }

    function bindFormDynamicBehaviors() {
      // Use a single document-level change listener with delegation.
      // We tag the listener so it can be identified if cleanup is needed.
      const listenerKey = '__assetFormChangeListener';
      if (window[listenerKey]) {
        document.removeEventListener('change', window[listenerKey], true);
      }

      function onFormChange(e) {
        let target = e.target;
        if (!target) return;
        const form = document.getElementById('asset-form');
        if (!form) return;

        // Handle inline appendix10 assessment dropdown changes
        if (target.getAttribute && target.getAttribute('data-a10-idx') !== null) {
          const tr = target.closest('tr');
          if (tr) {
            if (target.value === '\u7b26\u5408') {
              tr.style.background = '#e8f5e9';
            } else if (target.value === '\u4e0d\u7b26\u5408') {
              tr.style.background = '#ffebee';
            } else if (target.value === '\u4e0d\u9069\u7528') {
              tr.style.background = '#f5f5f5';
            } else {
              tr.style.background = '';
            }
          }
          return;
        }

        // --- Risk scenario checkbox change ---
        if (target.classList && target.classList.contains('risk-scenario-check')) {
          const checks = document.querySelectorAll('.risk-scenario-check:checked');
          let maxL = 0, maxI = 0;
          checks.forEach(function(cb) {
            let l = parseInt(cb.getAttribute('data-likelihood'), 10) || 0;
            let i = parseInt(cb.getAttribute('data-impact'), 10) || 0;
            if (l > maxL) maxL = l;
            if (i > maxI) maxI = i;
          });
          const score = maxL * maxI;
          let level = score >= 6 ? '\u9ad8' : score >= 3 ? '\u4e2d' : score >= 1 ? '\u4f4e' : '--';
          const levelColor = level === '\u9ad8' ? 'var(--color-error)' : level === '\u4e2d' ? 'var(--color-warning)' : level === '\u4f4e' ? 'var(--color-success)' : '#666';
          const scoreEl = document.getElementById('risk-score-display');
          const levelEl = document.getElementById('risk-level-display');
          if (scoreEl) scoreEl.textContent = score || '--';
          if (levelEl) { levelEl.textContent = level; levelEl.style.color = levelColor; }
          const treatmentEl = document.getElementById('risk-treatment-section');
          if (treatmentEl) treatmentEl.style.display = level === '\u9ad8' ? '' : 'none';
          // Update card styling and count
          const totalChecked = checks.length;
          const countEl = document.getElementById('risk-checked-count');
          if (countEl) countEl.textContent = '\u5df2\u52fe\u9078 ' + totalChecked + ' \u9805';
          document.querySelectorAll('.risk-scenario-check').forEach(function(cb) {
            const card = cb.closest('.risk-scenario-card');
            if (card) {
              card.style.background = cb.checked ? '#fff3e0' : '#fafafa';
              card.style.borderColor = cb.checked ? '#ff9800' : '#e0e0e0';
            }
          });
          // Update risk level badge style
          if (levelEl) {
            levelEl.style.background = level === '\u9ad8' ? '#FFCDD2' : level === '\u4e2d' ? '#FFF9C4' : level === '\u4f4e' ? '#C8E6C9' : '#e0e0e0';
            levelEl.style.color = levelColor;
          }
          // Highlight matching cell in risk matrix
          const matrixTable = document.getElementById('risk-matrix-table');
          if (matrixTable) {
            matrixTable.querySelectorAll('[data-cell]').forEach(function(td) {
              td.style.outline = '';
              td.style.outlineOffset = '';
            });
            if (maxL > 0 && maxI > 0) {
              const matchCell = matrixTable.querySelector('[data-cell="' + maxL + '-' + maxI + '"]');
              if (matchCell) {
                matchCell.style.outline = '3px solid #1565c0';
                matchCell.style.outlineOffset = '-2px';
              }
            }
          }
          return;
        }

        if (!target.id) return;

        switch (target.id) {
          // --- Category -> SubCategory cascade ---
          case 'asset-category': {
            const subCatEl = document.getElementById('asset-sub-category');
            if (subCatEl) {
              subCatEl.innerHTML = buildSubCategorySelectOptions(target.value, '', true);
            }
            // 更新編號預覽
            const idField = document.getElementById('asset-id-display');
            if (idField && !idField.value) {
              const catCode = target.value ? target.value.substring(0, 2).toUpperCase() : '{分類}';
              idField.placeholder = 'NTU-' + userUnitCode + '-IS3-' + catCode + '-F{序號}';
            }
            const riskContainer = document.getElementById('risk-scenarios-container');
            if (riskContainer) {
              riskContainer.innerHTML = buildRiskScenarios(target.value, []);
            }
            // Reset risk score/level displays
            const rScoreEl = document.getElementById('risk-score-display');
            const rLevelEl = document.getElementById('risk-level-display');
            if (rScoreEl) rScoreEl.textContent = '--';
            if (rLevelEl) { rLevelEl.textContent = '--'; rLevelEl.style.color = '#666'; }
            const rTreatEl = document.getElementById('risk-treatment-section');
            if (rTreatEl) rTreatEl.style.display = 'none';
            break;
          }

          // --- CIA -> Protection level auto-compute ---
          case 'asset-cia-c':
          case 'asset-cia-i':
          case 'asset-cia-a':
          case 'asset-cia-l': {
            const cC = (document.getElementById('asset-cia-c') || {}).value || '';
            const cI = (document.getElementById('asset-cia-i') || {}).value || '';
            const cA = (document.getElementById('asset-cia-a') || {}).value || '';
            const cL = (document.getElementById('asset-cia-l') || {}).value || '';
            const vals = [cC, cI, cA, cL].filter(function(v) { return v; });
            const maxVal = vals.reduce(function(mx, v) { return (CIA_VALUE_MAP[v] || 0) > (CIA_VALUE_MAP[mx] || 0) ? v : mx; }, vals[0] || '');
            const protEl = document.getElementById('asset-protection-level');
            if (protEl) protEl.value = maxVal || '--';
            break;
          }

          // --- hasPii checkbox -> toggle PII details ---
          case 'asset-has-pii': {
            const piiDetails = document.getElementById('asset-pii-details');
            if (piiDetails) piiDetails.style.display = target.checked ? '' : 'none';
            break;
          }

          // --- isItSystem checkbox -> toggle IT system section ---
          case 'asset-is-it-system': {
            const itDetails = document.getElementById('asset-it-system-details');
            if (itDetails) itDetails.style.display = target.checked ? '' : 'none';
            break;
          }

          // --- isItSystem checkbox -> also reset inline checklist when toggled on ---

          // --- System level change -> rebuild inline appendix10 checklist ---
          case 'asset-sys-level': {
            const a10Container = document.getElementById('asset-appendix10-inline');
            if (a10Container) {
              a10Container.innerHTML = buildInlineAppendix10Checklist(target.value || '', []);
            }
            break;
          }

          // --- isChinaBrand checkbox -> toggle China brand section ---
          case 'asset-is-china-brand': {
            const cnDetails = document.getElementById('asset-china-brand-details');
            if (cnDetails) cnDetails.style.display = target.checked ? '' : 'none';
            break;
          }

          // (Risk score is now computed via risk-scenario-check listener above)
        }
      }

      window[listenerKey] = onFormChange;
      document.addEventListener('change', onFormChange, true);
    }

    // -------------------------------------------------------
    // renderAssetDetail
    // -------------------------------------------------------
    async function renderAssetDetail(assetId) {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-empty">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div></div>';
      scheduleRefreshIcons();

      let asset;
      try {
        const resp = await apiCall('GET', '/' + assetId);
        asset = resp && resp.item ? resp.item : resp;
      } catch (err) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-error">'
          + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p>'
          + '<button class="btn btn-outline" data-action="app.backToList">\u8fd4\u56de\u5217\u8868</button></div></div>';
        scheduleRefreshIcons();
        bindActions({ backToList: function () { return '#assets'; } });
        return;
      }

      const a = asset || {};
      const riskScore = computeRiskScore(a.riskLikelihood, a.riskImpact);
      const riskLevel = a.riskLevel || getRiskLevel(riskScore);
      const protLevel = a.protectionLevel || computeProtectionLevel(a.ciaC, a.ciaI, a.ciaA, a.ciaL);

      function detailRow(label, value) {
        return '<tr><td class="nowrap" style="font-weight:600;width:180px;">' + esc(label) + '</td>'
          + '<td>' + esc(value || '\u2014') + '</td></tr>';
      }

      function detailBadgeRow(label, badgeHtml) {
        return '<tr><td class="nowrap" style="font-weight:600;width:180px;">' + esc(label) + '</td>'
          + '<td>' + badgeHtml + '</td></tr>';
      }

      const basicTable = '<table class="detail-table asset-table">'
        + detailRow('\u8cc7\u7522\u7de8\u865f', a.assetId)
        + detailRow('\u8cc7\u7522\u540d\u7a31', a.assetName)
        + detailRow('\u82f1\u6587\u540d\u7a31', a.assetNameEn)
        + detailRow('\u4e3b\u5206\u985e', getCategoryLabel(a.category))
        + detailRow('\u5b50\u5206\u985e', a.subCategory)
        + detailRow('\u64c1\u6709\u8005', a.ownerName)
        + detailRow('\u4fdd\u7ba1\u55ae\u4f4d', a.ownerUnit)
        + detailRow('\u8cc7\u7522\u8aaa\u660e', a.description)
        + '</table>';

      const locationTable = '<table class="detail-table asset-table">'
        + detailRow('\u5b58\u653e\u4f4d\u7f6e', a.location)
        + detailRow('\u7db2\u8def\u4f4d\u5740 / IP', a.networkAddress)
        + detailRow('\u5ee0\u724c', a.brand)
        + detailRow('\u578b\u865f', a.model)
        + detailRow('\u5e8f\u865f', a.serialNumber)
        + detailRow('\u6570\u91cf', a.quantity)
        + detailRow('\u55ae\u4f4d', a.quantityUnit)
        + '</table>';

      const securityTable = '<table class="detail-table asset-table">'
        + detailRow('\u5b58\u53d6\u63a7\u5236\u65b9\u5f0f', a.accessControl)
        + detailRow('\u52a0\u5bc6\u65b9\u5f0f', a.encryption)
        + detailRow('\u5099\u4efd\u65b9\u5f0f', a.backupMethod)
        + detailRow('\u5099\u4efd\u983b\u7387', a.backupFrequency)
        + '</table>';

      const ciaTable = '<table class="detail-table asset-table">'
        + detailRow('\u6a5f\u5bc6\u6027 (C)', a.ciaC)
        + detailRow('\u5b8c\u6574\u6027 (I)', a.ciaI)
        + detailRow('\u53ef\u7528\u6027 (A)', a.ciaA)
        + detailRow('\u6cd5\u5f8b\u9075\u5faa\u6027 (L)', a.ciaL)
        + detailBadgeRow('\u9632\u8b77\u9700\u6c42\u7b49\u7d1a', '<strong>' + esc(protLevel || '\u2014') + '</strong>')
        + '</table>';

      let piiTable = '<table class="detail-table asset-table">'
        + detailRow('\u5305\u542b\u500b\u4eba\u8cc7\u6599', a.hasPii ? '\u662f' : '\u5426');
      if (a.hasPii) {
        piiTable += detailRow('\u500b\u8cc7\u985e\u5225', a.piiCategory)
          + detailRow('\u500b\u8cc7\u7b46\u6578', a.piiCount)
          + detailRow('\u500b\u8cc7\u8aaa\u660e', a.piiDescription);
      }
      piiTable += '</table>';

      const versionTable = '<table class="detail-table asset-table">'
        + detailRow('\u76e4\u9ede\u5e74\u5ea6', a.inventoryYear)
        + detailRow('\u7570\u52d5\u985e\u578b', a.changeType)
        + detailBadgeRow('\u72c0\u614b', statusBadge(a.status))
        + detailRow('\u7570\u52d5\u8aaa\u660e', a.changeDescription)
        + '</table>';

      let itSystemTable = '';
      if (a.isItSystem) {
        itSystemTable = '<table class="detail-table asset-table">'
          + detailRow('\u8cc7\u901a\u5b89\u5168\u7cfb\u7d71', '\u662f')
          + detailRow('\u7cfb\u7d71\u7d1a\u5225', a.systemLevel)
          + detailRow('\u7cfb\u7d71\u7c7b\u578b', a.systemType)
          + detailRow('\u7cfb\u7d71\u7dad\u904b\u5ee0\u5546', a.systemVendor)
          + detailRow('\u670d\u52d9\u5951\u7d04\u5230\u671f\u65e5', a.contractExpiry)
          + detailRow('\u7cfb\u7d71\u529f\u80fd\u8aaa\u660e', a.systemDescription)
          + detailRow('RTO', a.rto)
          + detailRow('RPO', a.rpo)
          + detailRow('MTPD', a.mtpd)
          + '</table>';
      }

      let itProtectionTable = '';
      if (a.isItSystem) {
        itProtectionTable = '<table class="detail-table asset-table">'
          + detailRow('\u5b58\u53d6\u63a7\u5236\u63aa\u65bd', a.itAccessControl)
          + detailRow('\u65e5\u8a8c\u7ba1\u7406\u63aa\u65bd', a.itLogManagement)
          + detailRow('\u60e1\u610f\u7a0b\u5f0f\u9632\u8b77', a.itMalwareProtection)
          + detailRow('\u5f31\u9ede\u6aa2\u6e2c\u63aa\u65bd', a.itVulnerabilityMgmt)
          + detailRow('\u5176\u4ed6\u9632\u8b77\u63aa\u65bd', a.itOtherProtection)
          + '</table>';
      }

      let chinaBrandTable = '';
      if (a.isChinaBrand) {
        chinaBrandTable = '<table class="detail-table asset-table">'
          + detailRow('\u5927\u9678\u5ee0\u724c\u7522\u54c1', '\u662f')
          + detailRow('\u5ee0\u724c\u540d\u7a31', a.chinaBrandName)
          + detailRow('\u7522\u54c1\u578b\u865f', a.chinaBrandModel)
          + detailRow('\u66ff\u4ee3\u65b9\u6848\u8aaa\u660e', a.chinaReplacementPlan)
          + detailRow('\u9810\u8a08\u6c70\u63db\u65e5\u671f', a.chinaReplacementDate)
          + '</table>';
      }

      const riskTable = '<table class="detail-table asset-table">'
        + detailRow('\u53ef\u80fd\u6027', a.riskLikelihood)
        + detailRow('\u885d\u64ca\u6027', a.riskImpact)
        + detailRow('\u98a8\u96aa\u5206\u6578', riskScore ? String(riskScore) : '\u2014')
        + detailBadgeRow('\u98a8\u96aa\u7b49\u7d1a', riskLevel ? '<span class="badge ' + getRiskBadgeClass(riskLevel) + '"><span class="badge-dot"></span>' + esc(riskLevel) + '</span>' : '\u2014')
        + detailRow('\u98a8\u96aa\u8655\u7406\u65b9\u5f0f', a.riskTreatment)
        + detailRow('\u6b98\u9918\u98a8\u96aa\u8aaa\u660e', a.residualRiskNote)
        + '</table>';

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header asset-flex-between">'
        + '<h2>' + ic('file-text') + ' \u8cc7\u7522\u8a73\u60c5</h2>'
        + '<div class="page-header-actions asset-flex-gap8">'
        + '<button class="btn btn-primary" data-action="app.editThisAsset">' + ic('edit') + ' \u7de8\u8f2f</button>'
        + '<button class="btn btn-outline" data-action="app.backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + buildCollapsibleSection('detail-basic', '1. \u57fa\u672c\u8cc7\u6599', basicTable, { open: true })
        + buildCollapsibleSection('detail-location', '2. \u4f4d\u7f6e\u8207\u898f\u683c', locationTable, { open: true })
        + buildCollapsibleSection('detail-security', '3. \u5b89\u5168\u8a2d\u5b9a', securityTable, { open: true })
        + buildCollapsibleSection('detail-cia', '4. CIA \u9632\u8b77\u9700\u6c42\u5206\u7d1a', ciaTable, { open: true })
        + buildCollapsibleSection('detail-pii', '5. \u500b\u8cc7\u76f8\u95dc', piiTable, { open: true })
        + buildCollapsibleSection('detail-version', '6. \u5e74\u5ea6\u7248\u672c\u7ba1\u7406', versionTable, { open: true })
        + (a.isItSystem ? buildCollapsibleSection('detail-itSystem', '6. \u8cc7\u901a\u7cfb\u7d71\u5c08\u5c6c', itSystemTable, { open: true, borderColor: '#3498db' }) : '')
        + (a.isItSystem ? buildCollapsibleSection('detail-itProtection', '8. \u9632\u8b77\u7b49\u7d1a\u8a55\u4f30', itProtectionTable, { open: true, borderColor: '#3498db' }) : '')
        + (a.isChinaBrand ? buildCollapsibleSection('detail-chinaBrand', '9. \u5927\u9678\u5ee0\u724c', chinaBrandTable, { open: true, borderColor: '#e67e22' }) : '')
        + buildCollapsibleSection('detail-risk', '10. \u98a8\u96aa\u8a55\u9451', riskTable, { open: true, borderColor: '#27ae60' })

        + '<div class="asset-pad-bottom"></div>'
        + '</div>';

      scheduleRefreshIcons();

      bindActions({
        editThisAsset: function () {
          return '#asset-edit/' + assetId;
        },
        backToList: function () {
          return '#assets';
        }
      });

      // Bind section toggle
      addPageEventListener(appEl, 'click', function (e) {
        let header = e.target.closest && e.target.closest('[data-toggle-section]');
        if (!header) return;
        const sectionId = header.getAttribute('data-toggle-section');
        const bodyEl = document.getElementById('asset-section-body-' + sectionId);
        if (!bodyEl) return;
        const isVisible = bodyEl.style.display !== 'none';
        bodyEl.style.display = isVisible ? 'none' : '';
        const iconSpan = header.querySelector('.section-toggle-icon');
        if (iconSpan) {
          iconSpan.innerHTML = ic(isVisible ? 'chevron-down' : 'chevron-up');
          scheduleRefreshIcons();
        }
      });
    }

    // -------------------------------------------------------
    // renderAppendix10
    // -------------------------------------------------------
    async function renderAppendix10(assetId) {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      // APPENDIX10_DATA and isApplicable are now at module level

      // -- Collect unique dimension names for filter --
      const dimensionSet = {};
      for (let di = 0; di < APPENDIX10_DATA.length; di++) {
        dimensionSet[APPENDIX10_DATA[di].d] = true;
      }
      const dimensions = Object.keys(dimensionSet);

      // -- Show loading --
      appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-empty">'
        + ic('loader') + ' 載入中...</div></div>';
      scheduleRefreshIcons();

      // -- Fetch asset + existing assessments --
      let asset, appendixData;
      try {
        const results = await Promise.all([
          apiCall('GET', '/' + assetId),
          apiCall('GET', '/' + assetId + '/appendix10')
        ]);
        asset = results[0] && results[0].item ? results[0].item : results[0];
        appendixData = results[1] || {};
      } catch (err) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-error">'
          + ic('alert-triangle') + '<p>載入失敗：' + esc(String(err && err.message || err)) + '</p>'
          + '<button class="btn btn-outline" data-action="app.backToDetail">' + ic('arrow-left') + ' 返回</button></div></div>';
        scheduleRefreshIcons();
        bindActions({
          backToDetail: function () { return '#asset-detail/' + assetId; }
        });
        return;
      }

      const a = asset || {};
      const protLevel = appendixData.protectionLevel
        || a.protectionLevel
        || computeProtectionLevel(a.ciaC, a.ciaI, a.ciaA, a.ciaL)
        || '';
      const existingAssessments = Array.isArray(appendixData.assessments) ? appendixData.assessments : [];
      const complianceStatus = appendixData.complianceStatus || '';

      // -- Build lookup map from existing assessments --
      function assessmentKey(dimension, code, control) {
        return dimension + '|' + code + '|' + control;
      }
      const assessmentMap = {};
      for (let ai = 0; ai < existingAssessments.length; ai++) {
        const ea = existingAssessments[ai];
        const key = assessmentKey(ea.dimension, ea.code, ea.control);
        assessmentMap[key] = ea;
      }

      // -- Build filter bar --
      let filterHtml = '<div class="card toolbar asset-mb-16">'
        + '<div class="toolbar-filters">'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">構面篩選</label>'
        + '<select class="form-select" id="a10-filter-dimension">'
        + '<option value="">全部構面</option>';
      for (let fi = 0; fi < dimensions.length; fi++) {
        filterHtml += '<option value="' + esc(dimensions[fi]) + '">' + esc(dimensions[fi]) + '</option>';
      }
      filterHtml += '</select></div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">顯示範圍</label>'
        + '<div class="toolbar-filters">'
        + '<label class="form-check-label">'
        + '<input type="radio" name="a10ShowMode" value="all" checked> 全部措施'
        + '</label>'
        + '<label class="form-check-label">'
        + '<input type="radio" name="a10ShowMode" value="applicable"> 僅適用項目'
        + '</label>'
        + '</div></div>'
        + '</div></div>';

      // -- Build info bar --
      const protBadgeClass = protLevel === '高' ? 'badge-danger' : (protLevel === '中' ? 'badge-warning' : 'badge-success');
      const infoHtml = '<div class="card toolbar">'
        + '<span>' + ic('server') + ' <strong>' + esc(a.assetName || '未命名資產') + '</strong></span>'
        + '<span>防護等級：<span class="badge ' + protBadgeClass + '"><span class="badge-dot"></span>' + esc(protLevel || '未設定') + '</span></span>'
        + (complianceStatus ? '<span>合規狀態：' + esc(complianceStatus) + '</span>' : '')
        + '</div>';

      // -- Build assessment table rows --
      let tableRowsHtml = '';
      for (let ri = 0; ri < APPENDIX10_DATA.length; ri++) {
        let row = APPENDIX10_DATA[ri];
        const rowKey = assessmentKey(row.d, row.c, row.t);
        const existing = assessmentMap[rowKey] || {};
        const result = existing.result || '';
        const note = existing.note || '';
        let applicable = isApplicable(protLevel, row.l);

        let rowBg = '';
        if (result === '符合') rowBg = 'background:#e8f5e9;';
        else if (result === '不符合') rowBg = 'background:#ffebee;';
        else if (result === '不適用') rowBg = 'background:#f5f5f5;';

        const levelBadge = row.l === '共通' ? 'badge-info'
          : (row.l === '高' ? 'badge-danger'
            : (row.l === '中' ? 'badge-warning'
              : (row.l === '普' ? 'badge-success' : 'badge-secondary')));

        tableRowsHtml += '<tr class="a10-row" data-dimension="' + esc(row.d) + '" data-level="' + esc(row.l) + '" data-applicable="' + (applicable ? 'yes' : 'no') + '" data-idx="' + ri + '"' + (rowBg ? ' style="' + rowBg + '"' : '') + '>'
          + '<td class="nowrap">' + esc(row.d) + '</td>'
          + '<td class="nowrap">' + esc(row.c) + '</td>'
          + '<td class="text-center"><span class="badge ' + levelBadge + '" style="font-size:0.8em;">' + esc(row.l) + '</span></td>'
          + '<td style="min-width:240px;">' + esc(row.t) + '</td>'
          + '<td style="min-width:110px;">'
          + '<select class="form-select a10-result" data-idx="' + ri + '">'
          + '<option value="">-- 請選擇 --</option>'
          + '<option value="符合"' + (result === '符合' ? ' selected' : '') + '>符合</option>'
          + '<option value="不符合"' + (result === '不符合' ? ' selected' : '') + '>不符合</option>'
          + '<option value="不適用"' + (result === '不適用' ? ' selected' : '') + '>不適用</option>'
          + '</select></td>'
          + '<td style="min-width:140px;">'
          + '<input type="text" class="form-input a10-note" data-idx="' + ri + '" value="' + esc(note) + '" placeholder="備註">'
          + '</td>'
          + '</tr>';
      }

      // -- Compute initial summary --
      let initComply = 0, initNonComply = 0, initNA = 0, initTotal = APPENDIX10_DATA.length;
      for (let si = 0; si < existingAssessments.length; si++) {
        if (existingAssessments[si].result === '符合') initComply++;
        else if (existingAssessments[si].result === '不符合') initNonComply++;
        else if (existingAssessments[si].result === '不適用') initNA++;
      }

      // -- Assemble page --
      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header asset-flex-between">'
        + '<h2>' + ic('clipboard-list') + ' 附表十 資通系統防護基準評估</h2>'
        + '<div class="page-header-actions asset-flex-gap8">'
        + '<button class="btn btn-outline" data-action="app.backToDetail">' + ic('arrow-left') + ' 返回資產</button>'
        + '<button class="btn btn-primary" data-action="app.saveAppendix10">' + ic('save') + ' 儲存評估</button>'
        + '</div>'
        + '</div>'

        + infoHtml
        + filterHtml

        + '<div id="a10-summary" class="card toolbar">'
        + '<span>' + ic('check-circle') + ' <strong id="a10-comply-count">' + initComply + '</strong>/' + initTotal + ' 符合</span>'
        + '<span style="color:var(--color-error);">' + ic('x-circle') + ' <strong id="a10-noncomply-count">' + initNonComply + '</strong> 不符合</span>'
        + '<span class="text-muted">' + ic('minus-circle') + ' <strong id="a10-na-count">' + initNA + '</strong> 不適用</span>'
        + '</div>'

        + '<div class="table-wrapper asset-scroll-x" tabindex="0">'
        + '<table id="a10-table">'
        + '<caption class="sr-only">附表十資通系統防護基準評估表</caption>'
        + '<thead><tr>'
        + '<th scope="col" class="asset-nowrap">構面</th>'
        + '<th scope="col" class="asset-nowrap">措施代碼</th>'
        + '<th scope="col" class="text-center nowrap">防護分級</th>'
        + '<th scope="col">控制措施</th>'
        + '<th scope="col" class="asset-nowrap">評估</th>'
        + '<th scope="col" class="asset-nowrap">備註</th>'
        + '</tr></thead>'
        + '<tbody>' + tableRowsHtml + '</tbody>'
        + '</table>'
        + '</div>'

        + '<div class="asset-pad-bottom"></div>'
        + '</div>';

      scheduleRefreshIcons();

      // -- Filter logic --
      function applyFilters() {
        const dimFilter = document.getElementById('a10-filter-dimension');
        const showModeEls = document.querySelectorAll('input[name="a10ShowMode"]');
        const selectedDim = dimFilter ? dimFilter.value : '';
        let showMode = 'all';
        for (let mi = 0; mi < showModeEls.length; mi++) {
          if (showModeEls[mi].checked) { showMode = showModeEls[mi].value; break; }
        }
        let rows = document.querySelectorAll('.a10-row');
        for (let rfi = 0; rfi < rows.length; rfi++) {
          const tr = rows[rfi];
          const dimMatch = !selectedDim || tr.getAttribute('data-dimension') === selectedDim;
          const appMatch = showMode === 'all' || tr.getAttribute('data-applicable') === 'yes';
          tr.style.display = (dimMatch && appMatch) ? '' : 'none';
        }
      }

      const dimFilterEl = document.getElementById('a10-filter-dimension');
      if (dimFilterEl) {
        addPageEventListener(dimFilterEl, 'change', applyFilters);
      }
      const showModeRadios = document.querySelectorAll('input[name="a10ShowMode"]');
      for (let smi = 0; smi < showModeRadios.length; smi++) {
        addPageEventListener(showModeRadios[smi], 'change', applyFilters);
      }

      // -- Row color update + summary update on result change --
      function updateRowColorAndSummary() {
        let complyCount = 0, nonComplyCount = 0, naCount = 0;
        const resultSelects = document.querySelectorAll('.a10-result');
        for (let uci = 0; uci < resultSelects.length; uci++) {
          const sel = resultSelects[uci];
          let idx = sel.getAttribute('data-idx');
          const tr = document.querySelector('.a10-row[data-idx="' + idx + '"]');
          const val = sel.value;
          if (val === '符合') { complyCount++; if (tr) tr.style.background = '#e8f5e9'; }
          else if (val === '不符合') { nonComplyCount++; if (tr) tr.style.background = '#ffebee'; }
          else if (val === '不適用') { naCount++; if (tr) tr.style.background = '#f5f5f5'; }
          else { if (tr) tr.style.background = ''; }
        }
        const complyEl = document.getElementById('a10-comply-count');
        const nonComplyEl = document.getElementById('a10-noncomply-count');
        const naEl = document.getElementById('a10-na-count');
        if (complyEl) complyEl.textContent = String(complyCount);
        if (nonComplyEl) nonComplyEl.textContent = String(nonComplyCount);
        if (naEl) naEl.textContent = String(naCount);
      }

      addPageEventListener(appEl, 'change', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('a10-result')) {
          updateRowColorAndSummary();
        }
      });

      // -- Action handlers --
      bindActions({
        backToDetail: function () {
          return '#asset-detail/' + assetId;
        },
        saveAppendix10: async function () {
          const assessments = [];
          for (let ci = 0; ci < APPENDIX10_DATA.length; ci++) {
            const rowData = APPENDIX10_DATA[ci];
            const resultSel = document.querySelector('.a10-result[data-idx="' + ci + '"]');
            const noteInput = document.querySelector('.a10-note[data-idx="' + ci + '"]');
            assessments.push({
              dimension: rowData.d,
              code: rowData.c,
              level: rowData.l,
              control: rowData.t,
              result: resultSel ? resultSel.value : '',
              note: noteInput ? noteInput.value : ''
            });
          }
          try {
            await apiCall('POST', '/' + assetId + '/appendix10', {
              protectionLevel: protLevel,
              assessments: assessments
            });
            toast('附表十評估已儲存', 'success');
          } catch (err) {
            toast('儲存失敗：' + String(err && err.message || err), 'error');
          }
        }
      });
    }

    // -------------------------------------------------------
    // renderRiskAssessment
    // -------------------------------------------------------
    async function renderRiskAssessment(assetId) {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      // -- Predefined threat and vulnerability lists --
      const THREATS = ['天然災害', '設備故障', '惡意程式', '未授權存取', '社交工程', '人為疏失', '供應鏈風險', '資料外洩', 'DDoS攻擊'];
      const VULNERABILITIES = ['密碼強度不足', '未及時更新修補', '缺乏備份', '存取控制不當', '缺乏加密', '人員訓練不足', '實體安全不足', '缺乏日誌監控'];

      // -- Risk matrix definition: matrix[impact-1][likelihood-1] = { score, level } --
      const RISK_MATRIX = [
        [{ s: 1, l: '低' }, { s: 2, l: '低' }, { s: 3, l: '中' }],
        [{ s: 2, l: '低' }, { s: 4, l: '中' }, { s: 6, l: '高' }],
        [{ s: 3, l: '中' }, { s: 6, l: '高' }, { s: 9, l: '高' }]
      ];
      const RISK_COLORS = { '低': '#C8E6C9', '中': '#FFF9C4', '高': '#FFCDD2' };

      // -- Show loading --
      appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-empty">'
        + ic('loader') + ' 載入中...</div></div>';
      scheduleRefreshIcons();

      // -- Fetch asset data --
      let asset;
      try {
        const resp = await apiCall('GET', '/' + assetId);
        asset = resp && resp.item ? resp.item : resp;
      } catch (err) {
        appEl.innerHTML = '<div class="animate-in"><div class="empty-state asset-error">'
          + ic('alert-triangle') + '<p>載入失敗：' + esc(String(err && err.message || err)) + '</p>'
          + '<button class="btn btn-outline" data-action="app.backToDetail">' + ic('arrow-left') + ' 返回</button></div></div>';
        scheduleRefreshIcons();
        bindActions({
          backToDetail: function () { return '#asset-detail/' + assetId; }
        });
        return;
      }

      const a = asset || {};
      let riskData = {};
      try {
        riskData = a.risk_data_json ? (typeof a.risk_data_json === 'string' ? JSON.parse(a.risk_data_json) : a.risk_data_json) : {};
      } catch (e) { riskData = {}; }
      if (a.riskData) riskData = a.riskData;

      const protLevel = a.protectionLevel || computeProtectionLevel(a.ciaC, a.ciaI, a.ciaA, a.ciaL) || '';

      // -- Compute asset value from CIA --
      const cVal = CIA_VALUE_MAP[a.ciaC] || 0;
      const iVal = CIA_VALUE_MAP[a.ciaI] || 0;
      const aVal = CIA_VALUE_MAP[a.ciaA] || 0;
      const lVal = CIA_VALUE_MAP[a.ciaL] || 0;
      const assetValue = riskData.assetValue || Math.max(cVal, iVal, aVal, lVal) || 0;

      // -- Existing risk data --
      const existingThreats = Array.isArray(riskData.threats) ? riskData.threats : [];
      const existingVulns = Array.isArray(riskData.vulnerabilities) ? riskData.vulnerabilities : [];
      const existingLikelihood = riskData.likelihood || '';
      const existingImpact = riskData.impact || String(assetValue) || '';
      const existingTreatment = riskData.treatment || '';
      const existingControlDesc = riskData.controlDescription || '';
      const existingResidualRisk = riskData.residualRisk || '';
      const existingRiskOwner = riskData.riskOwner || '';
      const existingThreatOther = riskData.threatOther || '';
      const existingVulnOther = riskData.vulnOther || '';

      // -- Compute initial risk score/level --
      const initScore = computeRiskScore(existingLikelihood, existingImpact);
      const initLevel = getRiskLevel(initScore);

      // -- Build threat checkboxes --
      let threatCheckboxHtml = '<div class="stats-grid">';
      for (let ti = 0; ti < THREATS.length; ti++) {
        const tChecked = existingThreats.indexOf(THREATS[ti]) !== -1;
        threatCheckboxHtml += '<label class="form-check-label">'
          + '<input type="checkbox" class="form-check-input ra-threat" value="' + esc(THREATS[ti]) + '"' + (tChecked ? ' checked' : '') + '>'
          + '<span>' + esc(THREATS[ti]) + '</span></label>';
      }
      threatCheckboxHtml += '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">其他威脅</label>'
        + '<input type="text" class="form-input" id="ra-threat-other" value="' + esc(existingThreatOther) + '" placeholder="自訂威脅...">'
        + '</div>';

      // -- Build vulnerability checkboxes --
      let vulnCheckboxHtml = '<div class="stats-grid">';
      for (let vi = 0; vi < VULNERABILITIES.length; vi++) {
        const vChecked = existingVulns.indexOf(VULNERABILITIES[vi]) !== -1;
        vulnCheckboxHtml += '<label class="form-check-label">'
          + '<input type="checkbox" class="form-check-input ra-vuln" value="' + esc(VULNERABILITIES[vi]) + '"' + (vChecked ? ' checked' : '') + '>'
          + '<span>' + esc(VULNERABILITIES[vi]) + '</span></label>';
      }
      vulnCheckboxHtml += '</div>'
        + '<div class="form-group">'
        + '<label class="form-label">其他弱點</label>'
        + '<input type="text" class="form-input" id="ra-vuln-other" value="' + esc(existingVulnOther) + '" placeholder="自訂弱點...">'
        + '</div>';

      // -- Build risk calculation section --
      const riskCalcHtml = '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">可能性</label>'
        + '<select class="form-select" id="ra-likelihood">'
        + '<option value="">-- 請選擇 --</option>'
        + '<option value="1"' + (String(existingLikelihood) === '1' ? ' selected' : '') + '>1（低）</option>'
        + '<option value="2"' + (String(existingLikelihood) === '2' ? ' selected' : '') + '>2（中）</option>'
        + '<option value="3"' + (String(existingLikelihood) === '3' ? ' selected' : '') + '>3（高）</option>'
        + '</select></div>'
        + '<div class="form-group">'
        + '<label class="form-label">衝擊</label>'
        + '<select class="form-select" id="ra-impact">'
        + '<option value="">-- 請選擇 --</option>'
        + '<option value="1"' + (String(existingImpact) === '1' ? ' selected' : '') + '>1（低）</option>'
        + '<option value="2"' + (String(existingImpact) === '2' ? ' selected' : '') + '>2（中）</option>'
        + '<option value="3"' + (String(existingImpact) === '3' ? ' selected' : '') + '>3（高）</option>'
        + '</select></div>'
        + '<div class="form-group">'
        + '<label class="form-label">風險值</label>'
        + '<div id="ra-risk-score" class="form-input" style="background:#f5f5f5;font-weight:bold;text-align:center;">'
        + (initScore ? String(initScore) : '--') + '</div></div>'
        + '<div class="form-group">'
        + '<label class="form-label">風險等級</label>'
        + '<div id="ra-risk-level" class="text-center" style="font-weight:bold;">'
        + (initLevel ? '<span class="badge ' + getRiskBadgeClass(initLevel) + '"><span class="badge-dot"></span>' + esc(initLevel) + '</span>' : '--')
        + '</div></div>'
        + '</div>';

      // -- Build risk treatment section --
      const showTreatment = initLevel === '高';
      const treatmentHtml = '<div id="ra-treatment-section"' + (showTreatment ? '' : ' style="display:none;"') + '>'
        + '<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">'
        + '<h4 class="asset-mb-12">' + ic('shield-alert') + ' 風險處置</h4>'
        + '<div class="form-row">'
        + '<div class="form-group">'
        + '<label class="form-label">風險處置方式</label>'
        + '<select class="form-select" id="ra-treatment">'
        + '<option value="">-- 請選擇 --</option>'
        + '<option value="降低"' + (existingTreatment === '降低' ? ' selected' : '') + '>降低</option>'
        + '<option value="轉移"' + (existingTreatment === '轉移' ? ' selected' : '') + '>轉移</option>'
        + '<option value="接受"' + (existingTreatment === '接受' ? ' selected' : '') + '>接受</option>'
        + '<option value="避免"' + (existingTreatment === '避免' ? ' selected' : '') + '>避免</option>'
        + '</select></div>'
        + '<div class="form-group">'
        + '<label class="form-label">殘餘風險等級</label>'
        + '<select class="form-select" id="ra-residual-risk">'
        + '<option value="">-- 請選擇 --</option>'
        + '<option value="低"' + (existingResidualRisk === '低' ? ' selected' : '') + '>低</option>'
        + '<option value="中"' + (existingResidualRisk === '中' ? ' selected' : '') + '>中</option>'
        + '<option value="高"' + (existingResidualRisk === '高' ? ' selected' : '') + '>高</option>'
        + '</select></div></div>'
        + '<div class="form-group">'
        + '<label class="form-label">控制措施說明</label>'
        + '<textarea class="form-input" id="ra-control-desc" rows="3" placeholder="請說明控制措施...">' + esc(existingControlDesc) + '</textarea></div>'
        + '<div class="form-group">'
        + '<label class="form-label">風險擁有者</label>'
        + '<input type="text" class="form-input" id="ra-risk-owner" value="' + esc(existingRiskOwner) + '" placeholder="風險擁有者姓名"></div>'
        + '</div></div>';

      // -- Build risk matrix visual --
      let matrixHtml = '<div style="margin-top:16px;">'
        + '<h4 style="margin-bottom:8px;">' + ic('grid-3x3') + ' 風險矩陣</h4>'
        + '<div style="display:inline-block;">'
        + '<table class="data-table" style="text-align:center;">'
        + '<thead><tr>'
        + '<th class="asset-form-header">衝擊 \\ 可能性</th>'
        + '<th class="asset-form-header">1（低）</th>'
        + '<th class="asset-form-header">2（中）</th>'
        + '<th class="asset-form-header">3（高）</th>'
        + '</tr></thead><tbody>';
      for (let mrow = 2; mrow >= 0; mrow--) {
        const impactLabel = (mrow + 1) + '（' + (mrow === 0 ? '低' : (mrow === 1 ? '中' : '高')) + '）';
        matrixHtml += '<tr><th class="nowrap">' + esc(impactLabel) + '</th>';
        for (let mcol = 0; mcol < 3; mcol++) {
          let cell = RISK_MATRIX[mrow][mcol];
          const cellId = 'ra-matrix-' + mrow + '-' + mcol;
          const isHighlighted = String(existingImpact) === String(mrow + 1) && String(existingLikelihood) === String(mcol + 1);
          const cellBorder = isHighlighted ? '3px solid #333' : '1px solid #ddd';
          matrixHtml += '<td id="' + cellId + '" class="text-center" style="border:' + cellBorder + ';background:' + RISK_COLORS[cell.l] + ';font-weight:bold;">'
            + cell.s + ' - ' + esc(cell.l) + '</td>';
        }
        matrixHtml += '</tr>';
      }
      matrixHtml += '</tbody></table></div></div>';

      // -- Asset info bar --
      const protBadgeClass = protLevel === '高' ? 'badge-danger' : (protLevel === '中' ? 'badge-warning' : 'badge-success');
      const assetValueLabel = assetValue === 3 ? '高' : (assetValue === 2 ? '中' : (assetValue === 1 ? '低' : '--'));
      const infoHtml = '<div class="card toolbar">'
        + '<span>' + ic('server') + ' <strong>' + esc(a.assetName || '未命名資產') + '</strong></span>'
        + '<span>防護等級：<span class="badge ' + protBadgeClass + '"><span class="badge-dot"></span>' + esc(protLevel || '未設定') + '</span></span>'
        + '<span>資產價值：<strong>' + esc(assetValueLabel) + '</strong>（C=' + esc(a.ciaC || '--') + '、I=' + esc(a.ciaI || '--') + '、A=' + esc(a.ciaA || '--') + '）</span>'
        + '</div>';

      // -- Assemble page --
      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header asset-flex-between">'
        + '<h2>' + ic('shield') + ' 風險評鑑</h2>'
        + '<div class="page-header-actions asset-flex-gap8">'
        + '<button class="btn btn-outline" data-action="app.backToDetail">' + ic('arrow-left') + ' 返回資產</button>'
        + '<button class="btn btn-primary" data-action="app.saveRiskAssessment">' + ic('save') + ' 儲存評鑑</button>'
        + '</div>'
        + '</div>'

        + infoHtml

        + '<div class="card card-body--padded">'
        + '<h4 class="asset-mb-12">' + ic('alert-triangle') + ' 威脅識別</h4>'
        + threatCheckboxHtml
        + '</div>'

        + '<div class="card card-body--padded">'
        + '<h4 class="asset-mb-12">' + ic('shield-off') + ' 弱點識別</h4>'
        + vulnCheckboxHtml
        + '</div>'

        + '<div class="card card-body--padded">'
        + '<h4 class="asset-mb-12">' + ic('calculator') + ' 風險計算</h4>'
        + riskCalcHtml
        + treatmentHtml
        + matrixHtml
        + '</div>'

        + '<div class="asset-pad-bottom"></div>'
        + '</div>';

      scheduleRefreshIcons();

      // -- Dynamic risk score/level/matrix update --
      function updateRiskDisplay() {
        const likelihoodEl = document.getElementById('ra-likelihood');
        const impactEl = document.getElementById('ra-impact');
        const scoreEl = document.getElementById('ra-risk-score');
        const levelEl = document.getElementById('ra-risk-level');
        const treatmentSection = document.getElementById('ra-treatment-section');
        if (!likelihoodEl || !impactEl) return;

        const lk = parseInt(likelihoodEl.value, 10) || 0;
        const imp = parseInt(impactEl.value, 10) || 0;
        const score = lk * imp;
        let level = getRiskLevel(score);

        if (scoreEl) scoreEl.textContent = score ? String(score) : '--';
        if (levelEl) {
          if (level) {
            levelEl.innerHTML = '<span class="badge ' + getRiskBadgeClass(level) + '"><span class="badge-dot"></span>' + esc(level) + '</span>';
          } else {
            levelEl.textContent = '--';
          }
        }

        // Show/hide treatment section based on risk level
        if (treatmentSection) {
          treatmentSection.style.display = level === '高' ? '' : 'none';
        }

        // Update matrix highlights
        for (let mr = 0; mr < 3; mr++) {
          for (let mc = 0; mc < 3; mc++) {
            const cellEl = document.getElementById('ra-matrix-' + mr + '-' + mc);
            if (!cellEl) continue;
            const isActive = imp === (mr + 1) && lk === (mc + 1);
            cellEl.style.border = isActive ? '3px solid #333' : '1px solid #ddd';
          }
        }

        scheduleRefreshIcons();
      }

      const raLikelihoodEl = document.getElementById('ra-likelihood');
      const raImpactEl = document.getElementById('ra-impact');
      if (raLikelihoodEl) addPageEventListener(raLikelihoodEl, 'change', updateRiskDisplay);
      if (raImpactEl) addPageEventListener(raImpactEl, 'change', updateRiskDisplay);

      // -- Action handlers --
      bindActions({
        backToDetail: function () {
          return '#asset-detail/' + assetId;
        },
        saveRiskAssessment: async function () {
          // Collect threats
          const threats = [];
          const threatCbs = document.querySelectorAll('.ra-threat');
          for (let tci = 0; tci < threatCbs.length; tci++) {
            if (threatCbs[tci].checked) threats.push(threatCbs[tci].value);
          }
          const threatOtherEl = document.getElementById('ra-threat-other');
          const threatOther = threatOtherEl ? threatOtherEl.value.trim() : '';
          if (threatOther) threats.push(threatOther);

          // Collect vulnerabilities
          const vulnerabilities = [];
          const vulnCbs = document.querySelectorAll('.ra-vuln');
          for (let vci = 0; vci < vulnCbs.length; vci++) {
            if (vulnCbs[vci].checked) vulnerabilities.push(vulnCbs[vci].value);
          }
          const vulnOtherEl = document.getElementById('ra-vuln-other');
          const vulnOther = vulnOtherEl ? vulnOtherEl.value.trim() : '';
          if (vulnOther) vulnerabilities.push(vulnOther);

          // Collect risk calculation values
          const lkEl = document.getElementById('ra-likelihood');
          const impEl = document.getElementById('ra-impact');
          let likelihood = lkEl ? lkEl.value : '';
          let impact = impEl ? impEl.value : '';
          const riskScore = computeRiskScore(likelihood, impact);
          const riskLevel = getRiskLevel(riskScore);

          // Collect treatment values
          const treatmentEl = document.getElementById('ra-treatment');
          const controlDescEl = document.getElementById('ra-control-desc');
          const residualEl = document.getElementById('ra-residual-risk');
          const ownerEl = document.getElementById('ra-risk-owner');

          const treatment = treatmentEl ? treatmentEl.value : '';
          const controlDescription = controlDescEl ? controlDescEl.value : '';
          const residualRisk = residualEl ? residualEl.value : '';
          const riskOwner = ownerEl ? ownerEl.value : '';

          // Validate: if treatment is 降低, controlDescription is required
          if (riskLevel === '高' && treatment === '降低' && !controlDescription.trim()) {
            toast('風險處置方式為「降低」時，請填寫控制措施說明', 'error');
            return;
          }

          const payload = {
            riskData: {
              assetValue: assetValue,
              threats: threats,
              vulnerabilities: vulnerabilities,
              likelihood: likelihood,
              impact: impact,
              riskScore: riskScore,
              riskLevel: riskLevel,
              treatment: treatment,
              controlDescription: controlDescription,
              residualRisk: residualRisk,
              riskOwner: riskOwner,
              threatOther: threatOther,
              vulnOther: vulnOther
            }
          };

          try {
            await apiCall('POST', '/' + assetId, payload);
            toast('風險評鑑已儲存', 'success');
          } catch (err) {
            toast('儲存失敗：' + String(err && err.message || err), 'error');
          }
        }
      });
    }

    // -------------------------------------------------------
    // renderAssetDashboard (admin only)
    // -------------------------------------------------------
    async function renderAssetDashboard() {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      let year = getCurrentRocYear();

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header review-page-header page-header--integrated">'
        + '<div>'
        + '<div class="page-eyebrow">\u7cfb\u7d71\u7ba1\u7406</div>'
        + '<h1 class="page-title">' + ic('bar-chart-2') + ' \u8cc7\u7522\u76e4\u9ede\u7e3d\u89bd\u5100\u8868\u677f</h1>'
        + '<p class="page-subtitle">\u5168\u6821\u5404\u55ae\u4f4d\u76e4\u9ede\u5b8c\u6210\u72c0\u614b\uff0c\u4f9d\u884c\u653f\u55ae\u4f4d\u3001\u5b78\u8853\u55ae\u4f4d\u3001\u4e2d\u5fc3 / \u7814\u7a76\u55ae\u4f4d\u5206\u5c64\u986f\u793a\u3002</p>'
        + '</div>'
        + '<div class="review-header-actions">'
        + '<button class="btn btn-secondary" data-action="app.backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'
        + '<div id="asset-dashboard-content">'
        + '<div class="empty-state">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div>'
        + '</div>'
        + '</div>';

      scheduleRefreshIcons();
      bindActions({
        backToList: function () { return '#assets'; },
        toggleDashGroup: function (ctx) {
          const targetId = ctx.element && ctx.element.getAttribute('data-target');
          if (!targetId) return;
          const bodyEl = document.getElementById(targetId);
          if (!bodyEl) return;
          const isVisible = bodyEl.style.display !== 'none';
          bodyEl.style.display = isVisible ? 'none' : '';
          const arrow = ctx.element.querySelector('.dash-group-arrow');
          if (arrow) {
            arrow.textContent = isVisible ? '\u25b8' : '\u25be';
          }
        }
      });

      // Local unit categorization
      function localCategorizeUnit(name) {
        // 直接用 shared/unit-categories.js 的 categorizeUnit（Single Source of Truth）
        const cats = (typeof window !== 'undefined' && window.__UNIT_CATEGORIES__) || {};
        if (typeof cats.categorizeUnit === 'function') {
          return cats.categorizeUnit(name);
        }
        return '\u4e2d\u5fc3 / \u7814\u7a76\u55ae\u4f4d';
      }

      try {
        // Fetch DB summary and full unit list in parallel
        const summaryData = await apiCall('GET', '/summary');
        // Build unit list from unitStructure (152 level-1 units, complete)
        // instead of unitGroups (120, stale and missing 32 units including 管理學院)
        const officialData = window.__OFFICIAL_UNIT_DATA__ || {};
        const unitStructure = officialData.unitStructure || {};
        const unitMetaByValue = officialData.unitMetaByValue || {};
        const catsRef = window.__UNIT_CATEGORIES__ || {};
        const hiddenSet = new Set(catsRef.HIDDEN_UNITS || []);
        const hiddenRegex = /醫院|分院|副校長|紀念品/;
        const allUnitGroups = Object.keys(unitStructure)
          .filter(function (name) { return !hiddenSet.has(name) && !hiddenRegex.test(name); })
          .map(function (name) {
            const meta = unitMetaByValue[name] || {};
            return {
              name: name,
              code: meta.normalizedCode || meta.code || '',
              children: unitStructure[name] || []
            };
          });

        // Build lookup: unitCode -> { assetCount, itCount, cnCount, highRisk, hasCompleted }
        const dbUnits = {};
        const summaryRows = summaryData.summary || summaryData.units || [];
        if (Array.isArray(summaryRows)) {
          summaryRows.forEach(function (row) {
            const code = row.unit_code || row.unitCode || '';
            if (!code) return;
            if (!dbUnits[code]) dbUnits[code] = { name: row.unit_name || row.unitName || '', assets: 0, itSys: 0, cn: 0, highRisk: 0, completed: false };
            dbUnits[code].assets += parseInt(row.cnt || row.assetCount || 0, 10);
            if (row.is_it_system || row.isItSystem) dbUnits[code].itSys += parseInt(row.cnt || 0, 10);
            if (row.is_china_brand || row.isChinaBrand) dbUnits[code].cn += parseInt(row.cnt || 0, 10);
            dbUnits[code].highRisk += parseInt(row.high_risk_count || row.highRiskCount || 0, 10);
            if ((row.status || '') === '\u5df2\u5b8c\u6210') dbUnits[code].completed = true;
          });
        }

        // Merge with all official units
        const mergedUnits = [];
        let completedCount = 0;
        let totalUnits = 0;
        let totalAssets = 0;
        let totalItSys = 0;
        let totalCn = 0;
        let totalHighRisk = 0;

        allUnitGroups.forEach(function (group) {
          const code = group.code || '';
          const db = dbUnits[code] || {};
          const isCompleted = db.completed || false;
          totalUnits++;
          if (isCompleted) completedCount++;
          totalAssets += db.assets || 0;
          totalItSys += db.itSys || 0;
          totalCn += db.cn || 0;
          totalHighRisk += db.highRisk || 0;
          mergedUnits.push({
            code: code,
            name: group.name || db.name || code,
            assets: db.assets || 0,
            itSys: db.itSys || 0,
            cn: db.cn || 0,
            highRisk: db.highRisk || 0,
            completed: isCompleted,
            children: (group.children || []).length
          });
        });

        const pct = totalUnits > 0 ? Math.round(completedCount / totalUnits * 100) : 0;
        const dashEl = document.getElementById('asset-dashboard-content');
        if (!dashEl) return;

        // ── Stat cards ──
        const statsHtml = '<div class="stats-grid review-stats-grid">'
          + '<div class="stat-card"><div class="stat-value" style="color:var(--color-success);">' + ic('trending-up', 'icon-sm') + ' ' + pct + '%</div><div class="stat-label">\u5b8c\u6210\u7387</div></div>'
          + '<div class="stat-card"><div class="stat-value">' + ic('check-circle', 'icon-sm') + ' ' + completedCount + '/' + totalUnits + '</div><div class="stat-label">\u5df2\u5b8c\u6210/\u7e3d\u55ae\u4f4d</div></div>'
          + '<div class="stat-card"><div class="stat-value">' + ic('layers', 'icon-sm') + ' ' + totalAssets + '</div><div class="stat-label">\u5168\u6821\u8cc7\u7522\u6578</div></div>'
          + '<div class="stat-card"><div class="stat-value">' + ic('server', 'icon-sm') + ' ' + totalItSys + '</div><div class="stat-label">\u8cc7\u901a\u7cfb\u7d71</div></div>'
          + '<div class="stat-card"><div class="stat-value asset-danger">' + ic('alert-triangle', 'icon-sm') + ' ' + totalHighRisk + '</div><div class="stat-label">\u9ad8\u98a8\u96aa</div></div>'
          + '</div>';

        // ── Group units by category ──
        const categoryConfig = [
          { key: '\u884c\u653f\u55ae\u4f4d', icon: 'building', label: '\u884c\u653f\u55ae\u4f4d' },
          { key: '\u5b78\u8853\u55ae\u4f4d', icon: 'graduation-cap', label: '\u5b78\u8853\u55ae\u4f4d' },
          { key: '\u4e2d\u5fc3 / \u7814\u7a76\u55ae\u4f4d', icon: 'landmark', label: '\u4e2d\u5fc3 / \u7814\u7a76\u55ae\u4f4d' }
        ];
        const grouped = {};
        categoryConfig.forEach(function (c) { grouped[c.key] = []; });
        mergedUnits.forEach(function (u) {
          const cat = localCategorizeUnit(u.name);
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(u);
        });

        // ── Build grouped collapsible sections ──
        let groupsHtml = '';
        categoryConfig.forEach(function (cat, idx) {
          const units = grouped[cat.key] || [];
          if (units.length === 0) return;
          const groupCompleted = units.filter(function (u) { return u.completed; }).length;
          const groupIncomplete = units.length - groupCompleted;
          const groupPct = units.length > 0 ? Math.round(groupCompleted / units.length * 100) : 0;
          const groupId = 'dash-group-' + idx;

          // Default: collapse third group (中心/研究), keep 行政 and 學術 expanded
          const defaultCollapsed = idx >= 2;
          const initialArrow = defaultCollapsed ? '\u25b8' : '\u25be';
          const initialBodyStyle = defaultCollapsed ? ' style="display:none"' : '';
          groupsHtml += '<div class="card review-table-card asset-mb-16">'
            + '<div class="card-header dash-group-header" style="cursor:pointer;display:flex;align-items:center;gap:12px;" data-action="app.toggleDashGroup" data-target="' + groupId + '">'
            + '<span class="card-title" style="flex:1;">' + ic(cat.icon) + ' ' + esc(cat.label) + '</span>'
            + '<span class="review-card-subtitle">' + units.length + ' \u500b\u55ae\u4f4d \u00b7 ' + groupCompleted + ' / ' + units.length + ' \u5df2\u5b8c\u6210 (' + groupPct + '%)</span>'
            + '<span class="dash-group-arrow" style="font-size:1.1rem;color:var(--text-secondary);">' + initialArrow + '</span>'
            + '</div>'
            + '<div class="card-body asset-pad-0" id="' + groupId + '"' + initialBodyStyle + '>'
            + '<table class="asset-table">'
            + '<thead><tr>'
            + '<th class="asset-th">\u55ae\u4f4d\u540d\u7a31</th>'
            + '<th class="asset-th--center">\u72c0\u614b</th>'
            + '<th class="asset-th--center">\u8cc7\u7522\u6578</th>'
            + '<th class="asset-th--center">\u8cc7\u901a\u7cfb\u7d71</th>'
            + '<th class="asset-th--center">\u5927\u9678\u5ee0\u724c</th>'
            + '<th class="asset-th--center">\u9ad8\u98a8\u96aa</th>'
            + '</tr></thead><tbody>';

          units.forEach(function (u) {
            const unitDashBadge = u.completed
              ? '<span class="badge badge-success">' + ic('check', 'icon-xs') + ' \u5df2\u5b8c\u6210</span>'
              : '<span class="badge badge-danger">' + ic('x', 'icon-xs') + ' \u672a\u5b8c\u6210</span>';
            let rowBg = u.completed ? 'background:#f1f8e9;' : '';
            groupsHtml += '<tr' + (rowBg ? ' style="' + rowBg + '"' : '') + '>'
              + '<td' + (u.completed ? ' style="font-weight:bold;"' : '') + '>' + esc(u.name) + '</td>'
              + '<td class="asset-td--center">' + unitDashBadge + '</td>'
              + '<td class="asset-td--center">' + (u.assets || '\u2014') + '</td>'
              + '<td class="asset-td--center">' + (u.itSys || '\u2014') + '</td>'
              + '<td class="asset-td--center">' + (u.cn || '\u2014') + '</td>'
              + '<td class="asset-td--center">'
              + (u.highRisk > 0 ? '<span style="color:var(--color-error);font-weight:bold;">' + u.highRisk + '</span>' : '\u2014')
              + '</td>'
              + '</tr>';
          });

          groupsHtml += '</tbody></table></div></div>';
        });

        dashEl.innerHTML = statsHtml + groupsHtml;
        scheduleRefreshIcons();

      } catch (err) {
        const dashEl2 = document.getElementById('asset-dashboard-content');
        if (dashEl2) {
          dashEl2.innerHTML = '<div class="asset-error">'
            + ic('alert-triangle') + '<p>\u8f09\u5165\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p></div>';
          scheduleRefreshIcons();
        }
      }
    }

    // -------------------------------------------------------
    // renderBatchImport
    // -------------------------------------------------------
    async function renderBatchImport() {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      const TEMPLATE_HEADERS = '\u8cc7\u7522\u540d\u7a31,\u4e3b\u5206\u985e(PE/DC/DA/SW/HW/VM/BS),\u5b50\u5206\u985e,\u64c1\u6709\u8005,\u4fdd\u7ba1\u55ae\u4f4d,\u6a5f\u5bc6\u6027(\u666e/\u4e2d/\u9ad8),\u5b8c\u6574\u6027(\u666e/\u4e2d/\u9ad8),\u53ef\u7528\u6027(\u666e/\u4e2d/\u9ad8),\u662f\u5426\u8cc7\u901a\u7cfb\u7d71(\u662f/\u5426),\u662f\u5426\u5927\u9678\u5ee0\u724c(\u662f/\u5426),\u5099\u8a3b';

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header review-page-header page-header--integrated">'
        + '<div>'
        + '<div class="page-eyebrow">\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede</div>'
        + '<h1 class="page-title">' + ic('upload') + ' \u6279\u6b21\u532f\u5165\u8cc7\u7522</h1>'
        + '<p class="page-subtitle">\u4e0b\u8f09 CSV \u7bc4\u672c\uff0c\u586b\u5beb\u5f8c\u4e0a\u50b3\u5373\u53ef\u6279\u6b21\u5efa\u7acb\u8cc7\u7522\u3002</p>'
        + '</div>'
        + '<div class="review-header-actions">'
        + '<button class="btn btn-secondary" data-action="app.backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-header"><span class="card-title">' + ic('file-text', 'icon-sm') + ' \u7bc4\u672c\u4e0b\u8f09</span></div>'
        + '<div class="card-body">'
        + '<p class="text-muted">\u8acb\u5148\u4e0b\u8f09 CSV \u7bc4\u672c\uff0c\u586b\u5beb\u5f8c\u518d\u4e0a\u50b3\u3002\u7bc4\u672c\u6b04\u4f4d\u5982\u4e0b\uff1a</p>'
        + '<div class="code-block">'
        + '<code>' + esc(TEMPLATE_HEADERS) + '</code></div>'
        + '<button class="btn btn-secondary btn-sm" data-action="app.downloadTemplate">' + ic('download') + ' \u4e0b\u8f09\u7bc4\u672c</button>'
        + '</div></div>'

        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-header"><span class="card-title">' + ic('upload', 'icon-sm') + ' \u4e0a\u50b3 CSV \u6a94\u6848</span></div>'
        + '<div class="card-body">'
        + '<div class="empty-state" style="border:2px dashed #ccc;border-radius:8px;" id="batch-import-drop-zone">'
        + '<p class="text-muted">\u9078\u64c7 CSV \u6a94\u6848</p>'
        + '<input type="file" accept=".csv" id="batch-import-file">'
        + '</div>'
        + '</div></div>'

        + '<div id="batch-import-preview" style="display:none;">'
        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-header"><span class="card-title">' + ic('eye') + ' \u9810\u89bd\uff08\u524d 10 \u7b46\uff09</span></div>'
        + '<div class="card-body">'
        + '<div id="batch-import-preview-table" class="asset-scroll-x"></div>'
        + '<div class="toolbar-actions" style="margin-top:12px;">'
        + '<span id="batch-import-total" class="text-muted"></span>'
        + '<button class="btn btn-primary" data-action="app.confirmImport">' + ic('check') + ' \u78ba\u8a8d\u532f\u5165</button>'
        + '</div>'
        + '</div></div>'
        + '</div>'

        + '<div id="batch-import-progress" style="display:none;">'
        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-header"><span class="card-title">' + ic('loader') + ' \u532f\u5165\u4e2d...</span></div>'
        + '<div class="card-body">'
        + '<div style="background:#eee;border-radius:4px;overflow:hidden;height:24px;margin-bottom:8px;">'
        + '<div id="batch-import-progress-bar" style="background:#3498db;height:100%;width:0%;transition:width 0.3s;border-radius:4px;"></div>'
        + '</div>'
        + '<div id="batch-import-progress-text" class="text-muted"></div>'
        + '</div></div>'
        + '</div>'

        + '<div id="batch-import-result" style="display:none;">'
        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-body">'
        + '<div id="batch-import-result-content"></div>'
        + '</div></div>'
        + '</div>'

        + '</div>';

      scheduleRefreshIcons();

      let parsedRows = [];

      function parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let ci = 0; ci < line.length; ci++) {
          const ch = line[ci];
          if (inQuotes) {
            if (ch === '"') {
              if (ci + 1 < line.length && line[ci + 1] === '"') { current += '"'; ci++; }
              else { inQuotes = false; }
            } else { current += ch; }
          } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { result.push(current.trim()); current = ''; }
            else { current += ch; }
          }
        }
        result.push(current.trim());
        return result;
      }

      function parseCsvText(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        let rows = [];
        let startIdx = 0;
        if (lines.length > 0) {
          const firstLine = lines[0].replace(/^\uFEFF/, '');
          if (firstLine.indexOf('\u8cc7\u7522\u540d\u7a31') !== -1) { startIdx = 1; }
        }
        for (let li = startIdx; li < lines.length; li++) {
          const line = lines[li].trim();
          if (!line) continue;
          const cols = parseCsvLine(line);
          if (cols.length >= 1 && cols[0]) { rows.push(cols); }
        }
        return rows;
      }

      function showPreview(rows) {
        parsedRows = rows;
        const previewEl = document.getElementById('batch-import-preview');
        const tableEl = document.getElementById('batch-import-preview-table');
        const totalEl = document.getElementById('batch-import-total');
        if (!previewEl || !tableEl || !totalEl) return;

        previewEl.style.display = '';
        totalEl.textContent = '\u5171 ' + rows.length + ' \u7b46\u8cc7\u6599';

        const previewCount = Math.min(rows.length, 10);
        const headers = ['\u8cc7\u7522\u540d\u7a31', '\u4e3b\u5206\u985e', '\u5b50\u5206\u985e', '\u64c1\u6709\u8005', '\u4fdd\u7ba1\u55ae\u4f4d', '\u6a5f\u5bc6\u6027', '\u5b8c\u6574\u6027', '\u53ef\u7528\u6027', '\u8cc7\u901a\u7cfb\u7d71', '\u5927\u9678\u5ee0\u724c', '\u5099\u8a3b'];
        let html = '<table class="asset-table"><thead><tr>';
        html += '<th scope="col" class="asset-th">#</th>';
        for (let hi = 0; hi < headers.length; hi++) { html += '<th scope="col" class="asset-th">' + esc(headers[hi]) + '</th>'; }
        html += '</tr></thead><tbody>';
        for (let ri = 0; ri < previewCount; ri++) {
          let row = rows[ri];
          html += '<tr><td class="asset-td">' + (ri + 1) + '</td>';
          for (let ci = 0; ci < headers.length; ci++) {
            html += '<td class="asset-td">' + esc(row[ci] || '') + '</td>';
          }
          html += '</tr>';
        }
        if (rows.length > 10) {
          html += '<tr><td colspan="' + (headers.length + 1) + '" class="text-center text-muted">... \u5171 ' + rows.length + ' \u7b46\uff0c\u50c5\u986f\u793a\u524d 10 \u7b46</td></tr>';
        }
        html += '</tbody></table>';
        tableEl.innerHTML = html;
        scheduleRefreshIcons();
      }

      function mapRowToAsset(cols) {
        const catMap = { 'PE': 'PE', 'DC': 'DC', 'DA': 'DA', 'SW': 'SW', 'HW': 'HW', 'VM': 'VM', 'BS': 'BS' };
        const rawCat = (cols[1] || '').toUpperCase().trim();
        let category = catMap[rawCat] || rawCat;
        return {
          assetName: cols[0] || '',
          category: category,
          subCategory: cols[2] || '',
          ownerName: cols[3] || '',
          ownerUnit: cols[4] || '',
          ciaC: cols[5] || '',
          ciaI: cols[6] || '',
          ciaA: cols[7] || '',
          isItSystem: (cols[8] || '').trim() === '\u662f',
          isChinaBrand: (cols[9] || '').trim() === '\u662f',
          description: cols[10] || '',
          inventoryYear: getCurrentRocYear(),
          changeType: '\u65b0\u589e',
          status: '\u586b\u5831\u4e2d'
        };
      }

      // Action handlers
      bindActions({
        backToList: function () {
          return '#assets';
        },
        downloadTemplate: function () {
          let csv = '\uFEFF' + TEMPLATE_HEADERS + '\n';
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = '\u8cc7\u7522\u532f\u5165\u7bc4\u672c.csv';
          link.click();
          toast('\u5df2\u4e0b\u8f09\u7bc4\u672c', 'success');
        },
        confirmImport: async function () {
          if (!parsedRows.length) { toast('\u6c92\u6709\u8cc7\u6599\u53ef\u532f\u5165', 'warning'); return; }
          if (!confirm('\u78ba\u5b9a\u8981\u532f\u5165 ' + parsedRows.length + ' \u7b46\u8cc7\u6599\uff1f')) return;

          const progressSection = document.getElementById('batch-import-progress');
          const progressBar = document.getElementById('batch-import-progress-bar');
          const progressText = document.getElementById('batch-import-progress-text');
          const resultSection = document.getElementById('batch-import-result');
          const resultContent = document.getElementById('batch-import-result-content');
          if (progressSection) progressSection.style.display = '';

          let successCount = 0;
          let failCount = 0;
          const errors = [];

          for (let i = 0; i < parsedRows.length; i++) {
            let asset = mapRowToAsset(parsedRows[i]);
            if (!asset.assetName) {
              failCount++;
              errors.push('\u7b2c ' + (i + 1) + ' \u7b46\uff1a\u8cc7\u7522\u540d\u7a31\u4e0d\u53ef\u70ba\u7a7a');
              continue;
            }
            try {
              await apiCall('POST', '', asset);
              successCount++;
            } catch (err) {
              failCount++;
              errors.push('\u7b2c ' + (i + 1) + ' \u7b46 (' + esc(asset.assetName) + ')\uff1a' + esc(String(err && err.message || err)));
            }
            const pct = Math.round(((i + 1) / parsedRows.length) * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressText) progressText.textContent = '\u5df2\u8655\u7406 ' + (i + 1) + ' / ' + parsedRows.length + ' \u7b46';
          }

          if (progressSection) progressSection.style.display = 'none';
          if (resultSection) resultSection.style.display = '';
          if (resultContent) {
            let resultHtml = '<div class="asset-mb-12">'
              + ic('check-circle') + ' <strong>\u532f\u5165\u5b8c\u6210</strong></div>'
              + '<p>\u6210\u529f\uff1a<strong style="color:var(--color-success);">' + successCount + '</strong> \u7b46'
              + (failCount > 0 ? '\uff0c\u5931\u6557\uff1a<strong class="asset-danger">' + failCount + '</strong> \u7b46' : '')
              + '</p>';
            if (errors.length > 0) {
              resultHtml += '<div style="margin-top:8px;padding:10px;background:#fff3f3;border-radius:4px;font-size:0.85em;">'
                + '<strong>\u932f\u8aa4\u660e\u7d30\uff1a</strong><ul style="margin:4px 0 0 16px;padding:0;">';
              for (let ei = 0; ei < errors.length; ei++) {
                resultHtml += '<li>' + errors[ei] + '</li>';
              }
              resultHtml += '</ul></div>';
            }
            resultHtml += '<div style="margin-top:12px;">'
              + '<button class="btn btn-primary" data-action="app.backToList">' + ic('list') + ' \u67e5\u770b\u8cc7\u7522\u5217\u8868</button></div>';
            resultContent.innerHTML = resultHtml;
            scheduleRefreshIcons();
          }
        }
      });

      // File input handler
      const fileInput = document.getElementById('batch-import-file');
      if (fileInput) {
        addPageEventListener(fileInput, 'change', function () {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.csv')) {
            toast('\u8acb\u9078\u64c7 CSV \u6a94\u6848', 'error');
            return;
          }
          const reader = new FileReader();
          reader.onload = function (e) {
            const text = e.target.result;
            let rows = parseCsvText(text);
            if (!rows.length) {
              toast('CSV \u6a94\u6848\u4e2d\u6c92\u6709\u6709\u6548\u8cc7\u6599', 'warning');
              return;
            }
            showPreview(rows);
          };
          reader.readAsText(file, 'UTF-8');
        });
      }
    }

    // -------------------------------------------------------
    // renderYearComparison
    // -------------------------------------------------------
    async function renderYearComparison() {
      const appEl = document.getElementById('app');
      if (!appEl) return;

      const currentYear = getCurrentRocYear();

      appEl.innerHTML = '<div class="animate-in">'
        + '<div class="page-header review-page-header page-header--integrated">'
        + '<div>'
        + '<div class="page-eyebrow">\u8cc7\u8a0a\u8cc7\u7522\u76e4\u9ede</div>'
        + '<h1 class="page-title">' + ic('git-compare') + ' \u5e74\u5ea6\u8cc7\u7522\u6bd4\u5c0d</h1>'
        + '<p class="page-subtitle">\u6bd4\u8f03\u4e0d\u540c\u5e74\u5ea6\u7684\u8cc7\u7522\u6e05\u518a\u5dee\u7570\uff0c\u8ffd\u8e64\u65b0\u589e\u3001\u4fee\u6539\u8207\u522a\u9664\u3002</p>'
        + '</div>'
        + '<div class="review-header-actions">'
        + '<button class="btn btn-secondary" data-action="app.backToList">' + ic('arrow-left') + ' \u8fd4\u56de\u5217\u8868</button>'
        + '</div>'
        + '</div>'

        + '<div class="card review-table-card asset-mb-16">'
        + '<div class="card-body--padded">'
        + '<div class="toolbar-filters">'
        + '<div class="text-muted">' + ic('calendar', 'icon-sm') + '</div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u57fa\u6e96\u5e74\u5ea6</label>'
        + '<select class="form-select" id="yc-base-year">'
        + buildYearOptions(currentYear - 1)
        + '</select>'
        + '</div>'
        + '<div class="form-group asset-mb-0">'
        + '<label class="form-label asset-meta">\u6bd4\u8f03\u5e74\u5ea6</label>'
        + '<select class="form-select" id="yc-compare-year">'
        + buildYearOptions(currentYear)
        + '</select>'
        + '</div>'
        + '<button class="btn btn-primary btn-sm" data-action="app.runComparison">' + ic('refresh-cw') + ' \u57f7\u884c\u6bd4\u5c0d</button>'
        + '</div>'
        + '</div></div>'

        + '<div id="yc-result">'
        + '<div class="empty-state">'
        + ic('git-compare') + '<p>\u8acb\u9078\u64c7\u5e74\u5ea6\u5f8c\u9ede\u64ca\u300c\u57f7\u884c\u6bd4\u5c0d\u300d</p></div>'
        + '</div>'

        + '</div>';

      scheduleRefreshIcons();

      function buildComparisonTable(baseItems, compareItems) {
        const baseMap = {};
        for (let bi = 0; bi < baseItems.length; bi++) {
          const bKey = baseItems[bi].assetName || baseItems[bi].assetId || ('base-' + bi);
          baseMap[bKey] = baseItems[bi];
        }
        const compareMap = {};
        for (let ci = 0; ci < compareItems.length; ci++) {
          const cKey = compareItems[ci].assetName || compareItems[ci].assetId || ('cmp-' + ci);
          compareMap[cKey] = compareItems[ci];
        }

        const allKeys = {};
        let keys;
        keys = Object.keys(baseMap);
        for (let k1 = 0; k1 < keys.length; k1++) allKeys[keys[k1]] = true;
        keys = Object.keys(compareMap);
        for (let k2 = 0; k2 < keys.length; k2++) allKeys[keys[k2]] = true;

        const sortedKeys = Object.keys(allKeys).sort();
        let rows = [];
        for (let si = 0; si < sortedKeys.length; si++) {
          let name = sortedKeys[si];
          const baseA = baseMap[name];
          const cmpA = compareMap[name];
          let changeType;
          if (!baseA && cmpA) {
            changeType = '\u65b0\u589e';
          } else if (baseA && !cmpA) {
            changeType = '\u522a\u9664';
          } else {
            const baseCIA = (baseA.ciaC || '') + (baseA.ciaI || '') + (baseA.ciaA || '');
            const cmpCIA = (cmpA.ciaC || '') + (cmpA.ciaI || '') + (cmpA.ciaA || '');
            const baseCat = (baseA.category || '') + (baseA.subCategory || '');
            const cmpCat = (cmpA.category || '') + (cmpA.subCategory || '');
            changeType = (baseCIA !== cmpCIA || baseCat !== cmpCat) ? '\u4fee\u6539' : '\u7121\u7570\u52d5';
          }
          rows.push({
            name: name,
            category: cmpA ? getCategoryLabel(cmpA.category) : getCategoryLabel(baseA.category),
            baseCIA: baseA ? ((baseA.ciaC || '-') + '/' + (baseA.ciaI || '-') + '/' + (baseA.ciaA || '-')) : '\u2014',
            cmpCIA: cmpA ? ((cmpA.ciaC || '-') + '/' + (cmpA.ciaI || '-') + '/' + (cmpA.ciaA || '-')) : '\u2014',
            changeType: changeType
          });
        }
        return rows;
      }

      function getChangeColor(type) {
        if (type === '\u65b0\u589e') return 'background:#e8f5e9;';
        if (type === '\u4fee\u6539') return 'background:#fff9c4;';
        if (type === '\u522a\u9664') return 'background:#ffebee;';
        return 'background:#f5f5f5;';
      }

      function getChangeBadge(type) {
        if (type === '\u65b0\u589e') return '<span class="badge badge-success"><span class="badge-dot"></span>' + esc(type) + '</span>';
        if (type === '\u4fee\u6539') return '<span class="badge badge-warning"><span class="badge-dot"></span>' + esc(type) + '</span>';
        if (type === '\u522a\u9664') return '<span class="badge badge-danger"><span class="badge-dot"></span>' + esc(type) + '</span>';
        return '<span class="badge badge-secondary"><span class="badge-dot"></span>' + esc(type) + '</span>';
      }

      bindActions({
        backToList: function () {
          return '#assets';
        },
        runComparison: async function () {
          const baseYearEl = document.getElementById('yc-base-year');
          const cmpYearEl = document.getElementById('yc-compare-year');
          const resultEl = document.getElementById('yc-result');
          if (!baseYearEl || !cmpYearEl || !resultEl) return;

          const baseYear = baseYearEl.value;
          const cmpYear = cmpYearEl.value;
          if (baseYear === cmpYear) {
            toast('\u57fa\u6e96\u5e74\u5ea6\u8207\u6bd4\u8f03\u5e74\u5ea6\u4e0d\u53ef\u76f8\u540c', 'warning');
            return;
          }

          resultEl.innerHTML = '<div class="empty-state asset-empty">' + ic('loader') + ' \u8f09\u5165\u4e2d...</div>';
          scheduleRefreshIcons();

          try {
            const results = await Promise.all([
              apiCall('GET', '?year=' + encodeURIComponent(baseYear)),
              apiCall('GET', '?year=' + encodeURIComponent(cmpYear))
            ]);
            const baseItems = Array.isArray(results[0]) ? results[0] : (results[0] && Array.isArray(results[0].items) ? results[0].items : []);
            const cmpItems = Array.isArray(results[1]) ? results[1] : (results[1] && Array.isArray(results[1].items) ? results[1].items : []);

            const diffRows = buildComparisonTable(baseItems, cmpItems);

            if (!diffRows.length) {
              resultEl.innerHTML = '<div class="empty-state asset-empty">'
                + ic('inbox') + '<p>\u7121\u8cc7\u6599\u53ef\u6bd4\u5c0d</p></div>';
              scheduleRefreshIcons();
              return;
            }

            // Summary counts
            let addCount = 0, modCount = 0, delCount = 0, noChangeCount = 0;
            for (let di = 0; di < diffRows.length; di++) {
              if (diffRows[di].changeType === '\u65b0\u589e') addCount++;
              else if (diffRows[di].changeType === '\u4fee\u6539') modCount++;
              else if (diffRows[di].changeType === '\u522a\u9664') delCount++;
              else noChangeCount++;
            }

            const summaryHtml = '<div class="card review-table-card">'
              + '<div class="card-header"><span class="card-title">' + ic('git-compare', 'icon-sm') + ' \u6bd4\u5c0d\u7d50\u679c</span>'
              + '<span class="review-card-subtitle">\u5171 ' + diffRows.length + ' \u7b46</span></div>'
              + '<div class="card-body">'
              + '<div class="toolbar-filters asset-mb-16">'
              + '<span class="badge badge-success">' + ic('plus-circle') + ' \u65b0\u589e: <strong>' + addCount + '</strong></span>'
              + '<span class="badge badge-warning">' + ic('edit') + ' \u4fee\u6539: <strong>' + modCount + '</strong></span>'
              + '<span class="badge badge-danger">' + ic('minus-circle') + ' \u522a\u9664: <strong>' + delCount + '</strong></span>'
              + '<span class="text-muted">' + ic('check') + ' \u7121\u7570\u52d5: <strong>' + noChangeCount + '</strong></span>'
              + '</div>'
              + '</div>'
              + '<div class="card-body asset-pad-0">';

            let tableHtml = '<div class="table-wrapper asset-scroll-x" tabindex="0">'
              + '<table class="asset-table">'
              + '<caption class="sr-only">\u5e74\u5ea6\u8cc7\u7522\u6bd4\u5c0d\u7d50\u679c</caption>'
              + '<thead><tr>'
              + '<th scope="col" class="asset-th">\u8cc7\u7522\u540d\u7a31</th>'
              + '<th scope="col" class="asset-th">\u5206\u985e</th>'
              + '<th scope="col" class="asset-th">\u57fa\u6e96\u5e74\u5ea6 CIA (' + esc(baseYear) + ')</th>'
              + '<th scope="col" class="asset-th">\u6bd4\u8f03\u5e74\u5ea6 CIA (' + esc(cmpYear) + ')</th>'
              + '<th scope="col" class="asset-th">\u7570\u52d5\u985e\u578b</th>'
              + '</tr></thead><tbody>';

            for (let ri = 0; ri < diffRows.length; ri++) {
              let r = diffRows[ri];
              tableHtml += '<tr style="' + getChangeColor(r.changeType) + '">'
                + '<td class="asset-td">' + esc(r.name) + '</td>'
                + '<td class="asset-td">' + esc(r.category) + '</td>'
                + '<td class="asset-td">' + esc(r.baseCIA) + '</td>'
                + '<td class="asset-td">' + esc(r.cmpCIA) + '</td>'
                + '<td class="asset-td">' + getChangeBadge(r.changeType) + '</td>'
                + '</tr>';
            }
            tableHtml += '</tbody></table></div>'
              + '</div></div>';

            resultEl.innerHTML = summaryHtml + tableHtml;
            scheduleRefreshIcons();
          } catch (err) {
            resultEl.innerHTML = '<div class="empty-state asset-error">'
              + ic('alert-triangle') + '<p>\u6bd4\u5c0d\u5931\u6557\uff1a' + esc(String(err && err.message || err)) + '</p></div>';
            scheduleRefreshIcons();
          }
        }
      });

      // Bind year selectors for keyboard enter
      const baseYearEl = document.getElementById('yc-base-year');
      const cmpYearEl = document.getElementById('yc-compare-year');
      if (baseYearEl) addPageEventListener(baseYearEl, 'change', function () {});
      if (cmpYearEl) addPageEventListener(cmpYearEl, 'change', function () {});
    }

    // -------------------------------------------------------
    // Return public API
    // -------------------------------------------------------
    return {
      renderAssetList: renderAssetList,
      renderAssetCreate: renderAssetCreate,
      renderAssetEdit: renderAssetEdit,
      renderAssetDetail: renderAssetDetail,
      renderAppendix10: renderAppendix10,
      renderRiskAssessment: renderRiskAssessment,
      renderAssetDashboard: renderAssetDashboard,
      renderBatchImport: renderBatchImport,
      renderYearComparison: renderYearComparison
    };
  };
})();
