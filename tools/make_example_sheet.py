"""Draws the PLACEHOLDER example art set (public/textures/art/example/sheet.png).

It only exists to show the art-set pipeline working with art that is not the original atlas: a few simple
"spring" trees, bushes and rocks drawn from circles and polygons. Replace it with your own drawings
(public/textures/art/mine/, see docs/YOUR_ART.md). Run: python tools/make_example_sheet.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 2  # supersampling
INK = (58, 40, 52, 255)
OUT = Path(__file__).resolve().parent.parent / 'public/textures/art/example/sheet.png'
rng = random.Random(7)


def canvas(w, h):
    im = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def blob(d, cx, cy, r, fill, ink=True):
    if ink:
        d.ellipse([(cx - r - 3) * S, (cy - r - 3) * S, (cx + r + 3) * S, (cy + r + 3) * S], fill=INK)
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill)


def leaves(d, cx, cy, r, cols, n):
    for _ in range(n):
        a = rng.random() * math.tau
        q = math.sqrt(rng.random()) * r * 0.82
        x, y = cx + math.cos(a) * q, cy + math.sin(a) * q
        ang = rng.random() * math.pi
        L, W = 9, 4.2
        pts = [(x + math.cos(ang) * L, y + math.sin(ang) * L), (x + math.cos(ang + 1.57) * W, y + math.sin(ang + 1.57) * W),
               (x - math.cos(ang) * L, y - math.sin(ang) * L), (x - math.cos(ang + 1.57) * W, y - math.sin(ang + 1.57) * W)]
        d.polygon([(px * S, py * S) for px, py in pts], fill=rng.choice(cols))


def trunk(d, cx, top, bottom, w, col=(122, 74, 58, 255)):
    d.rectangle([(cx - w / 2 - 3) * S, top * S, (cx + w / 2 + 3) * S, (bottom + 3) * S], fill=INK)
    d.rectangle([(cx - w / 2) * S, top * S, (cx + w / 2) * S, bottom * S], fill=col)
    # two branches
    for sgn in (-1, 1):
        d.line([cx * S, (top + 30) * S, (cx + sgn * 34) * S, (top - 4) * S], fill=col, width=7 * S)


def round_tree(crown, leafc):
    im, d = canvas(220, 260)
    trunk(d, 110, 120, 255, 22)
    blob(d, 110, 100, 92, crown)
    leaves(d, 110, 100, 92, leafc, 70)
    return im


def cloud_tree(crown, leafc):
    im, d = canvas(240, 270)
    trunk(d, 120, 140, 265, 24)
    for (x, y, r) in [(70, 130, 58), (170, 130, 58), (120, 80, 72)]:
        blob(d, x, y, r, crown)
    for (x, y, r) in [(70, 130, 58), (170, 130, 58), (120, 80, 72)]:
        d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=crown)
    for (x, y, r) in [(70, 130, 58), (170, 130, 58), (120, 80, 72)]:
        leaves(d, x, y, r, leafc, 30)
    return im


def cypress(body, stripe):
    im, d = canvas(120, 300)
    trunk(d, 60, 250, 295, 14)
    d.ellipse([(60 - 52) * S, 4 * S, (60 + 52) * S, 268 * S], fill=INK)
    d.ellipse([(60 - 48) * S, 8 * S, (60 + 48) * S, 264 * S], fill=body)
    for k in range(9):
        y = 40 + k * 24
        w = 40 * math.sin(math.pi * (y - 8) / 256)
        d.arc([(60 - w) * S, (y - 10) * S, (60 + w) * S, (y + 14) * S], 20, 160, fill=stripe, width=4 * S)
    return im


def bush(body, dots):
    im, d = canvas(220, 120)
    d.pieslice([4 * S, 8 * S, 216 * S, 232 * S], 180, 360, fill=INK)
    d.pieslice([8 * S, 12 * S, 212 * S, 228 * S], 180, 360, fill=body)
    for (x, y, r) in [(60, 80, 30), (120, 60, 36), (170, 84, 26)]:
        d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=tuple(int(c * 0.86) for c in body[:3]) + (255,))
    for _ in range(26):
        x, y = rng.uniform(30, 190), rng.uniform(40, 112)
        if (x - 110) ** 2 / 100 ** 2 + (y - 120) ** 2 / 104 ** 2 > 0.8:
            continue
        c = rng.choice(dots)
        for a in range(5):
            ang = a * math.tau / 5
            d.ellipse([(x + math.cos(ang) * 4 - 3.5) * S, (y + math.sin(ang) * 4 - 3.5) * S, (x + math.cos(ang) * 4 + 3.5) * S, (y + math.sin(ang) * 4 + 3.5) * S], fill=c)
        d.ellipse([(x - 2.5) * S, (y - 2.5) * S, (x + 2.5) * S, (y + 2.5) * S], fill=(250, 226, 140, 255))
    return im


def rock(body, light):
    im, d = canvas(180, 110)
    pts = [(8, 106), (20, 50), (60, 18), (110, 10), (150, 36), (174, 80), (172, 106)]
    d.polygon([(x * S, y * S) for x, y in pts], fill=INK)
    inner = [(14, 104), (25, 53), (62, 23), (108, 15), (146, 39), (168, 81), (167, 104)]
    d.polygon([(x * S, y * S) for x, y in inner], fill=body)
    d.polygon([(x * S, y * S) for x, y in [(62, 23), (108, 15), (92, 48), (40, 60)]], fill=light)
    d.line([60 * S, 70 * S, 120 * S, 60 * S], fill=INK, width=3 * S)
    return im


def finish(im):
    w, h = im.size
    im = im.resize((w // S, h // S), Image.LANCZOS)
    # paper grain on the print
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            if a:
                n = rng.randint(-9, 9)
                px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)), a)
    return im


def main():
    mint, mintL = (126, 186, 160, 255), [(84, 150, 128, 255), (170, 214, 182, 255), (238, 168, 178, 255)]
    plum, plumL = (196, 122, 150, 255), [(150, 84, 120, 255), (240, 190, 200, 255), (250, 226, 170, 255)]
    sprites = [
        round_tree(mint, mintL), cloud_tree(plum, plumL), round_tree((236, 196, 110, 255), [(206, 150, 70, 255), (250, 230, 160, 255)]),
        cypress((70, 128, 112, 255), (40, 92, 84, 255)), cypress((96, 150, 96, 255), (60, 112, 70, 255)),
        bush((112, 168, 132, 255), [(240, 150, 170, 255), (255, 250, 240, 255)]), bush((150, 176, 110, 255), [(250, 210, 110, 255), (240, 140, 120, 255)]),
        rock((150, 140, 150, 255), (196, 188, 196, 255)),
    ]
    sprites = [finish(s) for s in sprites]
    W = 1300
    sheet = Image.new('RGBA', (W, 680), (0, 0, 0, 0))
    x, y, rowh = 30, 30, 0
    for s in sprites:
        if x + s.width > W - 30:
            x, y, rowh = 30, y + rowh + 40, 0
        sheet.alpha_composite(s, (x, y))
        x += s.width + 40
        rowh = max(rowh, s.height)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.crop((0, 0, W, y + rowh + 30)).save(OUT)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
