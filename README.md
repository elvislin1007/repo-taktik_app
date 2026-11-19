# Taktik 步兵算分網頁

Taktik 單位設計系統的步兵算分工具。打開網頁會出現空白的步兵資料卡，填好按「確認並計分」，算出分數後可以保存。

- 保存的單位直接 commit 到資料 repo（私人）的 `units/<陣營>/<子陣營>/<單位名稱>.json`。
- 讀取和保存都需要在網頁右上角「GitHub 設定」填一次權杖（說明在設定視窗裡）。
- 算分規則在 `calc.js`，依照資料 repo 的規則文件；規則改了要同步改這裡。

本機測試：

```bash
python server.py
```

然後開 http://localhost:8765 。推到 `main` 會自動發布到 GitHub Pages（`.github/workflows/pages.yml`）。
