"""Onda: reproductor ligero para Spotify.

Usa solo lo oficial: la Web API de Spotify y su Web Playback SDK, dentro de
una ventana WebView2 (Windows) o WKWebView (macOS). Sin parches ni DRM tocado.
"""
import http.server
import json
import os
import shutil
import socketserver
import sys
import threading
import time
import webbrowser

import webview

APP = 'Onda'
PORT = int(os.environ.get('ONDA_PORT', 8765))  # Tiene que coincidir con la Redirect URI: http://127.0.0.1:8765/callback
IS_WIN = sys.platform == 'win32'

WEBVIEW_ARGS = os.environ.get('ONDA_WEBVIEW_ARGS', ' '.join([
    '--autoplay-policy=no-user-gesture-required',  # que suene al pasar la música al PC desde el móvil
])).split()

# Carpetas de caché de WebView2 que se pueden borrar sin perder la sesión ni los ajustes
CACHE_DIRS = [
    'Default/Cache', 'Default/Code Cache', 'Default/GPUCache',
    'Default/DawnGraphiteCache', 'Default/DawnWebGPUCache',
    'GrShaderCache', 'ShaderCache', 'GPUPersistentCache',
]


def resource(*parts):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


WEB = resource('web')


def data_dir():
    if os.environ.get('ONDA_DATA'):  # solo para pruebas
        os.makedirs(os.environ['ONDA_DATA'], exist_ok=True)
        return os.environ['ONDA_DATA']
    if sys.platform == 'darwin':
        base = os.path.expanduser('~/Library/Application Support')
    else:
        base = os.environ.get('APPDATA') or os.path.expanduser('~')
    path = os.path.join(base, APP)
    os.makedirs(path, exist_ok=True)
    return path


DATA = data_dir()
PREFS_FILE = os.path.join(DATA, 'prefs.json')


def load_prefs():
    try:
        with open(PREFS_FILE, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


prefs = {'autoClean': True, 'trimMinimized': True, **load_prefs()}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        # Spotify vuelve a /callback?code=...; la propia app recoge el código.
        if self.path.split('?', 1)[0] == '/callback':
            self.path = '/index.html'
        super().do_GET()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False  # En Windows evita que dos copias compartan el puerto


def on_ui(fn):
    """Ejecuta fn(webview2) en el hilo de la ventana (WebView2 solo acepta órdenes desde ahí)."""
    from System import Func, Object
    wv = webview.windows[0].native.webview
    box = {}

    def run():
        box['v'] = fn(wv)
        return None

    wv.Invoke(Func[Object](run))
    return box.get('v')


def memory_mb():
    """Memoria privada de Onda: procesos de WebView2 más el propio programa."""
    from System.Diagnostics import Process

    def read(wv):
        total = Process.GetCurrentProcess().PrivateMemorySize64
        for info in wv.CoreWebView2.Environment.GetProcessInfos():
            try:
                total += Process.GetProcessById(info.ProcessId).PrivateMemorySize64
            except Exception:
                pass
        return round(total / 2 ** 20)

    return on_ui(read)


def set_memory_target(low):
    from Microsoft.Web.WebView2.Core import CoreWebView2MemoryUsageTargetLevel as Level
    on_ui(lambda wv: setattr(wv.CoreWebView2, 'MemoryUsageTargetLevel', Level.Low if low else Level.Normal))


def delete_cache_dirs():
    root = os.path.join(DATA, 'EBWebView')
    for rel in CACHE_DIRS:
        shutil.rmtree(os.path.join(root, *rel.split('/')), ignore_errors=True)


class Api:
    def open_url(self, url):
        if isinstance(url, str) and url.startswith('https://'):
            webbrowser.open(url)

    def memory(self):
        if not IS_WIN:
            return None
        try:
            return memory_mb()
        except Exception:
            return None

    def clear_cache(self):
        """Vacía la caché de disco y la de las páginas. No toca la sesión ni los ajustes."""
        if not IS_WIN:
            return False
        try:
            from Microsoft.Web.WebView2.Core import CoreWebView2BrowsingDataKinds as Kinds
            kinds = Kinds.DiskCache | Kinds.CacheStorage
            done = threading.Event()

            def start(wv):
                task = wv.CoreWebView2.Profile.ClearBrowsingDataAsync(kinds)
                threading.Thread(target=lambda: (task.Wait(5000), done.set()), daemon=True).start()

            on_ui(start)
            done.wait(6)
            return True
        except Exception:
            return False

    def set_prefs(self, values):
        if isinstance(values, dict):
            prefs.update({k: bool(v) for k, v in values.items() if k in ('autoClean', 'trimMinimized')})
            try:
                with open(PREFS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(prefs, f)
            except OSError:
                pass

    def read_clipboard(self):
        if not IS_WIN:
            return ''
        try:
            from System.Windows.Forms import Clipboard
            text = on_ui(lambda wv: Clipboard.GetText()) or ''
            return text.strip()[:200]
        except Exception:
            return ''


def light_theme():
    if not IS_WIN:
        return False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize')
        return winreg.QueryValueEx(key, 'AppsUseLightTheme')[0] == 1
    except OSError:
        return False


def watch_minimize(window):
    def minimized():
        def run():
            if not prefs.get('trimMinimized', True):
                return
            try:
                if not window.evaluate_js('window.ondaBusy ? window.ondaBusy() : false'):
                    set_memory_target(True)
            except Exception:
                pass
        threading.Thread(target=run, daemon=True).start()

    def restored():
        threading.Thread(target=lambda: _quiet(set_memory_target, False), daemon=True).start()

    window.events.minimized += minimized
    window.events.restored += restored


def _quiet(fn, *args):
    try:
        fn(*args)
    except Exception:
        pass


BUSY_HTML = """<body style="font:14px system-ui;padding:28px;background:#0C0C0E;color:#F5F5F7">
<b>Onda ya está abierta.</b><br><br>Usa la ventana que ya tienes. Si no la ves, otro programa
está usando el puerto 8765: ciérralo y vuelve a abrir Onda.</body>"""


def main():
    try:
        server = Server(('127.0.0.1', PORT), Handler)
    except OSError:
        webview.create_window(APP, html=BUSY_HTML, width=460, height=200)
        webview.start()
        return
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if IS_WIN:
        os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = ' '.join(WEBVIEW_ARGS)

    window = webview.create_window(
        APP, f'http://127.0.0.1:{PORT}/', js_api=Api(),
        width=1200, height=780, min_size=(880, 580),
        background_color='#F5F5F7' if light_theme() else '#0C0C0E',
    )
    if IS_WIN:
        watch_minimize(window)
    webview.start(private_mode=False, storage_path=DATA)

    if prefs.get('autoClean', True):
        # WebView2 tarda un momento en soltar los archivos al cerrarse
        for _ in range(6):
            delete_cache_dirs()
            if not any(os.path.exists(os.path.join(DATA, 'EBWebView', *d.split('/'))) for d in CACHE_DIRS):
                break
            time.sleep(0.5)


if __name__ == '__main__':
    main()
