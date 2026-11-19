"""Prepare the exact Windows LLM build tools; all archives are SHA-256 checked.

The MSYS2 package hashes were obtained from packages signed by MSYS2 packager
5F944B027F7FE2091985AA2EFA11531AA0AA7F57. The other hashes match the
corresponding GitHub release asset digests and the project's documented prefixes.
No downloaded file is run before its hash is verified.
"""
import hashlib
import os
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from compression import zstd
from pathlib import Path

out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
archives = [
    ('https://github.com/mstorsjo/llvm-mingw/releases/download/20261020/llvm-mingw-20261020-ucrt-x86_64.zip',
     'fd5462b7f5d93b2ff981fcd3f9c7e427e47f3203c64ea91c27bcc444eebd74cd'),
    ('https://github.com/Kitware/CMake/releases/download/v4.4.0/cmake-4.4.0-windows-x86_64.zip',
     '156d70eb7625a7b469444df7d0861d2af8d5d0a437fce32c350372b08f5620e8'),
    ('https://github.com/ninja-build/ninja/releases/download/v1.13.2/ninja-win.zip',
     '07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65'),
]
msys = {
    'gcc-libs-16.2.0-3': '5763fabf86fa13a4449ee765006d3446384ed66af7bf827459710eb777e0b11c',
    'libwinpthread-14.0.0.r598.ge3d18511f-1': 'c35d6be83d141c8cfbb61f1637dd4b53aac8f5562d766aa26d0741c40bad4e4d',
    'glslang-16.3.0-1': '5a90c8ae45b42b500fa03669aa1a94d154dcd13e0bb254f86df004b903826c03',
    'shaderc-2026.3-1': '0af3be0981f194806859a521c8ea944e084a69bb720d59aae2adedfd88c14adc',
    'spirv-tools-3~1.4.350.1-1': 'ab9b477b15e826148f616c4e7339a33c8a2dd7ef7b8bc81849c2f25ebb2076e8',
}


def fetch(url, digest):
    name = url.rsplit('/', 1)[-1]
    target = out / name
    h = hashlib.sha256()
    with urllib.request.urlopen(url, timeout=120) as response, target.open('wb') as f:
        while chunk := response.read(1024 * 1024):
            h.update(chunk)
            f.write(chunk)
    if h.hexdigest() != digest:
        raise SystemExit(f'{name}: SHA-256 mismatch: {h.hexdigest()}')
    print(f'{name}: verified SHA-256 {digest}', flush=True)
    return target


for url, digest in archives:
    path = fetch(url, digest)
    with zipfile.ZipFile(path) as z:
        for item in z.infolist():
            destination = (out / item.filename).resolve()
            if not destination.is_relative_to(out):
                raise SystemExit('unsafe path in ' + path.name)
        z.extractall(out)

for name, digest in msys.items():
    filename = f'mingw-w64-ucrt-x86_64-{name}-any.pkg.tar.zst'
    path = fetch('https://repo.msys2.org/mingw/ucrt64/' + filename, digest)
    dest = out / 'msys' / 'ucrt64' / 'bin'
    dest.mkdir(parents=True, exist_ok=True)
    with zstd.open(path, 'rb') as source, tarfile.open(fileobj=source, mode='r|') as tar:
        for member in tar:
            if member.isfile() and member.name.startswith('ucrt64/bin/'):
                name = Path(member.name).name
                with tar.extractfile(member) as src, (dest / name).open('wb') as dst:
                    while chunk := src.read(1024 * 1024):
                        dst.write(chunk)

for repo, folder, commit in [
    ('Vulkan-Headers', 'vulkan-headers', '8864cdc896bbc2a9b6eb36b3218fc9ef57908d77'),
    ('SPIRV-Headers', 'spirv-headers', 'ad9184e76a66b1001c29db9b0a3e87f646c64de0'),
]:
    dest = out / folder
    subprocess.run(['git', 'clone', '-q', '--depth', '1', '--branch', 'vulkan-sdk-1.4.350.1',
                    f'https://github.com/KhronosGroup/{repo}.git', str(dest)], check=True, timeout=120)
    got = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    if got != commit:
        raise SystemExit(f'{repo}: expected {commit}, got {got}')
    print(f'{repo}: verified commit {got}', flush=True)

for p in ('llvm-mingw-20261020-ucrt-x86_64/bin/clang.exe', 'cmake-4.4.0-windows-x86_64/bin/cmake.exe',
          'ninja.exe', 'msys/ucrt64/bin/glslc.exe'):
    if not (out / p).is_file():
        raise SystemExit('missing tool: ' + p)
print('Windows LLM build tools ready:', out, flush=True)
