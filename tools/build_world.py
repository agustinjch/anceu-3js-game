#!/usr/bin/env python3
"""Genera los datos del mundo de Anceu a partir de datos reales.

Fuentes (descargadas a GEO_DIR):
  - IGN MDT05 (terreno 5 m), reproyectado a EPSG:25829
  - IGN PNOA ortofoto 0.5 m
  - Catastro INSPIRE building parts (huellas + nº plantas)
  - OpenStreetMap (caminos, río)

Salida en public/world/:
  height.bin   Float32 (N x N), alturas relativas al coliving, filas de norte a sur
  ortho.jpg    ortofoto recortada al área del mundo
  world.json   metadatos, edificios, caminos, árboles, arroyo

Coordenadas del juego: origen en el coliving, x = este, z = sur, y = altura (m).
Uso: python3 tools/build_world.py <GEO_DIR>
"""
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from osgeo import gdal, osr
from PIL import Image

gdal.UseExceptions()

GEO = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / "public" / "world"
OUT.mkdir(parents=True, exist_ok=True)

E0, N0 = 543935.0, 4688911.0  # Anceu Coliving (Os Ramís)
HALF = 500.0  # mundo de 1 km x 1 km
CELL = 5.0
N = int(2 * HALF / CELL) + 1  # 201
WEST, NORTH = E0 - HALF, N0 + HALF

src = osr.SpatialReference()
src.ImportFromEPSG(4326)
src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
dst = osr.SpatialReference()
dst.ImportFromEPSG(25829)
to_utm = osr.CoordinateTransformation(src, dst)


def lonlat_to_local(lon, lat):
    e, n, _ = to_utm.TransformPoint(lon, lat)
    return e - E0, -(n - N0)


# --- Terreno -----------------------------------------------------------------
ds = gdal.Open(str(GEO / "terrain" / "mdt05_anceu_25829_5m.tif"))
gt = ds.GetGeoTransform()
dem = ds.ReadAsArray().astype(np.float64)
c0 = int(round((WEST - gt[0]) / gt[1]))
r0 = int(round((gt[3] - NORTH) / -gt[5]))
z = dem[r0 : r0 + N, c0 : c0 + N].copy()
assert z.shape == (N, N), z.shape
BASE = float(dem[int((gt[3] - N0) / -gt[5]), int((E0 - gt[0]) / gt[1])])
WATER = float(z.min()) + 0.4  # lámina del encoro (zonas planas a 238 m)

# El MDT viene en metros enteros: suavizado ligero para quitar escalones
k = np.array([1, 4, 6, 4, 1], float)
k /= k.sum()
for axis in (0, 1):
    z = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 2, mode="edge"), k, "valid"), axis, z)

h = (z - BASE).astype(np.float32)


def height_at(x, zz):
    """Altura bilineal en coordenadas locales."""
    fx = (x + HALF) / CELL
    fz = (zz + HALF) / CELL
    i = min(max(int(fx), 0), N - 2)
    j = min(max(int(fz), 0), N - 2)
    tx, tz = fx - i, fz - j
    a = h[j, i] * (1 - tx) + h[j, i + 1] * tx
    b = h[j + 1, i] * (1 - tx) + h[j + 1, i + 1] * tx
    return float(a * (1 - tz) + b * tz)


# --- Arroyo (acumulación de flujo D8) --------------------------------------
acc = np.ones_like(z)
flow_to = {}
order = np.argsort(-z, axis=None)
for idx in order:
    r, c = divmod(int(idx), N)
    best, bz = None, z[r, c]
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            rr, cc = r + dr, c + dc
            if 0 <= rr < N and 0 <= cc < N and z[rr, cc] < bz - 1e-6:
                bz, best = z[rr, cc], (rr, cc)
    if best:
        acc[best] += acc[r, c]
        flow_to[(r, c)] = best

# Arroyo principal al este del coliving: seguimos el flujo desde la celda de
# mayor acumulación en la zona NE hasta el encoro.
best_start, best_acc = None, 0
for r in range(40, 90):
    for c in range(115, 160):
        if 150 < acc[r, c] and acc[r, c] > best_acc and z[r, c] > WATER + 15:
            best_acc, best_start = acc[r, c], (r, c)
