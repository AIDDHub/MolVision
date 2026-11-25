#!/usr/bin/env python3
"""Start a local static server for MolVision and open the browser.

The app is a static WASM page. A server is required because ES modules,
import maps and .wasm files cannot be loaded from file:// reliably.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import pathlib
import threading
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # quieter output
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the MolVision local server")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer((args.host, args.port), handler) as httpd:
        url = f"http://{args.host}:{args.port}/"
        print(f"MolVision: {url}")
        print("按 Ctrl+C 停止。")
        if not args.no_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")


if __name__ == "__main__":
    main()
