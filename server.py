# -*- coding: utf-8 -*-
"""
SafeGuard UA — Локальний сервер та API-проксі
Запуск: python server.py або start.bat

Політика достовірності (P0):
  * Проксі НЕ підставляє локальні «зрізи» тривог. Якщо upstream недоступний,
    повертається 503 з полем "stale": true — клієнт показує банер «немає зв'язку»
    і не демонструє користувачу старі тривоги як активні.
  * Токен не зберігається в коді: береться з параметра ?token=...,
    зі змінної середовища ALERTS_API_TOKEN або з локального token.txt.
"""
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.request
import urllib.error
import urllib.parse
import json
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
UPSTREAM_TIMEOUT = 8


def read_token_file():
    """Локальний токен: token.txt у корені проєкту (внесений у .gitignore)."""
    path = os.path.join(DIRECTORY, 'token.txt')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class SafeGuardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Content-Length', str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # Проксі для API alerts.in.ua
        if parsed.path == '/api/alerts':
            query = urllib.parse.parse_qs(parsed.query)
            token = (
                query.get('token', [''])[0]
                or os.environ.get('ALERTS_API_TOKEN', '')
                or read_token_file()
            ).strip()

            if not token:
                self._send_json(503, {
                    'error': 'API token is not configured',
                    'hint': 'Передайте ?token=..., задайте ALERTS_API_TOKEN або створіть token.txt',
                    'stale': True,
                })
                return

            target_url = 'https://api.alerts.in.ua/v1/alerts/active.json?token=' + urllib.parse.quote(token)
            try:
                req = urllib.request.Request(
                    target_url,
                    headers={
                        'Authorization': 'Bearer ' + token,
                        'User-Agent': 'SafeGuard-UA-Client/2.6',
                        'Accept': 'application/json',
                    }
                )
                with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
                    data = resp.read()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, must-revalidate')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return

            except urllib.error.HTTPError as e:
                # Помилка на боці upstream (у т.ч. 401/403 — невірний токен).
                # 429 віддаємо як 503, щоб клієнт не плутав його з «даних немає».
                status = 503 if e.code == 429 else 502
                self._send_json(status, {
                    'error': 'upstream_error',
                    'upstream_status': e.code,
                    'stale': True,
                })
                return
            except Exception as e:
                # Жодних локальних snapshot-фолбеків: краще чесно сказати «немає даних».
                self._send_json(503, {
                    'error': 'upstream_unavailable',
                    'detail': str(e),
                    'stale': True,
                })
                return

        # Звичайне обслуговування статичних файлів
        super().do_GET()


def run():
    server_address = ('', PORT)
    try:
        httpd = ThreadedHTTPServer(server_address, SafeGuardHandler)
    except OSError as e:
        print(f"Помилка відкриття порту {PORT}: {e}")
        return

    print('=====================================================')
    print(f' SafeGuard UA Server запущено: http://localhost:{PORT}/')
    print(' Дані тривог: тільки з alerts.in.ua (без локальних зрізів)')

    if os.environ.get('ALERTS_API_TOKEN'):
        print(' Токен API: змінна середовища ALERTS_API_TOKEN')
    elif read_token_file():
        print(' Токен API: локальний token.txt')
    else:
        print(' Токен API: НЕ ЗАДАНО — запити повертатимуть 503')
        print(' Створіть token.txt у корені або задайте ALERTS_API_TOKEN')

    print(' Для зупинки натисніть Ctrl+C')
    print('=====================================================')

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nСервер зупинено.')


if __name__ == '__main__':
    run()