stream = []
cur = best_start
# retrocedemos aguas arriba unas celdas para tener tramo largo
for _ in range(25):
    ups = [(rr, cc) for (rr, cc), d in flow_to.items() if d == cur and acc[rr, cc] > 40]
    if not ups:
        break
    cur = max(ups, key=lambda p: acc[p])
while cur and z[cur] > WATER + 0.2:
    r, c = cur
    stream.append([round(c * CELL - HALF, 1), round(r * CELL - HALF, 1)])
    cur = flow_to.get(cur)
if cur:
    stream.append([round(cur[1] * CELL - HALF, 1), round(cur[0] * CELL - HALF, 1)])

# Talamos un cauce suave en el terreno
for sx, sz in stream:
    for j in range(N):
        for i in range(N):
            d = math.hypot(i * CELL - HALF - sx, j * CELL - HALF - sz)
            if d < 7:
                h[j, i] -= 0.8 * (1 - d / 7)

h.tofile(OUT / "height.bin")

# --- Terreno lejano (4 km a 20 m) para el horizonte -------------------------
FAR_N = 201
far_full = dem[:800, :800]
far = far_full.reshape(200, 4, 200, 4).mean(axis=(1, 3))
far = np.pad(far, ((0, 1), (0, 1)), mode="edge")
(far - BASE).astype(np.float32).tofile(OUT / "far.bin")
far_center = (gt[0] + 400 * gt[1] - E0, -((gt[3] + 400 * gt[5]) - N0))
Image.open(GEO / "ortho" / "pnoa_far_4km.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS).save(
    OUT / "far.jpg", quality=80
)

# --- Ortofoto ----------------------------------------------------------------
jgw = [float(v) for v in (GEO / "ortho" / "pnoa_anceu_25829_0.5m.jgw").read_text().split()]
ortho = Image.open(GEO / "ortho" / "pnoa_anceu_25829_0.5m.jpg").convert("RGB")
ox0, oy0, ores = jgw[4] - jgw[0] / 2, jgw[5] + jgw[0] / 2, jgw[0]
px = lambda e: (e - ox0) / ores
py = lambda n: (oy0 - n) / ores
box = (px(WEST), py(NORTH), px(WEST + 2 * HALF), py(NORTH - 2 * HALF))
crop = Image.new("RGB", (int(2 * HALF / ores), int(2 * HALF / ores)), (40, 60, 35))
src_box = tuple(int(round(v)) for v in box)
crop.paste(ortho.crop(src_box), (0, 0))
ortho_img = crop.resize((2048, 2048), Image.LANCZOS)
ortho_img.save(OUT / "ortho.jpg", quality=85)
ortho_np = np.asarray(crop.resize((1000, 1000), Image.BILINEAR)).astype(np.float32) / 255  # 1 px = 1 m

# --- Edificios (Catastro) ----------------------------------------------------
parts = json.load(open(GEO / "catastro" / "anceu_buildingparts.geojson"))
buildings = []
for f in parts["features"]:
    geom = f["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    floors = f["properties"].get("numberOfFloorsAboveGround") or 0
    for poly in polys:
        ring = [lonlat_to_local(lon, lat) for lon, lat in poly[0]]
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        xs = [p[0] for p in ring]
        zs = [p[1] for p in ring]
        if max(abs(min(xs)), abs(max(xs)), abs(min(zs)), abs(max(zs))) > HALF - 5:
            continue
        area = 0.5 * abs(sum(xs[i] * zs[i - 1] - xs[i - 1] * zs[i] for i in range(len(ring))))
        if area < 6:
            continue
        ground = min(height_at(x, zz) for x, zz in ring)
        buildings.append(
            {
                "id": f["properties"]["localId"],
                "floors": int(floors),
                "ground": round(ground, 2),
                "ring": [[round(x, 2), round(zz, 2)] for x, zz in ring],
            }
        )

# --- Caminos (OSM) -----------------------------------------------------------
osm = json.load(open(GEO / "osm_anceu.json"))
nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm["elements"] if e["type"] == "node" and "lon" in e}
roads = []
for e in osm["elements"]:
    if e["type"] != "way" or "highway" not in e.get("tags", {}):
        continue
    if "geometry" in e:
        pts = [(g["lon"], g["lat"]) for g in e["geometry"]]
    else:
        pts = [nodes[n] for n in e.get("nodes", []) if n in nodes]
    loc = [lonlat_to_local(lon, lat) for lon, lat in pts]
    loc = [p for p in loc if abs(p[0]) < HALF and abs(p[1]) < HALF]
    if len(loc) < 2:
        continue
    hw = e["tags"]["highway"]
    width = {"tertiary": 5.5, "unclassified": 4.0, "service": 3.0, "track": 3.0}.get(hw, 1.6)
    roads.append(
        {"type": hw, "name": e["tags"].get("name"), "width": width, "pts": [[round(x, 1), round(zz, 1)] for x, zz in loc]}
    )


