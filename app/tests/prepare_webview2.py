"""Fetch the pinned SDK and verify the exact three DLLs required by the Windows build."""
import hashlib
import io
import urllib.request
import zipfile
from pathlib import Path

URL = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3856.49/microsoft.web.webview2.1.0.3856.49.nupkg'
FILES = {
    'lib/net462/Microsoft.Web.WebView2.Core.dll': '8219a3135436c147f8eb02fb831e99596103eebc18b6d7b794ca93f4c67018a2',
    'lib/net462/Microsoft.Web.WebView2.WinForms.dll': 'c48f8d729dc531288d2c53a6241effe7922ed1b947850b2442008a945c098c48',
    'runtimes/win-x64/native/WebView2Loader.dll': 'eb5335edeaa6f2122c044e82aab2351dc8c9b4e0fe5e578c71922fb61be285e7',
}

out = Path(__file__).resolve().parents[1] / 'webview2'
out.mkdir(exist_ok=True)
with urllib.request.urlopen(URL, timeout=60) as response:
    archive = zipfile.ZipFile(io.BytesIO(response.read()))
    for name, expected in FILES.items():
        data = archive.read(name)
        got = hashlib.sha256(data).hexdigest()
        if got != expected:
            raise SystemExit(f'{name}: expected {expected}, got {got}')
        (out / Path(name).name).write_bytes(data)
        print(f'{name}: SHA256 {got}', flush=True)
