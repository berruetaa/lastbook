"""Exercise app/main.py and its real native WebView and bridge, without packaging test code.

The test controls WebView2/WKWebView through their host APIs, not a standalone
browser or a debugging port. Test-only overrides isolate the settings folder
and point the source app at the staged shipping web files. They do not change
network, TLS, origin, or bridge restrictions. DOM actions are scripted, not OS
input. A separate process is used for each launch.
"""
import json
import os
import queue
import subprocess
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def emit(message):
    print(message, flush=True)


def child(phase, work, staged):
    import faulthandler
    import threading
    faulthandler.enable(all_threads=True)
    faulthandler.dump_traceback_later(40, repeat=True)
    sys.path[:0] = [str(ROOT / 'app'), str(ROOT)]
    os.environ.pop('LASTBOOK_DATA', None)
    os.environ['SURVIVAL_DISABLE_INDEX_WATCH'] = '1'
    work = Path(work)
    staged = Path(staged)
    settings, data = work / 'settings', work / 'data'
    settings.mkdir(parents=True, exist_ok=True)
    (data / 'library-data').mkdir(parents=True, exist_ok=True)
    (data / 'library-data' / 'catalog.json').write_text('[]', encoding='utf-8')
    if phase == 'library':
        os.environ['LASTBOOK_DATA'] = str(data)
    import main
    import engine.setup.api as setup_api
    main.app_folders = lambda: (settings, work / 'app-data')
    setup_api.web_dir = lambda: staged / 'web'
    # The real handlers and Bridge are used. Only their asset directory changes.
    if phase == 'library':
        import server
        server.WEB = staged / 'web'
    ready = threading.Event()
    shell_ref = []

    if sys.platform == 'win32':
        import shell_windows as shell
        original = shell.Shell.on_ready
        def on_ready(instance, sender, args):
            original(instance, sender, args)
            if args.IsSuccess:
                emit('Native engine: WebView2 ' + str(instance.env.BrowserVersionString))
                shell_ref.append(instance)
                ready.set()
        shell.Shell.on_ready = on_ready

        def evaluate(expr):
            q = queue.Queue()
            def start():
                try:
                    q.put(instance().core.ExecuteScriptAsync('JSON.stringify(' + expr + ')'))
                except Exception as e:
                    q.put(e)
            if not instance().ui(start):
                raise RuntimeError('WebView2 window has closed')
            task = q.get(timeout=10)
            if isinstance(task, Exception):
                raise task
            end = time.monotonic() + 15
            while not task.IsCompleted and time.monotonic() < end:
                time.sleep(.05)
            if not task.IsCompleted or task.IsFaulted:
                raise RuntimeError('WebView2 ExecuteScriptAsync failed or timed out')
            return json.loads(json.loads(str(task.Result)))

        def screenshot(path):
            q = queue.Queue()
            def start():
                try:
                    n = instance().n
                    stream = n.IO.MemoryStream()
                    task = instance().core.CapturePreviewAsync(n.Core.CoreWebView2CapturePreviewImageFormat.Png, stream)
                    q.put((task, stream))
                except Exception as e:
                    q.put(e)
            instance().ui(start)
            v = q.get(timeout=10)
            if isinstance(v, Exception):
                raise v
            task, stream = v
            end = time.monotonic() + 15
            while not task.IsCompleted and time.monotonic() < end:
                time.sleep(.05)
            if not task.IsCompleted or task.IsFaulted:
                raise RuntimeError('WebView2 screenshot failed')
            path.write_bytes(bytes(stream.ToArray()))

        def stop():
            instance().ui(lambda: instance().form.Close())
    elif sys.platform == 'darwin':
        import AppKit
        import WebKit
        from PyObjCTools import AppHelper
        import shell_macos as shell
        original = shell.Shell.build
        def build(instance):
            original(instance)
            emit('Native engine: ' + str(instance.view.className()))
            shell_ref.append(instance)
            ready.set()
        shell.Shell.build = build

        def evaluate(expr):
            q = queue.Queue()
            def start():
                def done(result, error):
                    q.put((result, error))
                instance().view.callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler_(
                    'return JSON.stringify(' + expr + ');', {}, None, WebKit.WKContentWorld.pageWorld(), done)
            AppHelper.callAfter(start)
            result, error = q.get(timeout=15)
            if error:
                raise RuntimeError(str(error))
            return json.loads(str(result))

        def screenshot(path):
            q = queue.Queue()
            def start():
                def done(img, error):
                    if error or img is None:
                        q.put(str(error))
                        return
                    rep = AppKit.NSBitmapImageRep.imageRepWithData_(img.TIFFRepresentation())
                    q.put(bool(rep.representationUsingType_properties_(AppKit.NSBitmapImageFileTypePNG, {}).writeToFile_atomically_(str(path), True)))
                instance().view.takeSnapshotWithConfiguration_completionHandler_(None, done)
            AppHelper.callAfter(start)
            v = q.get(timeout=20)
            if v is not True:
                raise RuntimeError(f'WKWebView screenshot failed: {v}')

        def stop():
            AppHelper.callAfter(lambda: AppKit.NSApplication.sharedApplication().terminate_(None))
    else:
        raise RuntimeError('requires Windows or macOS')

    def instance():
        return shell_ref[0]

    def wait(expr, expected, label, timeout=80):
        end = time.monotonic() + timeout
        last = None
        while time.monotonic() < end:
            try:
                last = evaluate(expr)
                if last == expected:
                    emit('PASS ' + label + ': ' + json.dumps(last, ensure_ascii=False))
                    return
            except (RuntimeError, ValueError):
                pass
            time.sleep(.3)
        raise AssertionError(f'{label}: expected {expected!r}, last {last!r}')

    def run_checks():
        result = {'phase': phase, 'passed': False, 'platform': sys.platform}
        try:
            emit('Waiting for native WebView initialization')
            if not ready.wait(90):
                raise TimeoutError('native WebView did not initialize')
            emit('Native WebView initialized; waiting for page')
            if phase in ('setup', 'restart'):
                wait("!!document.querySelector('#languageSettings:not([hidden])')", True, 'language preference loaded')
                if phase == 'setup':
                    wait("document.querySelector('#interfaceLanguage').value", 'en', 'English default')
                    wait("document.querySelector('#main h1')?.textContent.trim()", 'Set up Lastbook', 'English setup')
                    evaluate("(()=>{document.querySelector('#interfaceLanguage').value='es-419';document.querySelector('#languageSettings button').click();return true})()")
                    wait("document.querySelector('#languageStatus').textContent.trim()", 'Idioma guardado.', 'Spanish preference saved')
                else:
                    wait("document.querySelector('#interfaceLanguage').value", 'es-419', 'Spanish survived process restart')
                wait("document.querySelector('#main h1')?.textContent.trim()", 'Configurar Lastbook', 'Spanish setup')
                assert json.loads((settings / 'ui-language.json').read_text(encoding='utf-8')) == {'language': 'es-419'}
            else:
                wait("document.querySelector('[data-nav=guides] span')?.textContent.trim()", 'Guías', 'Spanish in library')
                wait("!!document.querySelector('#sideSettings:not([hidden])')", True, 'Settings navigation available')
                evaluate("(()=>{document.querySelector('#sideSettings').click();return true})()")
                wait("document.querySelector('#main h1')?.textContent.trim()", 'Biblioteca e IA local', 'Spanish settings')
                wait("!!document.querySelector('#languageSettings:not([hidden])')", True, 'Settings language loaded')
                wait("document.querySelector('#interfaceLanguage').value", 'es-419', 'Spanish selected in Settings')
                evaluate("(()=>{document.querySelector('#interfaceLanguage').value='en';document.querySelector('#languageSettings button').click();return true})()")
                wait("document.querySelector('#languageStatus').textContent.trim()", 'Language saved.', 'English saved in Settings')
                wait("document.querySelector('#main h1')?.textContent.trim()", 'Library and local AI', 'English settings')
                assert json.loads((settings / 'ui-language.json').read_text(encoding='utf-8')) == {'language': 'en'}
                evaluate("(()=>{document.querySelector('#sBack').click();return true})()")
                wait("document.querySelector('[data-nav=guides] span')?.textContent.trim()", 'Guides', 'return to English library')
            try:
                screenshot(work / (phase + '.png'))
                emit('Screenshot captured for ' + phase)
            except Exception as e:
                emit('Screenshot unavailable: ' + repr(e))
            result['passed'] = True
        except BaseException:
            result['error'] = traceback.format_exc()
            emit(result['error'])
        finally:
            (work / (phase + '.json')).write_text(json.dumps(result, indent=2), encoding='utf-8')
            if shell_ref:
                stop()
            else:
                os._exit(1)

    threading.Thread(target=run_checks, daemon=True).start()
    sys.argv = ['lastbook'] + (['--data', str(data)] if phase == 'library' else [])
    main.main()


