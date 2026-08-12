#!/usr/bin/env python3
"""Generate Chrome Web Store listing assets for Site Volume.

Outputs (all 24-bit RGB PNG, no alpha channel, per store requirements):
  listing/screenshot-1-popup-light.png    1280x800  (light popup over a video site)
  listing/screenshot-2-options-light.png  1280x800  (options / management page)
  listing/screenshot-3-popup-dark.png     1280x800  (dark popup, muted state)
  listing/promo-small-440x280.png         440x280   (small promo tile)
  listing/promo-marquee-1400x560.png      1400x560  (marquee promo tile)

Run:  python tools/gen_listing.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'listing')
ICON = os.path.join(ROOT, 'src', 'icons', 'icon128.png')

FONT_PATHS = {
    'cn':   r'C:\Windows\Fonts\msyh.ttc',
    'cnbd': r'C:\Windows\Fonts\msyhbd.ttc',
    'en':   r'C:\Windows\Fonts\segoeui.ttf',
    'enbd': r'C:\Windows\Fonts\segoeuib.ttf',
}


def F(size, bold=False, cn=False):
    key = 'cnbd' if (cn and bold) else ('cn' if cn else ('enbd' if bold else 'en'))
    try:
        return ImageFont.truetype(FONT_PATHS[key], int(size))
    except Exception:
        return ImageFont.load_default()


# ---------------------------------------------------------------- color utils
def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


LIGHT = dict(
    bg=hx('#f6f7fb'), card=hx('#ffffff'), fg=hx('#1c1e26'), muted=hx('#6b7280'),
    border=hx('#e5e7ef'), accent=hx('#7c5cf0'), c1=hx('#8b5cf6'), c2=hx('#4f46e5'),
    track=hx('#e9eaf3'), danger=hx('#e5484d'), page=hx('#ffffff'),
    chrome=hx('#f1f2f6'), chrome_line=hx('#e3e5ee'), tab_inactive=hx('#e7e9f1'),
)
DARK = dict(
    bg=hx('#101118'), card=hx('#1a1c26'), fg=hx('#e8eaf2'), muted=hx('#9aa0ae'),
    border=hx('#2a2d3a'), accent=hx('#9d7bff'), c1=hx('#8b5cf6'), c2=hx('#4f46e5'),
    track=hx('#2a2d3a'), danger=hx('#f2636b'), page=hx('#14151d'),
    chrome=hx('#16171f'), chrome_line=hx('#262834'), tab_inactive=hx('#20222c'),
)

# ---------------------------------------------------------------- draw utils
def grad(w, h, c1, c2, diag=True):
    w = max(1, int(w))
    h = max(1, int(h))
    yy, xx = np.mgrid[0:h, 0:w]
    t = (xx + yy) / float(w + h) if diag else xx / float(max(w - 1, 1))
    t = np.clip(t, 0, 1)
    img = np.empty((h, w, 3), dtype=np.uint8)
    for i in range(3):
        img[..., i] = (c1[i] + (c2[i] - c1[i]) * t).astype(np.uint8)
    return Image.fromarray(img, 'RGB')


def rrect_alpha(w, h, radius):
    m = Image.new('L', (int(w), int(h)), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, int(w) - 1, int(h) - 1], radius=radius, fill=255)
    return m


def grad_rounded(w, h, radius, c1, c2, diag=True):
    g = grad(w, h, c1, c2, diag=diag)
    g.putalpha(rrect_alpha(w, h, radius))
    return g


def icon_img(size):
    im = Image.open(ICON).convert('RGBA')
    return im.resize((int(size), int(size)), Image.LANCZOS)


def speaker_icon(d, x, y, s, color, muted=False):
    """Speaker glyph in a 24x24 design box, top-left at (x, y), size s px."""
    u = s / 24.0
    d.polygon([(x + 4 * u, y + 9.5 * u), (x + 4 * u, y + 14.5 * u),
               (x + 7.2 * u, y + 14.5 * u), (x + 12 * u, y + 18.6 * u),
               (x + 12 * u, y + 5.4 * u), (x + 7.2 * u, y + 9.5 * u)], fill=color)
    lw = max(1, int(round(1.8 * u)))
    if muted:
        d.line([(x + 15.5 * u, y + 9.5 * u), (x + 20.5 * u, y + 14.5 * u)], fill=color, width=lw)
        d.line([(x + 20.5 * u, y + 9.5 * u), (x + 15.5 * u, y + 14.5 * u)], fill=color, width=lw)
    else:
        d.arc([x + 11 * u, y + 8 * u, x + 19 * u, y + 16 * u], start=-60, end=60, fill=color, width=lw)
        d.arc([x + 10.2 * u, y + 4.6 * u, x + 25 * u, y + 19.4 * u], start=-48, end=48, fill=color, width=lw)


def draw_avatar(base, theme, x, y, size, letter, muted=False, radius=None):
    size = int(size)
    radius = radius or int(size * 0.29)
    if muted:
        g = Image.new('RGBA', (size, size), theme['track'] + (255,))
        g.putalpha(rrect_alpha(size, size, radius))
    else:
        g = grad_rounded(size, size, radius, theme['c1'], theme['c2'], diag=True)
    base.alpha_composite(g, (int(x), int(y)))
    d = ImageDraw.Draw(base)
    f = F(size * 0.52, bold=True, cn=True)
    col = theme['muted'] + (255,) if muted else (255, 255, 255, 255)
    d.text((x + size / 2, y + size / 2), letter, font=f, fill=col, anchor='mm')


def draw_waves(base, theme, x, y, w, h, volume, s=1.0):
    n = 10
    bw = 4 * s
    gap = 3 * s
    total = n * bw + (n - 1) * gap
    x0 = x + (w - total) / 2
    lit = int(round(volume * n))
    for i in range(n):
        wave = 0.45 + 0.55 * abs(math.sin((i / n) * math.pi))
        bh = max(4 * s, h * wave)
        on = (i < lit) and volume > 0
        g = grad_rounded(bw, bh, 2 * s, theme['c1'], theme['c2'], diag=False)
        if not on:
            g = g.point(lambda p: int(p * 0.22))
        base.alpha_composite(g, (int(x0 + i * (bw + gap)), int(y + h - bh)))


def draw_slider(base, theme, x, y, w, fill, s=1.0):
    d = ImageDraw.Draw(base)
    th = 8 * s
    r = th / 2
    ty = y + 6 * s - th / 2
    d.rounded_rectangle([x, ty, x + w, ty + th], radius=r, fill=theme['track'])
    fw = w * fill
    if fw > 4:
        g = grad_rounded(fw, th, r, theme['c1'], theme['c2'], diag=False)
        base.alpha_composite(g, (int(x), int(ty)))
    t = 20 * s
    tcx, tcy = int(x + fw), int(ty + th / 2)
    d.ellipse([tcx - t / 2 + 1, tcy - t / 2 + 1, tcx + t / 2 + 1, tcy + t / 2 + 1],
              fill=(0, 0, 0, 70))
    d.ellipse([tcx - t / 2, tcy - t / 2, tcx + t / 2, tcy + t / 2], fill=(255, 255, 255, 255))
    d.ellipse([tcx - t / 2 + 1.5 * s, tcy - t / 2 + 1.5 * s, tcx + t / 2 - 1.5 * s, tcy + t / 2 - 1.5 * s],
              outline=theme['accent'], width=max(2, int(round(2 * s))))


def draw_mute_btn(base, theme, x, y, w, active, s=1.0):
    h = 36 * s
    d = ImageDraw.Draw(base)
    if active:
        d.rounded_rectangle([x, y, x + w, y + h], radius=10 * s, fill=theme['card'])
        d.rounded_rectangle([x, y, x + w, y + h], radius=10 * s,
                            outline=theme['danger'], width=max(1, int(round(1.5 * s))))
        tcol = theme['danger'] + (255,)
    else:
        base.alpha_composite(grad_rounded(w, h, 10 * s, theme['c1'], theme['c2'], diag=False), (int(x), int(y)))
        tcol = (255, 255, 255, 255)
    label = '恢复音量' if active else '静音此站点'
    f = F(13 * s, bold=True, cn=True)
    ico = 15 * s
    tw = d.textlength(label, font=f)
    gap = 7 * s
    total = ico + gap + tw
    ix = x + (w - total) / 2
    speaker_icon(d, ix, y + (h - ico) / 2, ico, tcol, muted=not active)
    d.text((ix + ico + gap, y + h / 2), label, font=f, fill=tcol, anchor='lm')


# ---------------------------------------------------------------- popup
def render_popup(theme, site, volume, recents, scale=1.35,
                 hint='静音 = 音量 0,拖动滑块即可恢复'):
    s = scale
    pad = 14 * s
    W = 320 * s
    content_w = W - 2 * pad
    card_pad = 14 * s
    muted = volume == 0

    head_h, head_mb = 28 * s, 12 * s
    site_line_h, site_line_mb = 34 * s, 12 * s
    vol_h, vol_mb = 30 * s, 10 * s
    slider_h = 26 * s
    mute_mt, mute_h = 12 * s, 36 * s
    section_mt = 14 * s
    list_head_h, list_head_mb = 22 * s, 8 * s
    item_h, item_gap = 36 * s, 4 * s
    hint_mt, hint_h = 12 * s, 16 * s

    card_h = site_line_h + site_line_mb + vol_h + vol_mb + slider_h + mute_mt + mute_h + 2 * card_pad
    card_top = pad + head_h + head_mb
    section_top = card_top + card_h + section_mt
    list_head_bot = section_top + list_head_h + list_head_mb
    items_h = len(recents) * item_h + max(0, len(recents) - 1) * item_gap
    hint_top = list_head_bot + items_h + hint_mt
    H = int(hint_top + hint_h + pad)

    img = Image.new('RGBA', (int(W), int(H)), theme['bg'] + (255,))
    d = ImageDraw.Draw(img)

    # header
    img.alpha_composite(icon_img(28 * s), (int(pad), int(pad)))
    d.text((pad + 28 * s + 10 * s, pad + 14 * s), 'Site Volume',
           font=F(14 * s, bold=True, cn=True), fill=theme['fg'] + (255,), anchor='lm')

    # card
    d.rounded_rectangle([pad, card_top, pad + content_w, card_top + card_h],
                        radius=14 * s, fill=theme['card'])
    d.rounded_rectangle([pad, card_top, pad + content_w, card_top + card_h],
                        radius=14 * s, outline=theme['border'], width=max(1, int(round(s))))

    ix = pad + card_pad
    # site line
    draw_avatar(img, theme, ix, card_top + card_pad, 34 * s, site[0].upper())
    d.text((ix + 34 * s + 10 * s, card_top + card_pad + 10 * s), site,
           font=F(13.5 * s, bold=True, cn=True), fill=theme['fg'] + (255,), anchor='lm')
    d.text((ix + 34 * s + 10 * s, card_top + card_pad + 24 * s), '站点音量',
           font=F(11 * s, cn=True), fill=theme['muted'] + (255,), anchor='lm')

    # volume display + waves
    vy = card_top + card_pad + site_line_h + site_line_mb
    fnum = F(30 * s, bold=True, cn=True)
    num = str(round(volume * 100))
    num_col = theme['danger'] + (255,) if muted else theme['fg'] + (255,)
    d.text((ix, vy + 15 * s), num, font=fnum, fill=num_col, anchor='lm')
    tw = d.textlength(num, font=fnum)
    d.text((ix + tw + 2 * s, vy + 15 * s), '%', font=F(15 * s, bold=True, cn=True),
           fill=theme['muted'] + (255,), anchor='lm')
    waves_w = 10 * 4 * s + 9 * 3 * s
    draw_waves(img, theme, ix + content_w - 2 * card_pad - waves_w, vy + 4 * s, waves_w, 22 * s, volume, s)

    # slider
    sy = vy + vol_h + vol_mb
    draw_slider(img, theme, ix, sy, content_w - 2 * card_pad, volume, s)

    # mute button
    draw_mute_btn(img, theme, ix, sy + slider_h + mute_mt, content_w - 2 * card_pad, muted, s)

    # section header
    d.text((ix, section_top + 11 * s), '最近使用', font=F(11.5 * s, bold=True, cn=True),
           fill=theme['muted'] + (255,), anchor='lm')
    mlbl = '管理'
    fm = F(11.5 * s, bold=True, cn=True)
    mtw = d.textlength(mlbl, font=fm)
    mpx = pad + content_w - card_pad - mtw - 22 * s
    d.rounded_rectangle([mpx, section_top + 1 * s, mpx + mtw + 22 * s, section_top + 1 * s + 20 * s],
                        radius=9 * s, outline=theme['border'], width=max(1, int(round(s))))
    d.text((mpx + 11 * s, section_top + 11 * s), mlbl, font=fm, fill=theme['fg'] + (255,), anchor='lm')

    # recent list
    iy = list_head_bot
    inner_w = content_w - 2 * card_pad
    for key, vol, mut in recents:
        top = iy
        draw_avatar(img, theme, ix, top + 7 * s, 22 * s, key[0].upper(), muted=mut, radius=7 * s)
        d.text((ix + 22 * s + 9 * s, top + 7 * s + 11 * s), key, font=F(12.5 * s, cn=True),
               fill=theme['fg'] + (255,), anchor='lm')
        if mut:
            ico = 12 * s
            lbl = '0%'
            tcol = theme['danger'] + (255,)
            fv = F(12 * s, bold=True, cn=True)
            ltw = d.textlength(lbl, font=fv)
            vx = ix + inner_w - ltw
            speaker_icon(d, vx - ico - 4 * s, top + 7 * s + 11 * s - ico / 2, ico, tcol, muted=True)
            d.text((vx, top + 7 * s + 11 * s), lbl, font=fv, fill=tcol, anchor='lm')
        else:
            lbl = str(round(vol * 100)) + '%'
            fv = F(12 * s, cn=True)
            ltw = d.textlength(lbl, font=fv)
            d.text((ix + inner_w - ltw, top + 7 * s + 11 * s), lbl, font=fv,
                   fill=theme['muted'] + (255,), anchor='lm')
        iy = top + item_h + item_gap

    # hint
    fh = F(11 * s, cn=True)
    d.text((W / 2, hint_top + 8 * s), hint, font=fh, fill=theme['muted'] + (255,), anchor='mm')

    return img


# ---------------------------------------------------------------- video page (behind popup)
def render_video_page(theme, brand, brand_col, title, meta, W, H):
    img = Image.new('RGBA', (W, H), theme['page'] + (255,))
    d = ImageDraw.Draw(img)

    # nav bar
    nav_h = 56
    d.rectangle([0, 0, W, nav_h], fill=theme['card'])
    d.line([0, nav_h - 1, W, nav_h - 1], fill=theme['chrome_line'])
    d.text((24, nav_h / 2), brand, font=F(19, bold=True, cn=True), fill=brand_col, anchor='lm')
    d.text((150, nav_h / 2), '首页', font=F(13.5, cn=True), fill=theme['fg'], anchor='lm')
    d.text((216, nav_h / 2), '视频', font=F(13.5, cn=True), fill=theme['muted'], anchor='lm')
    d.text((276, nav_h / 2), '音乐', font=F(13.5, cn=True), fill=theme['muted'], anchor='lm')
    d.text((336, nav_h / 2), '直播', font=F(13.5, cn=True), fill=theme['muted'], anchor='lm')
    # search pill
    d.rounded_rectangle([W - 360, nav_h / 2 - 16, W - 60, nav_h / 2 + 16], radius=16,
                        fill=theme['bg'], outline=theme['chrome_line'])
    d.text((W - 338, nav_h / 2), '搜索', font=F(12.5, cn=True), fill=theme['muted'], anchor='lm')
    d.ellipse([W - 74, nav_h / 2 - 8, W - 58, nav_h / 2 + 8], fill=theme['track'])
    # avatar
    d.ellipse([W - 44, nav_h / 2 - 13, W - 18, nav_h / 2 + 13], outline=brand_col, width=2)

    # video panel
    px, py, pw, ph = 24, 80, 610, 344
    panel = grad_rounded(pw, ph, 14, (26, 28, 44), (10, 11, 20), diag=True)
    img.alpha_composite(panel, (px, py))
    d = ImageDraw.Draw(img)
    # play button
    pb = 46
    pcx, pcy = px + pw / 2, py + ph / 2 - 20
    d.ellipse([pcx - pb / 2, pcy - pb / 2, pcx + pb / 2, pcy + pb / 2], fill=(255, 255, 255, 235))
    d.polygon([(pcx - 12, pcy - 18), (pcx - 12, pcy + 18), (pcx + 18, pcy)], fill=brand_col)
    # progress bar at bottom
    d.rounded_rectangle([px + 20, py + ph - 26, px + pw - 20, py + ph - 18], radius=4,
                        fill=(255, 255, 255, 70))
    fw = (px + pw - 40) * 0.38
    d.rounded_rectangle([px + 20, py + ph - 26, px + 20 + fw, py + ph - 18], radius=4,
                        fill=brand_col)
    d.ellipse([px + 20 + fw - 6, py + ph - 24, px + 20 + fw + 6, py + ph - 12], fill=(255, 255, 255, 255))
    # corner meta
    d.text((px + 20, py + ph - 46), '4K 高清 · 立体声', font=F(11.5, cn=True),
           fill=(255, 255, 255, 200), anchor='lm')

    # title + meta below
    ty = py + ph + 18
    d.text((px, ty), title, font=F(20, bold=True, cn=True), fill=theme['fg'], anchor='lm')
    ty += 34
    d.text((px, ty), meta, font=F(12.5, cn=True), fill=theme['muted'], anchor='lm')
    # action buttons
    ty += 26
    for i in range(5):
        cx = px + 18 + i * 52
        d.ellipse([cx - 14, ty - 14, cx + 14, ty + 14], fill=theme['card'],
                  outline=theme['chrome_line'])
    d.text((px + 130, ty), '评论', font=F(12.5, cn=True), fill=theme['muted'], anchor='lm')

    # related column
    rx = px + pw + 26
    rw = W - rx - 24
    for i in range(4):
        ry = 80 + i * 132
        d.rounded_rectangle([rx, ry, rx + rw, ry + 120], radius=12, fill=theme['card'],
                            outline=theme['chrome_line'])
        d.rounded_rectangle([rx + 12, ry + 12, rx + 12 + 150, ry + 12 + 84], radius=8,
                            fill=(30, 32, 50))
        d.ellipse([rx + 12 + 75 - 12, ry + 12 + 42 - 12, rx + 12 + 75 + 12, ry + 12 + 42 + 12],
                  fill=(70, 74, 110))
        d.polygon([(rx + 12 + 72, ry + 12 + 32), (rx + 12 + 72, ry + 12 + 52), (rx + 12 + 90, ry + 12 + 42)],
                  fill=(200, 205, 235))
        d.text((rx + 176, ry + 20), '视频标题示例 第 %d 期' % (i + 1), font=F(13, cn=True),
               fill=theme['fg'], anchor='lm')
        d.text((rx + 176, ry + 44), 'UP主 · 12.3万播放', font=F(11.5, cn=True),
               fill=theme['muted'], anchor='lm')
        d.rounded_rectangle([rx + 176, ry + 66, rx + 176 + 56, ry + 66 + 6], radius=3,
                            fill=theme['track'])
        d.rounded_rectangle([rx + 176, ry + 66, rx + 176 + 40, ry + 66 + 6], radius=3, fill=theme['accent'])
    return img


# ---------------------------------------------------------------- options page
def render_options(theme, stats, rows, W, H):
    """stats: (total, avg, muted) ; rows: [(key, vol, muted)]"""
    img = Image.new('RGBA', (W, H), theme['bg'] + (255,))
    d = ImageDraw.Draw(img)
    cx = W / 2
    cw = 620
    u = 0.92  # page scale

    y = 26 * u
    # header
    img.alpha_composite(icon_img(42 * u), (int(cx - cw / 2), int(y)))
    d.text((cx - cw / 2 + 42 * u + 14 * u, y + 21 * u), 'Site Volume',
           font=F(22 * u, bold=True, cn=True), fill=theme['fg'], anchor='lm')
    y += 42 * u + 14 * u
    d.text((cx - cw / 2 + 42 * u + 14 * u, y + 6 * u),
           '每个站点的音量设置。未配置站点恒为 100% (不干预)。',
           font=F(12.5 * u, cn=True), fill=theme['muted'], anchor='lm')
    y += 24 * u

    # stats
    labels = [('已配置站点', stats[0], 'accent'), ('平均音量', stats[1], 'plain'), ('已静音站点', stats[2], 'danger')]
    sw = (cw - 2 * 12 * u) / 3
    for i, (lbl, val, kind) in enumerate(labels):
        sx = cx - cw / 2 + i * (sw + 12 * u)
        d.rounded_rectangle([sx, y, sx + sw, y + 66 * u], radius=14 * u, fill=theme['card'],
                            outline=theme['border'])
        num_col = theme['fg']
        if kind == 'accent':
            num_col = theme['accent']
        elif kind == 'danger':
            num_col = theme['danger']
        d.text((sx + sw / 2, y + 20 * u), val, font=F(23 * u, bold=True, cn=True),
               fill=num_col, anchor='mm')
        d.text((sx + sw / 2, y + 46 * u), lbl, font=F(11.5 * u, cn=True),
               fill=theme['muted'], anchor='mm')
    y += 66 * u + 18 * u

    # toolbar (right aligned, side by side)
    right = cx + cw / 2
    tw0 = d.textlength('导入', font=F(12.5 * u, bold=True, cn=True))
    tw1 = d.textlength('导出', font=F(12.5 * u, bold=True, cn=True))
    bw0, bw1 = tw0 + 34 * u, tw1 + 34 * u
    bx1 = right - bw1
    bx0 = bx1 - bw0 - 8 * u
    for bx, lbl in ((bx0, '导入'), (bx1, '导出')):
        tw = d.textlength(lbl, font=F(12.5 * u, bold=True, cn=True))
        d.rounded_rectangle([bx, y - 16 * u, bx + tw + 34 * u, y + 16 * u], radius=9 * u,
                            outline=theme['border'])
        d.text((bx + 17 * u, y), lbl, font=F(12.5 * u, bold=True, cn=True),
               fill=theme['fg'], anchor='mm')
    y += 34 * u

    # rows
    row_h = 54 * u
    for key, vol, mut in rows:
        rx = cx - cw / 2
        d.rounded_rectangle([rx, y, rx + cw, y + row_h], radius=14 * u, fill=theme['card'],
                            outline=theme['border'])
        draw_avatar(img, theme, rx + 16 * u, y + (row_h - 38 * u) / 2, 38 * u, key[0].upper(), muted=mut)
        d.text((rx + 16 * u + 38 * u + 12 * u, y + row_h / 2), key, font=F(14 * u, bold=True, cn=True),
               fill=theme['fg'], anchor='lm')
        state = '静音' if mut else '已设置'
        d.text((rx + 16 * u + 38 * u + 12 * u, y + row_h / 2 + 14 * u), state,
               font=F(11 * u, cn=True), fill=(theme['danger'] if mut else theme['muted']) + (255,),
               anchor='lm')
        # right zone: pct | mute btn | slider (left to right)
        right = rx + cw - 16 * u
        pct_w, mute_w, gap = 42 * u, 46 * u, 14 * u
        slider_end = right - pct_w - mute_w - 2 * gap
        slx = rx + 210 * u
        draw_slider(img, theme, slx, y + row_h / 2 - 10 * u, max(60, slider_end - slx), vol, u)
        # mute toggle button
        bx = slider_end + gap
        if mut:
            d.rounded_rectangle([bx, y + (row_h - 28 * u) / 2, bx + mute_w, y + (row_h + 28 * u) / 2],
                                radius=8 * u, fill=theme['danger'])
            d.text((bx + mute_w / 2, y + row_h / 2), '静音', font=F(11.5 * u, bold=True, cn=True),
                   fill=(255, 255, 255, 255), anchor='mm')
        else:
            d.rounded_rectangle([bx, y + (row_h - 28 * u) / 2, bx + mute_w, y + (row_h + 28 * u) / 2],
                                radius=8 * u, outline=theme['border'])
            d.text((bx + mute_w / 2, y + row_h / 2), '静音', font=F(11.5 * u, bold=True, cn=True),
                   fill=theme['muted'], anchor='mm')
        # pct label
        if mut:
            d.text((right, y + row_h / 2), '0%', font=F(13.5 * u, bold=True, cn=True),
                   fill=theme['danger'], anchor='rm')
        else:
            d.text((right, y + row_h / 2), str(round(vol * 100)) + '%',
                   font=F(13.5 * u, bold=True, cn=True), fill=theme['fg'], anchor='rm')
        y += row_h + 9 * u

    # hint
    y += 6 * u
    d.text((cx, y + 10 * u), '站点按主域名 (eTLD+1) 匹配 · 静音 = 音量 0', font=F(11.5 * u, cn=True),
           fill=theme['muted'], anchor='mm')
    return img


# ---------------------------------------------------------------- browser frame
def render_browser(theme, tab_title, url, content_img, W=1160, H=740):
    s = 1.0
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=12, fill=theme['card'])
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=12, outline=theme['chrome_line'])

    # tab bar
    d.rectangle([0, 12, W, 40], fill=theme['chrome'])
    # active tab (toolbar rect drawn after hides bottom corners)
    d.rounded_rectangle([14, 12, 220, 42], radius=8, fill=theme['page'])
    img.alpha_composite(icon_img(17), (20, 21))
    d.text((46, 29), tab_title, font=F(12.5, cn=True), fill=theme['fg'], anchor='lm')
    # inactive tabs
    for x in (232, 380):
        d.rounded_rectangle([x, 16, x + 140, 42], radius=8, fill=theme['tab_inactive'])
    d.text((252, 29), '新标签页', font=F(12.5, cn=True), fill=theme['muted'], anchor='lm')
    d.text((400, 29), '扩展', font=F(12.5, cn=True), fill=theme['muted'], anchor='lm')
    # new tab +
    d.ellipse([532, 23, 548, 39], outline=theme['muted'], width=1)
    d.line([536, 31, 544, 31], fill=theme['muted'], width=1)
    d.line([540, 27, 540, 35], fill=theme['muted'], width=1)
    # window controls
    for i, (sx, sy) in enumerate(((W - 92, 26), (W - 64, 26), (W - 36, 26))):
        col = theme['muted']
        if i == 2:
            d.line([sx - 5, sy - 5, sx + 5, sy + 5], fill=col, width=1)
            d.line([sx - 5, sy + 5, sx + 5, sy - 5], fill=col, width=1)
        elif i == 1:
            d.rectangle([sx - 5, sy - 4, sx + 5, sy + 4], outline=col, width=1)
        else:
            d.line([sx - 6, sy, sx + 6, sy], fill=col, width=1)

    # toolbar
    d.rectangle([0, 40, W, 96], fill=theme['chrome'])
    d.line([0, 95, W, 95], fill=theme['chrome_line'])
    # nav buttons
    for i, bx in enumerate((26, 54, 82)):
        d.ellipse([bx - 9, 68 - 9, bx + 9, 68 + 9], fill=theme['tab_inactive'])
    d.polygon([(26 - 3, 68), (26 + 3, 65), (26 + 3, 71)], fill=theme['muted'])
    d.polygon([(54 + 3, 68), (54 - 3, 65), (54 - 3, 71)], fill=theme['muted'])
    d.ellipse([82 - 2, 68 - 2, 82 + 2, 68 + 2], fill=theme['muted'])
    # address bar
    abx, aby, abw, abh = 150, 56, 540, 34
    d.rounded_rectangle([abx, aby, abx + abw, aby + abh], radius=17, fill=theme['page'],
                        outline=theme['chrome_line'])
    # lock
    d.rounded_rectangle([abx + 18, aby + 13, abx + 26, aby + 19], radius=2, fill=theme['muted'])
    d.arc([abx + 20, aby + 8, abx + 24, aby + 15], start=0, end=180, fill=theme['muted'], width=1)
    d.text((abx + 38, aby + abh / 2), url, font=F(12.5, cn=True), fill=theme['fg'], anchor='lm')
    # star
    d.polygon([(abx + abw - 28, aby + 10), (abx + abw - 24, aby + 18), (abx + abw - 15, aby + 18),
               (abx + abw - 22, aby + 24), (abx + abw - 19, aby + 33), (abx + abw - 28, aby + 28),
               (abx + abw - 37, aby + 33), (abx + abw - 34, aby + 24), (abx + abw - 41, aby + 18),
               (abx + abw - 32, aby + 18)], fill=theme['track'], outline=theme['muted'])

    # extension icons (Site Volume highlighted last)
    exts = [(theme['track'], 'o'), (theme['track'], 'b'), (theme['track'], 'g')]
    ex = W - 44
    for col, glyph in exts:
        d.ellipse([ex - 10, 58, ex + 10, 78], fill=col)
        if glyph == 'o':
            d.ellipse([ex - 5, 63, ex + 5, 73], outline=theme['muted'], width=1)
        elif glyph == 'b':
            d.polygon([(ex - 3, 61), (ex - 3, 75), (ex + 5, 68)], fill=theme['muted'])
        else:
            d.polygon([(ex - 3, 61), (ex + 4, 66), (ex - 3, 71), (ex - 3, 61)], fill=theme['muted'])
        ex -= 42
    # Site Volume highlighted
    d.ellipse([ex - 13, 56, ex + 13, 82], fill=None, outline=theme['accent'], width=2)
    g = grad_rounded(26, 26, 13, theme['c1'], theme['c2'], diag=True)
    img.alpha_composite(g, (ex - 13, 56))
    dd = ImageDraw.Draw(img)
    speaker_icon(dd, ex - 13, 56, 26, (255, 255, 255, 255))
    d.ellipse([ex + 4, 54, ex + 12, 62], fill=theme['danger'])

    # content
    img.alpha_composite(content_img, (0, 96))
    return img


# ---------------------------------------------------------------- screenshots
def frame_with_shadow(desktop, im, px, py, radius=18, offset=(0, 9), blur=16):
    """Paste an opaque popup canvas onto `desktop` with rounded corners + soft shadow."""
    a = im.split()[3].point(lambda p: int(p * 0.5))
    sh = a.filter(ImageFilter.GaussianBlur(blur))
    shadow = Image.new('RGBA', im.size, (18, 16, 48, 0))
    shadow.putalpha(sh)
    desktop.alpha_composite(shadow, (px + offset[0], py + offset[1]))
    pop = im.copy()
    pop.putalpha(rrect_alpha(pop.size[0], pop.size[1], radius))
    desktop.alpha_composite(pop, (px, py))


def screenshot_light_popup():
    theme = LIGHT
    W, H = 1280, 800
    desktop = grad(W, H, (235, 237, 245), (226, 229, 240), diag=True).convert('RGBA')
    # subtle decorative circles
    dd = ImageDraw.Draw(desktop)
    for cx, cy, r, col in ((1180, 120, 180, (124, 92, 246, 26)), (90, 700, 220, (79, 70, 229, 22))):
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    page = render_video_page(theme, 'bilibili', hx('#FB7299'),
                             'Site Volume — 站点音量演示',
                             'UP主 发布 · 2026-08-10 · 已观看 1.2 万次',
                             1160, 740 - 96)
    browser = render_browser(theme, 'bilibili.com - 视频', 'https://www.bilibili.com/video/BV1mZ4y1X7a5', page)
    desktop.alpha_composite(browser, (60, 40))
    pop = render_popup(theme, 'bilibili.com', 0.65,
                       [('bilibili.com', 0.65, False), ('youtube.com', 1.0, False),
                        ('twitch.tv', 0.30, False), ('spotify.com', 0.85, False)],
                       scale=1.20)
    pw, _ = pop.size
    frame_with_shadow(desktop, pop, 1220 - pw - 18, 150)
    return desktop.convert('RGB')


def screenshot_options():
    theme = LIGHT
    W, H = 1280, 800
    desktop = grad(W, H, (235, 237, 245), (226, 229, 240), diag=True).convert('RGBA')
    dd = ImageDraw.Draw(desktop)
    dd.ellipse([1160, 120, 1160 + 360, 120 + 360], fill=(124, 92, 246, 26))
    page = render_options(theme, ('6', '57%', '1'),
                          [('bilibili.com', 0.65, False), ('youtube.com', 1.0, False),
                           ('twitch.tv', 0.30, False), ('netflix.com', 0.0, True),
                           ('spotify.com', 0.85, False), ('github.com', 0.60, False)],
                          1160, 740 - 96)
    browser = render_browser(theme, 'Site Volume — 设置',
                             'chrome-extension://sitevolume/options.html', page)
    desktop.alpha_composite(browser, (60, 40))
    return desktop.convert('RGB')


def screenshot_dark_popup():
    theme = DARK
    W, H = 1280, 800
    desktop = grad(W, H, (20, 21, 30), (14, 15, 22), diag=True).convert('RGBA')
    dd = ImageDraw.Draw(desktop)
    for cx, cy, r, col in ((1180, 130, 190, (124, 92, 246, 30)), (80, 710, 230, (79, 70, 229, 24))):
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    page = render_video_page(theme, 'YouTube', hx('#FF0000'),
                             'Site Volume — 暗色主题演示',
                             'Music video · 2026-08-11 · 4.2 万次观看',
                             1160, 740 - 96)
    browser = render_browser(theme, 'youtube.com - 视频', 'https://www.youtube.com/watch?v=abcd1234', page)
    desktop.alpha_composite(browser, (60, 40))
    pop = render_popup(theme, 'youtube.com', 0.0,
                       [('youtube.com', 0.0, True), ('bilibili.com', 0.65, False),
                        ('twitch.tv', 0.30, False), ('netflix.com', 0.0, True)],
                       scale=1.20)
    pw, _ = pop.size
    frame_with_shadow(desktop, pop, 1220 - pw - 18, 150)
    return desktop.convert('RGB')


# ---------------------------------------------------------------- promo tiles
def promo_small():
    W, H = 440, 280
    img = grad(W, H, (139, 92, 246), (79, 70, 229), diag=True).convert('RGBA')
    d = ImageDraw.Draw(img)
    # decorative
    for cx, cy, r, col in ((390, 20, 150, (255, 255, 255, 22)), (30, 250, 120, (255, 255, 255, 16)),
                           (300, 260, 90, (30, 20, 90, 26))):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    # sound wave arcs (decor)
    for cx, cy, r, wdt in ((300, 150, 60, 3), (300, 150, 90, 3), (300, 150, 120, 3)):
        d.arc([cx - r, cy - r, cx + r, cy + r], start=-45, end=45, fill=(255, 255, 255, 40), width=wdt)

    ic = 66
    img.alpha_composite(icon_img(ic), (int(W / 2 - ic / 2), 52))
    d.text((W / 2, 140), 'Site Volume', font=F(30, bold=True, cn=False), fill=(255, 255, 255, 255), anchor='mm')
    d.text((W / 2, 178), '每个网站,独立音量', font=F(15, cn=True), fill=(255, 255, 255, 235), anchor='mm')
    # small slider
    sw, sx, sy = 220, W / 2 - 110, 216
    d.rounded_rectangle([sx, sy, sx + sw, sy + 8], radius=4, fill=(255, 255, 255, 60))
    d.rounded_rectangle([sx, sy, sx + sw * 0.65, sy + 8], radius=4, fill=(255, 255, 255, 235))
    t = 16
    d.ellipse([sx + sw * 0.65 - t / 2, sy - 4, sx + sw * 0.65 + t / 2, sy + 12], fill=(255, 255, 255, 255))
    return img.convert('RGB')


def promo_marquee():
    W, H = 1400, 560
    img = grad(W, H, (139, 92, 246), (79, 70, 229), diag=True).convert('RGBA')
    d = ImageDraw.Draw(img)
    # soft right-side glow + dots
    d.ellipse([1050, -160, 1600, 420], fill=(255, 255, 255, 22))
    d.ellipse([-160, 380, 300, 800], fill=(40, 25, 110, 40))
    for cx, cy, r, col in ((180, 60, 5, (255, 255, 255, 70)), (210, 92, 3, (255, 255, 255, 50)),
                           (250, 48, 4, (255, 255, 255, 60)), (1350, 500, 6, (255, 255, 255, 50)),
                           (1290, 60, 4, (255, 255, 255, 55))):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

    # left block (within store safe zone: y 165..395)
    ic = 88
    img.alpha_composite(icon_img(ic), (110, 170))
    d.text((110, 292), 'Site Volume', font=F(52, bold=True, cn=False), fill=(255, 255, 255, 255), anchor='lm')
    d.text((110, 348), '按站点独立控制音量,互不干扰', font=F(23, cn=True), fill=(255, 255, 255, 240), anchor='lm')
    d.text((110, 382), '每个网站自己的音量', font=F(15, cn=True), fill=(255, 255, 255, 200), anchor='lm')

    # right: 4 mini site cards
    cards = [('y', 'youtube.com', 1.0, False), ('b', 'bilibili.com', 0.65, False),
             ('t', 'twitch.tv', 0.30, False), ('n', 'netflix.com', 0.0, True)]
    cw, ch, gap = 190, 210, 16
    total = 4 * cw + 3 * gap
    x0 = W - total - 96
    cy0 = (H - ch) / 2
    for i, (letter, name, vol, mut) in enumerate(cards):
        cx = x0 + i * (cw + gap)
        d.rounded_rectangle([cx, cy0, cx + cw, cy0 + ch], radius=18, fill=(255, 255, 255, 22),
                            outline=(255, 255, 255, 60))
        g = grad_rounded(44, 44, 13, (139, 92, 246), (79, 70, 229), diag=True)
        img.alpha_composite(g, (int(cx + 18), int(cy0 + 16)))
        dd = ImageDraw.Draw(img)
        dd.text((cx + 18 + 22, cy0 + 16 + 22), letter.upper(), font=F(21, bold=True, cn=True),
                fill=(255, 255, 255, 255), anchor='mm')
        dd.text((cx + 18 + 54, cy0 + 38), name, font=F(14.5, bold=True, cn=True),
                fill=(255, 255, 255, 255), anchor='lm')
        # mini slider
        sx = cx + 18
        sw = cw - 36
        sy = cy0 + 92
        dd.rounded_rectangle([sx, sy, sx + sw, sy + 8], radius=4, fill=(255, 255, 255, 50))
        dd.rounded_rectangle([sx, sy, sx + sw * vol, sy + 8], radius=4, fill=(255, 255, 255, 235))
        t = 18
        tx = sx + sw * vol
        dd.ellipse([tx - t / 2, sy - 5, tx + t / 2, sy + 13], fill=(255, 255, 255, 255))
        # pct
        if mut:
            dd.text((cx + cw / 2 - 34, cy0 + 140), '静音', font=F(26, bold=True, cn=True),
                    fill=(255, 140, 150, 255), anchor='mm')
            speaker_icon(dd, cx + cw / 2 + 26, cy0 + 140 - 11, 22, (255, 140, 150, 255), muted=True)
        else:
            dd.text((cx + cw / 2, cy0 + 140), str(round(vol * 100)) + '%', font=F(26, bold=True, cn=True),
                    fill=(255, 255, 255, 255), anchor='mm')
        # waves
        for j in range(5):
            bw = 5
            bh = (12 + 18 * abs(math.sin((j / 5) * math.pi))) * vol + 4
            if vol > 0:
                dd.rounded_rectangle([cx + 40 + j * 10, cy0 + ch - 46 - bh, cx + 40 + j * 10 + bw,
                                      cy0 + ch - 46], radius=2, fill=(255, 255, 255, 150))
    return img.convert('RGB')


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('screenshot-1-popup-light.png', screenshot_light_popup()),
        ('screenshot-2-options-light.png', screenshot_options()),
        ('screenshot-3-popup-dark.png', screenshot_dark_popup()),
        ('promo-small-440x280.png', promo_small()),
        ('promo-marquee-1400x560.png', promo_marquee()),
    ]
    for name, im in jobs:
        path = os.path.join(OUT, name)
        im.save(path, 'PNG')
        print('wrote', path, im.size, im.mode)


if __name__ == '__main__':
    main()
