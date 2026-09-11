#!/usr/bin/env python3
# Servidor estático de desenvolvimento p/ CREMA.
# Recebe (port, dir_absoluto) e faz chdir ANTES de qualquer getcwd — contorna
# a restrição de sandbox no caminho iCloud que quebra `python3 -m http.server`.
import os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
SKIN_DIR = sys.argv[2] if len(sys.argv) > 2 else "."
os.chdir(SKIN_DIR)

from http.server import HTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    sys.stderr.write("CREMA dev server on http://127.0.0.1:%d\n" % PORT)
    httpd.serve_forever()
