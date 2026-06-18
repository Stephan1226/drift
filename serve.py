#!/usr/bin/env python3
"""Tiny static dev server for DRIFT that disables caching.

Browsers aggressively cache ES modules, which makes edits appear not to take
effect on reload. This server sends no-cache headers so every reload fetches
fresh JS.

Usage:  python3 serve.py [port]   (default 4173)
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"DRIFT dev server (no-cache) → http://127.0.0.1:{PORT}")
        httpd.serve_forever()
