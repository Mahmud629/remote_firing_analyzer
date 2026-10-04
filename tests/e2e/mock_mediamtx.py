# Minimal stand-in for the MediaMTX Control API (CORS + the endpoints the app uses)
import json, re
from http.server import BaseHTTPRequestHandler, HTTPServer
paths = {}
class H(BaseHTTPRequestHandler):
    def _send(self, code, body=None):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json'); self.end_headers()
        if body is not None: self.wfile.write(json.dumps(body).encode())
    def log_message(self, *a): open('/tmp/e2e/mtx.log','a').write(self.command+' '+self.path+'\n')
    def do_OPTIONS(self): self._send(204)
    def do_GET(self):
        if self.path.startswith('/v3/config/paths/list'): return self._send(200, {'items': list(paths.values())})
        m = re.match(r'/v3/(config/)?paths/get/(.+)', self.path)
        if m:
            n = m.group(2)
            if n not in paths: return self._send(404, {'error': 'path not found'})
            return self._send(200, {'name': n, 'ready': True} if not m.group(1) else paths[n])
        self._send(404, {'error': 'nf'})
    def _body(self): return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0)) or 0) or b'{}')
    def do_POST(self):
        n = self.path.split('/')[-1]; paths[n] = self._body(); open('/tmp/e2e/mtx.log','a').write('BODY '+json.dumps(paths[n])+'\n'); self._send(200, {})
    def do_PATCH(self):
        n = self.path.split('/')[-1]; paths[n] = {**paths.get(n, {}), **self._body()}; self._send(200, {})
    def do_DELETE(self):
        paths.pop(self.path.split('/')[-1], None); self._send(200, {})
HTTPServer(('127.0.0.1', 9997), H).serve_forever()
