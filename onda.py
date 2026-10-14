"""Onda: reproductor ligero para Spotify.

Usa solo lo oficial: la Web API de Spotify y su Web Playback SDK, dentro de
una ventana WebView2 (Windows) o WKWebView (macOS). Sin parches ni DRM tocado.
"""
import http.server
import os
import socketserver
import sys
import threading
import webbrowser

import webview

APP = 'Onda'
PORT = 8765  # Tiene que coincidir con la Redirect URI: http://127.0.0.1:8765/callback

WEBVIEW_ARGS = os.environ.get('ONDA_WEBVIEW_ARGS', ' '.join([
    '--autoplay-policy=no-user-gesture-required',  # que suene al pasar la música al PC desde el móvil
])).split()


def resource(*parts):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


WEB = resource('web')


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


class Api:
    def open_url(self, url):
        if isinstance(url, str) and url.startswith('https://'):
            webbrowser.open(url)


def data_dir():
    if sys.platform == 'darwin':
        base = os.path.expanduser('~/Library/Application Support')
    else:
        base = os.environ.get('APPDATA') or os.path.expanduser('~')
    path = os.path.join(base, APP)
    os.makedirs(path, exist_ok=True)
    return path


def light_theme():
    if sys.platform != 'win32':
        return False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r'Software\Microsoft\Windows\CurrentVersion\Themes\Personalize')
        return winreg.QueryValueEx(key, 'AppsUseLightTheme')[0] == 1
    except OSError:
        return False


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

    if sys.platform == 'win32':
        os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = ' '.join(WEBVIEW_ARGS)

    webview.create_window(
        APP, f'http://127.0.0.1:{PORT}/', js_api=Api(),
        width=1200, height=780, min_size=(880, 580),
        background_color='#F5F5F7' if light_theme() else '#0C0C0E',
    )
    webview.start(private_mode=False, storage_path=data_dir())


if __name__ == '__main__':
    main()
