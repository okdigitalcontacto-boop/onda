#!/bin/bash
# Genera dist/Onda.app (macOS). Requisitos: pip install pywebview pyinstaller pillow
# Usa el Python de ONDA_PYTHON, o el de .venv si existe, o python3.
set -e
cd "$(dirname "$0")"
PY="${ONDA_PYTHON:-.venv/bin/python}"
[ -n "$ONDA_PYTHON" ] || [ -x "$PY" ] || PY=python3
"$PY" make_icon.py
# En macOS --onefile con --windowed está desaconsejado: se genera una .app normal.
# PyInstaller convierte onda.png en .icns si Pillow está instalado.
"$PY" -m PyInstaller --noconfirm --clean --windowed --name Onda --icon onda.png \
  --add-data "web:web" --exclude-module cryptography onda.py
echo "Listo: dist/Onda.app"
