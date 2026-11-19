"""Taktik 步兵算分 — 本機開啟用的簡單網頁伺服器。

平常直接用 GitHub Pages 的網址就好；這個只是在自己電腦上開（例如改程式時測試）。
執行： python server.py   然後開 http://localhost:8765
保存一樣是透過 GitHub API 存進 repo，和線上版相同。
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(APP_DIR), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Taktik 步兵算分：http://localhost:{PORT}  （Ctrl+C 結束）")
    srv.serve_forever()
