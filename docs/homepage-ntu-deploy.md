# NTU Homepage FTP Deploy

這份文件對應 NTU OPER 的 Homepage FTP 教學，目標是把本專案的靜態前端放到個人 Homepage 空間。

## 已整理好的部署包

- 產出目錄：`dist/homepage-ntu`
- 建置指令：

```powershell
node scripts/build-homepage-ntu-package.cjs
```

可選參數：

```powershell
node scripts/build-homepage-ntu-package.cjs --public-user=easonwu --public-subdir=isms --backend-base=http://140.112.3.65:8088
```

若要產出「Homepage 只做入口並自動導向校內系統」的版本：

```powershell
node scripts/build-homepage-ntu-package.cjs --mode=redirect --redirect-target=http://140.112.3.65:8088/
```

## 會產出的檔案

- `index.html`
- `styles.css`
- `favicon.svg`
- `asset-loader.js`
- `vendor/`
- 所有前端模組 `.js`
- `m365-config.js`
- `m365-config.override.js`
- `README-homepage-upload.txt`

`redirect` 模式下：

- `index.html` 會改成入口導向頁
- 首頁會自動跳到指定 `redirect-target`
- 同時保留手動按鈕，避免瀏覽器擋掉自動跳轉

## FTP 上傳設定

依 NTU OPER 的 FileZilla 教學：

- 主機：`homepage.ntu.edu.tw`
- 協定：`FTP`
- 加密：`需要透過外顯式 TLS 的 FTP`
- 登入型式：`詢問密碼`
- 使用者：`計中帳號`
- 上傳目錄：`public_html`

可參考：
- [NTU Homepage FTP 教學 PDF](https://oper.cc.ntu.edu.tw/assets/file/HomepageFTP20140416.pdf)
- [NTU OPER Homepage 服務頁](https://oper.cc.ntu.edu.tw/)

## 建議上傳路徑

在 `public_html` 下建立子目錄，例如：

```text
public_html/isms/
```

然後把 `dist/homepage-ntu` 內全部檔案上傳到 `public_html/isms/`。

對應入口：

```text
http://homepage.ntu.edu.tw/~easonwu/isms/
```

## 目前的實際限制

這份部署包已經把前端改成直接呼叫：

```text
http://140.112.3.65:8088/api/...
```

因此：

1. 若 Homepage 是用 `http://` 開啟，前端可以正常呼叫目前的 backend
2. 若 Homepage 是用 `https://` 開啟，而 backend 仍是 `http://`，瀏覽器會擋 mixed content

所以在 backend 還沒有 HTTPS 前：

- 請先使用 `http://homepage.ntu.edu.tw/~帳號/子目錄/`
- 不要先用 `https://homepage.ntu.edu.tw/...` 當正式入口

若改用 `redirect` 模式：

- Homepage 本身只提供入口頁
- 可從 `https://homepage...` 自動導到 `http://140.112.3.65:8088/`
- 這種做法不會在頁面內直接發 API，因此不會撞 mixed content

## 若要變成正式穩定入口

還需要做這 3 件：

1. backend 改成 HTTPS
2. backend CORS 加入 Homepage origin
3. 重新產出 `m365-config.override.js` 指向正式 HTTPS API

## 目前實測狀態

我先前用 `homepage.ntu.edu.tw` 測試 FTP 登入時，server 回了 `530 Access denied`。
這代表要嘛：

- Homepage FTP 權限尚未開通
- 帳號密碼不對
- 或需要以 FTP GUI 工具依教學做 explicit TLS 連線

因此目前先把可上傳的部署包與設定整理完成，等 FTP 權限確認後即可直接上傳。

