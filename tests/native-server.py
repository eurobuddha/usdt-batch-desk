"""Exercise the actual native host without opening Chrome or accessing a wallet."""
import http.client
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse

binary = pathlib.Path(sys.argv[1]).resolve()
source = pathlib.Path(sys.argv[2]).resolve()
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory) / 'app'
    shutil.copytree(source, root)
    outside = pathlib.Path(directory) / 'outside.txt'
    outside.write_text('must not be served')
    (root / 'escape.txt').symlink_to(outside)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    process = subprocess.Popen([str(binary), '--serve-only', '--assets', str(root), '--port', str(port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def request(path='/', method='GET', host=None):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        connection.request(method, path, headers={'Host': host or f'127.0.0.1:{port}'})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result
    try:
        for attempt in range(100):
            try:
                assert request()[0] == 200
                break
            except ConnectionRefusedError:
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode())
                time.sleep(.05)
        else:
            raise RuntimeError('Server did not start')
        files = [path for path in source.rglob('*') if path.is_file()]
        for path in files:
            status, headers, body = request('/' + urllib.parse.quote(path.relative_to(source).as_posix()))
            assert status == 200 and body == path.read_bytes(), path
            assert headers['Cache-Control'] == 'no-store'
            assert headers['X-Frame-Options'] == 'DENY'
            assert headers['X-Content-Type-Options'] == 'nosniff'
        assert request('/?refresh=1')[2] == (source / 'index.html').read_bytes()
        status, headers, body = request('/', 'HEAD')
        assert status == 200 and body == b'' and int(headers['Content-Length']) == (source / 'index.html').stat().st_size
        assert request('/', 'POST')[0] == 405
        assert request(host='attacker.invalid')[0] == 403
        for path in ['/../outside.txt', '/%2e%2e/outside.txt', '/%00', '/%5cescape.txt']:
            assert request(path)[0] == 403, path
        for path in ['/escape.txt', '/assets/', '/missing']:
            assert request(path)[0] == 404, path
        assert b'"native":true' in request('/__batch_desk_health')[2]
        for header, expected in [
            (f'GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nHost: attacker.invalid\r\n\r\n', b'403'),
            ('GET / HTTP/1.1\r\nX-Large: ' + 'x' * 20000 + '\r\n\r\n', b'431')
        ]:
            with socket.create_connection(('127.0.0.1', port), timeout=3) as connection:
                connection.sendall(header.encode())
                assert expected in connection.recv(256).split(b'\r\n')[0]
        print(f'PASS: {len(files)} bundled files match byte-for-byte; host, traversal, symlink, method, HEAD, header-size and cache checks passed.')
    finally:
        process.terminate()
        process.communicate(timeout=5)