def parent(out):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    staged = out / 'staged'
    subprocess.run([sys.executable, '-I', '-B', str(ROOT / 'packaging/ship_app_files.py'), str(staged)], check=True)
    subprocess.run([sys.executable, '-I', '-B', str(ROOT / 'packaging/i18n_catalogs.py'), '--check', '--web-dir', str(staged / 'web')], check=True)
    work = out / 'run'
    work.mkdir(exist_ok=True)
    for phase in ('setup', 'restart', 'library'):
        emit('\nLAUNCH ' + phase)
        log = out / (phase + '.log')
        with log.open('w', encoding='utf-8') as f:
            try:
                p = subprocess.run([sys.executable, '-u', '-B', __file__, '--child', phase, str(work), str(staged)], stdout=f, stderr=subprocess.STDOUT, timeout=125)
                code = p.returncode
            except subprocess.TimeoutExpired:
                code = 'timeout'
        emit(log.read_text(encoding='utf-8', errors='replace'))
        report = work / (phase + '.json')
        if not report.exists() or not json.loads(report.read_text(encoding='utf-8')).get('passed') or code != 0:
            raise SystemExit(f'{phase} failed: exit={code}; report={report.exists()}')
    emit('Native source-shell i18n smoke PASSED; scripted DOM actions, staged assets.')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--child':
        child(*sys.argv[2:])
    else:
        parent(sys.argv[1])
