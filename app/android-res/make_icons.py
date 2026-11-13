"""Tachyon 안드로이드 앱 아이콘·첫 화면 그림 만들기.

웹 아이콘(web/public/icons/icon.svg, 로고 A18-1 · 아이콘 I1)과 같은 그림을
안드로이드 크기마다 PNG로 그린다. 결과는 같은 폴더의 res/ 아래에 쓴다.
.github/workflows/android.yml이 `npx cap add android` 뒤 res/를 앱 프로젝트에 덮어쓴다.

    python3 app/android-res/make_icons.py   (Pillow 필요)
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
RES = HERE / 'res'

# icon.svg 값(512 칸 기준)
BG = (0x14, 0x14, 0x14)
RED = (0xFF, 0x55, 0x45)
BAND_Y0, BAND_Y1, BAND_X1 = 186, 326, 322
STOPS = [(0.0, 0.14), (0.6, 0.41), (1.0, 0.75)]  # 띠 흰색 불투명도(왼쪽 → 동그라미)
DOT_X, DOT_Y, DOT_R = 322, 256, 70
TILE_R = 112  # 둥근 칸 모서리

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SS = 8  # 크게 그려 줄여서 가장자리를 매끄럽게


def band_alpha(u):
    t = max(0.0, min(1.0, u / BAND_X1))
    for (t0, a0), (t1, a1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return a0 + (a1 - a0) * (t - t0) / (t1 - t0)
    return STOPS[-1][1]


def draw_mark(img, ox, oy, scale, band_from=None):
    """512 칸 그림의 띠·동그라미를 (ox, oy)에서 scale 배로 그린다.
    band_from: 띠를 이 x(px)부터 시작(왼쪽 벽까지 늘릴 때)."""
    w, _ = img.size
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    px = layer.load()
    y0, y1 = round(oy + BAND_Y0 * scale), round(oy + BAND_Y1 * scale)
    x_start = round(ox) if band_from is None else round(band_from)
    x_end = round(ox + BAND_X1 * scale)
    for x in range(max(0, x_start), min(w, x_end)):
        a = round(255 * band_alpha((x + 0.5 - ox) / scale))
        for y in range(max(0, y0), min(img.size[1], y1)):
            px[x, y] = (255, 255, 255, a)
    d = ImageDraw.Draw(layer)
    cx, cy, r = ox + DOT_X * scale, oy + DOT_Y * scale, DOT_R * scale
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=RED + (255,))
    img.alpha_composite(layer)


def tile(size, shape):
    """둥근 칸(shape='rounded') 또는 동그라미(shape='circle') 아이콘."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    if shape == 'circle':
        md.ellipse((0, 0, S - 1, S - 1), fill=255)
    else:
        md.rounded_rectangle((0, 0, S - 1, S - 1), radius=TILE_R * S / 512, fill=255)
    art = Image.new('RGBA', (S, S), BG + (255,))
    draw_mark(art, 0, 0, S / 512)
    img.paste(art, (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


def foreground(size):
    """적응형 아이콘 앞 층(108dp). 보이는 가운데 72dp에 512 그림을 맞추고, 띠는 왼쪽 벽까지."""
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    unit = S / 108
    draw_mark(img, 18 * unit, 18 * unit, 72 * unit / 512, band_from=0)
    return img.resize((size, size), Image.LANCZOS)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8')


def main():
    for name, k in DENSITIES.items():
        d = RES / f'mipmap-{name}'
        d.mkdir(parents=True, exist_ok=True)
        tile(round(48 * k), 'rounded').save(d / 'ic_launcher.png', optimize=True)
        tile(round(48 * k), 'circle').save(d / 'ic_launcher_round.png', optimize=True)
        foreground(round(108 * k)).save(d / 'ic_launcher_foreground.png', optimize=True)
    adaptive = ('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n')
    write(RES / 'mipmap-anydpi-v26' / 'ic_launcher.xml', adaptive)
    write(RES / 'mipmap-anydpi-v26' / 'ic_launcher_round.xml', adaptive)
    write(RES / 'values' / 'ic_launcher_background.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
          '    <color name="ic_launcher_background">#141414</color>\n</resources>\n')
    # 첫 화면: 늘어나지 않게 검은 바탕 + 가운데 아이콘(160dp). 워크플로가 기본 splash.png를 지운다.
    (RES / 'drawable-nodpi').mkdir(parents=True, exist_ok=True)
    tile(640, 'rounded').save(RES / 'drawable-nodpi' / 'splash_logo.png', optimize=True)
    write(RES / 'values' / 'splash_background.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
          '    <color name="splash_background">#000000</color>\n</resources>\n')
    write(RES / 'drawable' / 'splash.xml',
          '<?xml version="1.0" encoding="utf-8"?>\n'
          '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
          '    <item android:drawable="@color/splash_background"/>\n'
          '    <item android:gravity="center" android:width="160dp" android:height="160dp"\n'
          '        android:drawable="@drawable/splash_logo"/>\n'
          '</layer-list>\n')


if __name__ == '__main__':
    main()
