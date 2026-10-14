@echo off
rem Genera dist\Onda.exe. Requisitos: python -m pip install pywebview pyinstaller pillow
cd /d "%~dp0"
python make_icon.py
python -m PyInstaller --noconfirm --clean --onefile --windowed --name Onda --icon onda.ico --add-data "web;web" onda.py
