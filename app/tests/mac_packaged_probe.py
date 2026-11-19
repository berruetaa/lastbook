"""Launch the actual compiled .app and inspect its real Accessibility tree.

This test does not instrument the application or change macOS permissions. It
fails explicitly if the hosted session cannot expose the app's accessibility
content. The seeded Spanish preference is a read/restart test, not a GUI save.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import mac_ax

bundle = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
home = out / 'home'
data = out / 'LastbookData'
lib = data / 'library-data'
lib.mkdir(parents=True, exist_ok=True)
(lib / 'catalog.json').write_text('[]', encoding='utf-8')
(lib / 'summary.json').write_text('{"resources": 0}', encoding='utf-8')
settings = home / 'Library/Application Support/Lastbook'
settings.mkdir(parents=True, exist_ok=True)
log = data / 'derived/logs/lastbook.log'
report = {'bundle': str(bundle), 'accessibility_trusted': bool(mac_ax.trusted()), 'launches': []}
print('Accessibility trusted:', report['accessibility_trusted'], flush=True)


def run(language, expected):
    pref = settings / 'ui-language.json'
    if language:
        pref.write_text(json.dumps({'language': language}), encoding='utf-8')
    elif pref.exists():
        pref.unlink()
    env = {**os.environ, 'HOME': str(home), 'SURVIVAL_DISABLE_INDEX_WATCH': '1'}
    env.pop('LASTBOOK_DATA', None)
    executable = bundle / 'Contents/MacOS/Lastbook'
    before = log.stat().st_size if log.exists() else 0
    proc = subprocess.Popen([str(executable), '--data', str(data)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    row = {'language': language or 'default', 'pid': proc.pid, 'rendered': False}
    report['launches'].append(row)
    nodes_text = ''
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline and proc.poll() is None:
            if log.exists():
                row['log'] = log.read_bytes()[before:].decode('utf-8', 'replace')[-5000:]
            if report['accessibility_trusted']:
                nodes_text = mac_ax.text(mac_ax.tree(proc.pid))
                if expected in nodes_text:
                    row['rendered'] = True
                    break
            elif 'start pid=' in row.get('log', ''):
                time.sleep(5)
                break
            time.sleep(.5)
        row['alive'] = proc.poll() is None
        row['expected'] = expected
        (out / (row['language'] + '-ax.txt')).write_text(nodes_text, encoding='utf-8')
        if language is None and row['rendered']:
            pressed = mac_ax.press(mac_ax.tree(proc.pid), 'Settings')
            row['settings_press'] = pressed
            end = time.monotonic() + 25
            while time.monotonic() < end and proc.poll() is None:
                nodes_text = mac_ax.text(mac_ax.tree(proc.pid))
                if 'Library and local AI' in nodes_text:
                    row['settings_opened'] = True
                    break
                time.sleep(.3)
            (out / 'settings-ax.txt').write_text(nodes_text, encoding='utf-8')
        screen = out / (row['language'] + '-screen.png')
        shot = subprocess.run(['/usr/sbin/screencapture', '-x', str(screen)], capture_output=True, text=True, timeout=20)
        row['screenshot'] = bool(shot.returncode == 0 and screen.exists() and screen.stat().st_size)
        row['screenshot_error'] = shot.stderr.strip()
        ps = subprocess.run(['/bin/ps', '-axo', 'pid=,comm='], capture_output=True, text=True, timeout=10)
        row['webkit_processes'] = [line.strip() for line in ps.stdout.splitlines() if 'com.apple.WebKit' in line]
        print(json.dumps(row, ensure_ascii=False, indent=2), flush=True)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)


try:
    run(None, 'Guides')
    run('es-419', 'Guías')
finally:
    (out / 'packaged-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
if not report['accessibility_trusted']:
    raise SystemExit('BLOCKED: the hosted session did not grant Accessibility inspection')
if not all(r['alive'] and r['rendered'] for r in report['launches']):
    raise SystemExit('Packaged app did not render the expected labels')
if not report['launches'][0].get('settings_opened'):
    raise SystemExit('Packaged app could not navigate to Settings through Accessibility')
print('PASS: packaged app rendered English and a seeded Spanish preference in separate launches')
