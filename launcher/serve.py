#!/usr/bin/env python3
"""Serve the bundled payment interface locally. Python standard library only."""
import argparse
import errno
import http.server
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'app'
HOST = '127.0.0.1'
PORT = 38761
URL = f'http://{HOST}:{PORT}/'
APP_ID = 'personal-usdt-batch-desk-v1'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        # Refuse arbitrary Host headers, including DNS rebinding to this listener.
        if self.headers.get('Host') != f'{HOST}:{PORT}':
            self.send_error(403, 'Use the local application address')
            return
        if self.path == '/__batch_desk_health':
            body = json.dumps({'app': APP_ID, 'directory': str(ROOT)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.headers.get('Host') != f'{HOST}:{PORT}':
            self.send_error(403)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def log_message(self, format, *args):
        # No recipient data is logged or accepted by this static server.
        pass


def existing_app():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + '__batch_desk_health', timeout=2) as response:
            data = json.load(response)
        return data.get('app') == APP_ID and data.get('directory') == str(ROOT)
    except (OSError, ValueError, urllib.error.URLError):
        return False


def open_chrome():
    result = subprocess.run(['/usr/bin/open', '-a', 'Google Chrome', URL], check=False)
    if result.returncode:
        print(f'Open this address in Chrome: {URL}', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true', help='Start without opening Chrome (for verification).')
    args = parser.parse_args()
    if not (ROOT / 'index.html').is_file():
        sys.exit('The bundled app folder is missing. Keep the launcher, serve.py, and app folder together.')
    try:
        server = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            sys.exit(f"Could not start the local app: {error}")
        if existing_app():
            print(f'USDT Batch Desk is already running at {URL}', flush=True)
            if not args.no_browser:
                open_chrome()
            return
        sys.exit(f'Port {PORT} is in use. Close the earlier Batch Desk terminal, then launch again. No other process was stopped.')
    print(f'USDT Batch Desk is running on your Mac: {URL}', flush=True)
    print('Keep this window open while using the app. Press Control-C to stop it.', flush=True)
    print('The interface is local. MetaMask still needs internet access for Ethereum.', flush=True)
    if not args.no_browser:
        open_chrome()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nUSDT Batch Desk stopped.', flush=True)
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