def dist_seg(px_, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    t = max(0, min(1, ((px_ - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz + 1e-9)))
    return math.hypot(px_ - ax - t * dx, pz - az - t * dz)


def near_road(x, zz, pad):
    for r in roads:
        p = r["pts"]
        for a, b in zip(p, p[1:]):
            if dist_seg(x, zz, a[0], a[1], b[0], b[1]) < r["width"] / 2 + pad:
                return True
    return False


bboxes = []
for b in buildings:
    xs = [p[0] for p in b["ring"]]
    zs = [p[1] for p in b["ring"]]
    bboxes.append((min(xs), min(zs), max(xs), max(zs)))


def near_building(x, zz, pad):
    return any(a - pad < x < c + pad and b - pad < zz < d + pad for a, b, c, d in bboxes)


# --- Árboles a partir de la ortofoto ----------------------------------------
# Píxel "bosque": verde oscuro. Densidad por celda de 4 m.
rng = random.Random(7)
trees = []
lum = ortho_np.mean(axis=2)
green = ortho_np[:, :, 1] - (ortho_np[:, :, 0] + ortho_np[:, :, 2]) / 2
forest = (lum < 0.30) & (green > -0.01)
STEP = 4
for gz in range(0, 1000, STEP):
    for gx in range(0, 1000, STEP):
        frac = forest[gz : gz + STEP, gx : gx + STEP].mean()
        if frac < 0.45 or rng.random() > frac * 0.55:
            continue
        x = gx - HALF + rng.uniform(0, STEP)
        zz = gz - HALF + rng.uniform(0, STEP)
        y = height_at(x, zz)
        if y + BASE < WATER + 1.0 or near_building(x, zz, 3) or near_road(x, zz, 1.5):
            continue
        if any(math.hypot(x - sx, zz - sz) < 3 for sx, sz in stream):
            continue
        # carballo / castiñeiro / piñeiro (más pinos en las zonas altas)
        alt = y + BASE
        kind = "pine" if (alt > 320 and rng.random() < 0.6) else ("chestnut" if rng.random() < 0.35 else "oak")
        trees.append([round(x, 1), round(zz, 1), round(rng.uniform(0.8, 1.25), 2), kind])

world = {
    "source": "IGN MDT05 + PNOA (CC BY 4.0 scne.es), Catastro (D.G. del Catastro), © OpenStreetMap contributors",
    "origin_utm": [E0, N0],
    "base_altitude": BASE,
    "half": HALF,
    "cell": CELL,
    "n": N,
    "water_level": round(WATER - BASE, 2),
    "far": {"n": FAR_N, "size": 4000.0, "center": [round(far_center[0], 1), round(far_center[1], 1)]},
    "buildings": buildings,
    "roads": roads,
    "stream": stream,
    "trees": trees,
}
(OUT / "world.json").write_text(json.dumps(world, separators=(",", ":")))
print(
    f"terreno {N}x{N}, base {BASE:.1f} m, agua {WATER - BASE:.1f}, edificios {len(buildings)}, "
    f"caminos {len(roads)}, árboles {len(trees)}, arroyo {len(stream)} puntos"
)
