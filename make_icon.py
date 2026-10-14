"""Genera onda.ico (cuadrado redondeado oscuro con una onda)."""
import math
from PIL import Image, ImageDraw

S = 1024
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([40, 40, S - 40, S - 40], radius=230, fill=(22, 22, 26, 255))
pts = [(x, S / 2 + math.sin((x - 200) / 624 * 2 * math.pi) * 150) for x in range(200, 825, 4)]
pts = [(x / 4, S / 2 + math.sin((x / 4 - 200) / 624 * 2 * math.pi) * 150) for x in range(800, 3300)]
for x, y in pts:  # trazo hecho con círculos: bordes limpios a cualquier tamaño
    d.ellipse([x - 39, y - 39, x + 39, y + 39], fill=(245, 245, 247, 255))
d.ellipse([742, 230, 822, 310], fill=(110, 150, 255, 255))
img.save('onda.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.resize((256, 256), Image.LANCZOS).save('onda.png')
