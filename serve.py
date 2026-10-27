"""Local dev server for the D3 prototype that disables browser caching,
so edited .js/.css files always load fresh.

Usage:  python3 serve.py        (then open http://localhost:8000)
        python3 serve.py 8080   (custom port)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://localhost:{port}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
