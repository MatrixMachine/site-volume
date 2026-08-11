# Generate Site Volume extension icons: gradient rounded-square + speaker + sound waves.
import math
from PIL import Image, ImageDraw

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# violet -> indigo diagonal gradient
C_TOP = (139, 92, 246)    # #8B5CF6
C_BOT = (79, 70, 229)     # #4F46E5
WHITE = (255, 255, 255)

SS = 4  # supersample factor

def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def make_icon(out_size):
    S = out_size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # gradient background
    grad = Image.new('RGBA', (S, S))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        for x in range(0, S, SS):  # coarse diagonal gradient
            t = (x + y) / (2 * S)
            gd.rectangle([x, y, x + SS - 1, y], fill=lerp(C_TOP, C_BOT, t) + (255,))
    radius = int(S * 0.22)
    mask = rounded_mask(S, radius)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # subtle inner highlight (top sheen)
    sheen = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.rounded_rectangle([0, 0, S - 1, int(S * 0.5)], radius=radius, fill=(255, 255, 255, 26))
    img.alpha_composite(sheen)
    d = ImageDraw.Draw(img)

    u = S / 128.0  # design units based on 128px grid

    # speaker body (white, rounded): base box + flared cone, centered slightly left
    # base rectangle
    d.rounded_rectangle(
        [24 * u, 46 * u, 44 * u, 82 * u],
        radius=7 * u, fill=WHITE + (255,))
    # cone (trapezoid) flaring right
    d.polygon([
        (44 * u, 48 * u), (70 * u, 30 * u), (70 * u, 98 * u), (44 * u, 80 * u)
    ], fill=WHITE + (255,))
    # round the cone tip edge
    d.rounded_rectangle([66 * u, 30 * u, 72 * u, 98 * u], radius=3 * u, fill=WHITE + (255,))

    # sound waves: two arcs to the right of the cone
    wave_color = WHITE + (255,)
    wave_cx, wave_cy = 70 * u, 64 * u
    for r, w in ((17, 7), (29, 7)):
        bbox = [wave_cx - r * u, wave_cy - r * u,
                wave_cx + r * u, wave_cy + r * u]
        d.arc(bbox, start=-55, end=55, fill=wave_color, width=max(1, int(w * u)))

    # downscale with antialiasing
    img = img.resize((out_size, out_size), Image.LANCZOS)
    return img

if __name__ == '__main__':
    import os
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'icons')
    for size in (16, 48, 128):
        icon = make_icon(size)
        path = os.path.join(out_dir, f'icon{size}.png')
        icon.save(path)
        print('wrote', path)
