"""App icons: a white shamrock on deep green. Needs Pillow.

python icons/make_icons.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GREEN = (0x15, 0x5E, 0x36)
LEAF = (0xF4, 0xF6, 0xF0)
SS = 4


def shamrock(size, pad, bg, rounded):
    n = size * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=bg)
    else:
        d.rectangle([0, 0, n, n], fill=bg)
    s = n * (1 - 2 * pad) / 32.0
    o = n * pad

    def circ(cx, cy, r):
        d.ellipse([o + (cx - r) * s, o + (cy - r) * s, o + (cx + r) * s, o + (cy + r) * s], fill=LEAF)

    circ(16, 9.2, 5.6)
    circ(9.4, 16.6, 5.6)
    circ(22.6, 16.6, 5.6)
    circ(16, 15, 3.2)
    d.polygon([(o + 15 * s, o + 17.5 * s), (o + 17.2 * s, o + 17.5 * s), (o + 19.8 * s, o + 29 * s), (o + 17.4 * s, o + 29 * s)], fill=LEAF)
    return im.resize((size, size), Image.LANCZOS)


def save(im, name, flatten=None):
    if flatten:
        bg = Image.new("RGB", im.size, flatten)
        bg.paste(im, mask=im.split()[3])
        im = bg
    im.save(os.path.join(HERE, name))


save(shamrock(192, 0.14, GREEN, True), "icon-192.png")
save(shamrock(512, 0.14, GREEN, True), "icon-512.png")
save(shamrock(512, 0.24, GREEN, False), "icon-maskable-512.png", flatten=GREEN)
save(shamrock(180, 0.16, GREEN, False), "apple-touch-icon.png", flatten=GREEN)
print("icons written")
