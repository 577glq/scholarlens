"""Generate ScholarLens extension icons without external assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Deep pine rounded tile.
pad = 42
radius = 224
for y in range(SIZE):
    for_x = y / SIZE
    # Horizontal gradient, painted one row at a time.
    top = (31, 75, 69)
    bottom = (15, 42, 39)
    color = tuple(int(top[i] * (1 - for_x) + bottom[i] * for_x) for i in range(3)) + (255,)
    draw.line([(0, y), (SIZE, y)], fill=color)

mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    (pad, pad, SIZE - pad, SIZE - pad), radius=radius, fill=255
)
img.putalpha(mask)

draw = ImageDraw.Draw(img)
font_path = r"C:\Windows\Fonts\georgiab.ttf"
font = ImageFont.truetype(font_path, 600)
text = "S"
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
x = (SIZE - tw) / 2 - bbox[0]
y = (SIZE - th) / 2 - bbox[1] - 42

# Subtle shadow for the letter.
draw.text((x + 8, y + 12), text, font=font, fill=(6, 25, 23, 110))
draw.text((x, y), text, font=font, fill=(247, 241, 225, 255))

# Orange "selection" underline.
draw.rounded_rectangle((252, 760, 772, 814), radius=27, fill=(224, 138, 67, 255))
# Small lens glint / formula dot.
draw.ellipse((736, 250, 806, 320), fill=(224, 138, 67, 255))

for target in (128, 48, 32, 16):
    icon = img.resize((target, target), Image.Resampling.LANCZOS)
    icon.save(OUT / f"icon{target}.png", optimize=True)

print(f"Wrote icons to {OUT}")
