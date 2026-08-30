"""Erzeugt die App-Icons (PNG) ohne externe Abhaengigkeiten.
Motiv: zwei uebereinanderliegende Vokabelkarten auf gruenem Verlauf.
Gleiche Palette wie der Stundenplan, anderes Motiv."""
import math, struct, zlib, os

BG1 = (168, 199, 143)   # helles Pastellgruen
BG2 = (92, 122, 74)     # tiefes Salbeigruen
BACK = (219, 228, 203)  # hintere Karte, gedaempft
FRONT = (248, 245, 236) # vordere Karte, Creme
LINE = (188, 208, 165)  # Textzeilen auf der Karte

HW, HH, RAD = 0.205, 0.265, 0.05     # halbe Breite/Hoehe, Eckenradius
GAP = 0.024                          # gruener Spalt um die vordere Karte

BACK_C, BACK_A = (0.055, -0.030), math.radians(15)
FRONT_C, FRONT_A = (-0.050, 0.035), math.radians(-8)


def lerp(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def local(nx, ny, center, angle):
    """Punkt in das gedrehte Koordinatensystem der Karte bringen."""
    dx, dy = nx - center[0], ny - center[1]
    ca, sa = math.cos(-angle), math.sin(-angle)
    return dx * ca - dy * sa, dx * sa + dy * ca


def rrect(rx, ry, hw=HW, hh=HH, r=RAD):
    """Vorzeichenbehafteter Abstand zu einem abgerundeten Rechteck."""
    qx, qy = abs(rx) - (hw - r), abs(ry) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sample(nx, ny):
    fx, fy = local(nx, ny, FRONT_C, FRONT_A)
    df = rrect(fx, fy)

    if df < 0:                                  # auf der vorderen Karte
        for row in (-0.105, -0.035, 0.035):     # drei Textzeilen
            if abs(fy - row) < 0.017 and abs(fx) < 0.125:
                return LINE
        return FRONT

    if df < GAP:                                # Spalt: Hintergrund durchscheinen
        return lerp(BG1, BG2, max(0.0, min(1.0, (nx + ny + 1.0) / 2.0)))

    bx, by = local(nx, ny, BACK_C, BACK_A)
    if rrect(bx, by) < 0:                       # hintere Karte
        return BACK

    return lerp(BG1, BG2, max(0.0, min(1.0, (nx + ny + 1.0) / 2.0)))


def render(size, ss=3):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    nx = (px + (sx + 0.5) / ss) / size - 0.5
                    ny = (py + (sy + 0.5) / ss) / size - 0.5
                    c = sample(nx, ny)
                    r += c[0]; g += c[1]; b += c[2]
            n = ss * ss
            row += bytes((round(r / n), round(g / n), round(b / n)))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b"".join(b"\x00" + r for r in render(size))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"  {path}  ({size}x{size}, {len(png)} B)")


here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(os.path.dirname(here), "icons")
os.makedirs(out, exist_ok=True)
for name, size in [("icon-512.png", 512), ("icon-192.png", 192),
                   ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
    write_png(os.path.join(out, name), size)
