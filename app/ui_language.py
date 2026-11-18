"""The desktop interface language, stored alongside the app's settings."""
import json
import os
import stat
import tempfile
from http import HTTPStatus
from pathlib import Path

FILENAME = 'ui-language.json'
ROUTE = '/api/ui-language'
LANGUAGES = ('en', 'es-419')
MAX_BYTES = 128


def _language(data):
    # Check the pairs before making a dict so duplicate keys are invalid too.
    pairs = json.loads(data.decode('utf-8'), object_pairs_hook=tuple)
    if isinstance(pairs, tuple) and len(pairs) == 1:
        name, value = pairs[0]
        if name == 'language' and value in LANGUAGES:
            return value
    raise ValueError('expected one supported interface language')


def _load(path):
    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            return None
        # On POSIX, a local path swap between lstat and open must neither
        # follow a symlink nor wait for a pipe to acquire a writer.
        flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
        with os.fdopen(os.open(path, flags), 'rb') as f:
            if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
                return None
            data = f.read(MAX_BYTES + 1)
    except FileNotFoundError:
        return None
    if len(data) <= MAX_BYTES:
        try:
            return _language(data)
        except ValueError:
            pass
    return None


def _save(path, language):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Each write has its own temporary file on the same volume. A failed write
    # or replace leaves the previous file intact, even with two app windows.
    f = tempfile.NamedTemporaryFile(dir=path.parent, prefix='.ui-language-', delete=False)
    tmp = Path(f.name)
    try:
        with f:
            f.write((json.dumps({'language': language}) + '\n').encode('utf-8'))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # Windows requires the temp handle to be closed.
    except OSError:
        tmp.unlink(missing_ok=True)
        raise


def handle(h, path):
    """Called only by the desktop bridge after authenticating the request."""
    try:
        if h.command == 'POST':
            try:
                size = int(h.headers['Content-Length'])
                if not 0 < size <= MAX_BYTES or h.headers.get_content_type() != 'application/json':
                    raise ValueError
                language = _language(h.rfile.read(size))
            except (TypeError, ValueError):
                return _reply(h, HTTPStatus.BAD_REQUEST, {'error': 'invalid interface language request'})
            _save(path, language)
        else:
            language = _load(path)
    except OSError:
        return _reply(h, HTTPStatus.INTERNAL_SERVER_ERROR, {'error': 'could not access the interface language preference'})
    return _reply(h, HTTPStatus.OK, {'language': language})


def _reply(h, status, payload):
    data = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    h.send_response(status)
    h.send_header('Content-Type', 'application/json')
    h.send_header('Content-Length', str(len(data)))
    h.send_header('Cache-Control', 'no-store')
    h.end_headers()
    if h.command != 'HEAD':
        h.wfile.write(data)
