# Taktik 步兵算分網頁

- 算分編輯器：根目錄（`index.html`）
- **單位圖鑑（玩家端 App）**：`player/` — 手機、電腦都能開，可加到主畫面；搜尋單位，照 `units/` 的資料夾一層層篩選

Taktik 單位設計系統的步兵算分工具。打開網頁會出現空白的步兵資料卡，填好按「確認並計分」，算出分數後可以保存。

- 保存的單位直接 commit 到這個 repo 的 `units/<陣營>/<子陣營>/<單位名稱>.json`（公開）。
- 發布時（`.github/workflows/pages.yml`）會把 `units/` 打包成網站上的 `units.json`，**單位圖鑑只讀這個檔，玩家不用權杖**。
- 只有編輯器的「保存」需要在「GitHub 設定」填權杖（說明在設定視窗裡）。新存的單位約 1–2 分鐘後出現在圖鑑。
- 規則文件、範本、原始文件放在另一個私人 repo（taktik_rules）。
- 算分規則在 `calc.js`，依照資料 repo 的規則文件；規則改了要同步改這裡。

本機測試：

```bash
python server.py
```

然後開 http://localhost:8765 。推到 `main` 會自動發布到 GitHub Pages（`.github/workflows/pages.yml`）。

## 檔案

| 檔案 | 用途 |
|---|---|
| `calc.js` | 算分規則 |
| `cardview.js`、`card.css` | 單位資料卡的顯示（編輯器結果頁和圖鑑共用） |
| `repo.js` | 讀寫 GitHub 上的資料 repo |
| `app.js`、`style.css` | 算分編輯器 |
| `player/` | 單位圖鑑 App（`player.js`、`player.css`、`manifest.webmanifest`、`sw.js`） |
