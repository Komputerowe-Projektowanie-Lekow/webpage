# save as build_ascii.py
from PIL import Image
import glob, json, math, os

# Dark → light mapping; tweak to taste
PALETTE = " .:-=+*#%@"
# Non-square pixels in monospace fonts: adjust if characters look squashed
Y_SCALE = 1.0   # 2.0 means compress in height

def img_to_ascii(path):
    img = Image.open(path).convert("L")
    w, h = img.size
    # vertically downsample to compensate font aspect ratio
    new_h = max(1, int(h / Y_SCALE))
    img = img.resize((w, new_h), Image.BICUBIC)
    px = img.load()
    lines = []
    for y in range(img.height):
        row = []
        for x in range(img.width):
            v = px[x, y] / 255.0
            idx = int(v * (len(PALETTE) - 1) + 0.5)
            row.append(PALETTE[idx])
        lines.append("".join(row))
    return "\n".join(lines)

frames = sorted(glob.glob("frames/frame_*.png"))
ascii_frames = [img_to_ascii(p) for p in frames]

os.makedirs("web", exist_ok=True)
with open("web/frames.js", "w", encoding="utf-8") as f:
    # 20 fps must match the ffmpeg fps above
    f.write("export const FPS = 20;\n")
    f.write("export const FRAMES = ")
    json.dump(ascii_frames, f, ensure_ascii=False)
    f.write(";\n")
print(f"Wrote {len(ascii_frames)} frames to web/frames.js")
