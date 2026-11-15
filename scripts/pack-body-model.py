"""Pack the ripped body glTF into a lean, geometry-only GLB.

Fixes applied:
- Organ meshes are Z-up inside Y-up parent nodes (the rip lost a -90 deg X rotation): restore it.
- Each mesh carries a duplicated primitive: keep the first one only.
- Material assignments are broken: rebuild one PBR material per organ from the texture file names
  (albedo, DirectX normal flipped to OpenGL, roughness/metallic packed into G/B, eye opacity as alpha).
  Textures are downscaled to max_side (default 1024).
- Only accessors/bufferViews still referenced are written.
"""
import base64
import io
import json
import math
import struct
import sys
from pathlib import Path

from PIL import Image, ImageOps

src = Path(sys.argv[1])
out = Path(sys.argv[2])
max_side = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
g = json.loads(src.read_text(encoding="utf-8"))
base = src.parent

raw_buffers = [base64.b64decode(b["uri"].split(",", 1)[1]) for b in g["buffers"]]

# Organ name per mesh: the parent node's name (e.g. "Brain" holds the node that holds mesh "0").
parent_of = {}
for i, n in enumerate(g["nodes"]):
    for c in n.get("children", []):
        parent_of[c] = i
mesh_organ = {}
for i, n in enumerate(g["nodes"]):
    if "mesh" in n:
        p = parent_of.get(i)
        mesh_organ[n["mesh"]] = g["nodes"][p]["name"] if p is not None else n.get("name", f"mesh{i}")

# Restore the lost rotation on organ parents (the ones scaled 100x).
s = math.sqrt(0.5)
for n in g["nodes"]:
    if n.get("scale") == [100.0, 100.0, 100.0]:
        n["rotation"] = [-s, 0.0, 0.0, s]

# Rebuild the original material of each organ from the texture file names (the rip mis-assigned them).
TEX_KEY = {
    "Brain": "Brain", "Diafragma": "Diafragma", "Eye": "eye", "Gallbladder": "Galbladder_Mat",
    "Hands": "Hands", "Heart": "Heart", "HumanLungs": "lungs_LP", "Legs": "Legs", "Liver": "Liver_Mat",
    "Pelvis": "Pelvis", "Ribcage": "Ribcage", "Skull": "Skull", "Spine": "Spine",
    "Urinary_System": "Urinary_System", "DigestiveSystem": "DigestiveSystem",
    "ArteriasMesh": "CirculatorySystem", "VenasMesh": "CirculatorySystem",
}
files = {}
for f in base.iterdir():
    if f.suffix.lower() in (".jpeg", ".jpg", ".png") and "_" in f.name:
        files[f.name.split("_", 1)[1].lower()] = f


def find(prefix, key, kinds):
    for kind in kinds:
        for ext in (".jpeg", ".png"):
            f = files.get(f"{prefix}_{key}_{kind}{ext}".lower())
            if f:
                return f
    return None


def encode(im):
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    if im.mode == "RGBA":
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), "image/png"
    im.convert("RGB").save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue(), "image/jpeg"


images, textures, materials, cache = [], [], [], {}


def texture(key, build):
    if key not in cache:
        data, mime = build()
        images.append({"_data": data, "mimeType": mime})
        textures.append({"source": len(images) - 1, "sampler": 0})
        cache[key] = len(textures) - 1
    return cache[key]


def material_for(organ):
    key = TEX_KEY.get(organ)
    mat = {"name": organ, "doubleSided": True, "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 1.0}}
    if not key:
        return mat
    pbr = mat["pbrMetallicRoughness"]
    albedo = find("RGB", key, ["Albedo", "AlbedoTransparency"])
    opacity = find("R", key, ["Opacity"])
    if albedo:
        def build_albedo():
            im = Image.open(albedo).convert("RGB")
            if opacity:
                a = Image.open(opacity).convert("L").resize(im.size)
                im = im.convert("RGBA")
                im.putalpha(a)
            return encode(im)
        pbr["baseColorTexture"] = {"index": texture(("albedo", key), build_albedo)}
        if opacity:
            mat["alphaMode"] = "BLEND"
    normal = find("N", key, ["Normal_DirectX", "normal", "Normal"])
    if normal:
        def build_normal():
            r, gch, b = Image.open(normal).convert("RGB").split()
            # DirectX -> OpenGL (glTF) normal map: flip green, unless the file is already OpenGL.
            if "directx" in normal.name.lower():
                gch = ImageOps.invert(gch)
            return encode(Image.merge("RGB", (r, gch, b)))
        mat["normalTexture"] = {"index": texture(("normal", key), build_normal)}
    rough = find("R", key, ["Roughness"])
    metal = find("R", key, ["Metallic"])
    if rough or metal:
        def build_mr():
            ref = Image.open(rough or metal)
            size = ref.size
            ro = Image.open(rough).convert("L").resize(size) if rough else Image.new("L", size, 255)
            me = Image.open(metal).convert("L").resize(size) if metal else Image.new("L", size, 0)
            return encode(Image.merge("RGB", (Image.new("L", size, 0), ro, me)))
        pbr["metallicRoughnessTexture"] = {"index": texture(("mr", key), build_mr)}
        pbr["metallicFactor"] = 1.0 if metal else 0.0
    return mat


for mi, mesh in enumerate(g["meshes"]):
    prim = mesh["primitives"][0]
    name = mesh_organ.get(mi, f"mesh{mi}")
    materials.append(material_for(name))
    prim["material"] = len(materials) - 1
    mesh["primitives"] = [prim]
    mesh["name"] = name

# Keep only the physiological loops (heartbeat, breathing, peristalsis, pulse). The single slow 0->1->0
# morph on these organs is an "exploded view" that throws them out of the body.
EXPLODE = {"Brain", "Eye", "Gallbladder", "Liver", "Urinary_System"}
for anim in g.get("animations", []):
    keep = []
    for ch in anim["channels"]:
        node = g["nodes"][ch["target"]["node"]]
        organ = mesh_organ.get(node["mesh"]) if "mesh" in node else None
        if ch["target"]["path"] == "weights" and organ in EXPLODE:
            continue
        keep.append(ch)
    used_samplers = sorted({ch["sampler"] for ch in keep})
    remap_s = {old: new for new, old in enumerate(used_samplers)}
    anim["samplers"] = [anim["samplers"][i] for i in used_samplers]
    for ch in keep:
        ch["sampler"] = remap_s[ch["sampler"]]
    anim["channels"] = keep
# Exploded-view morphs rest at weight 0: drop their targets entirely.
for mi, mesh in enumerate(g["meshes"]):
    if mesh_organ.get(mi) in EXPLODE:
        mesh["primitives"][0].pop("targets", None)
        mesh.pop("weights", None)
        mesh.pop("extras", None)

# Collect referenced accessors.
used = []
def use(a):
    if a not in used:
        used.append(a)
for mesh in g["meshes"]:
    for p in mesh["primitives"]:
        for a in p["attributes"].values():
            use(a)
        if "indices" in p:
            use(p["indices"])
        for t in p.get("targets", []):
            for a in t.values():
                use(a)
for anim in g.get("animations", []):
    for smp in anim["samplers"]:
        use(smp["input"])
        use(smp["output"])

remap = {old: new for new, old in enumerate(used)}
blob = bytearray()
new_views = []
new_accessors = []
for old in used:
    acc = dict(g["accessors"][old])
    bv = g["bufferViews"][acc["bufferView"]]
    data = raw_buffers[bv["buffer"]][bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
    while len(blob) % 4:
        blob.append(0)
    view = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)}
    if "byteStride" in bv:
        view["byteStride"] = bv["byteStride"]
    if "target" in bv:
        view["target"] = bv["target"]
    blob.extend(data)
    new_views.append(view)
    acc["bufferView"] = len(new_views) - 1
    new_accessors.append(acc)

def rm(a):
    return remap[a]
for mesh in g["meshes"]:
    for p in mesh["primitives"]:
        p["attributes"] = {k: rm(v) for k, v in p["attributes"].items()}
        if "indices" in p:
            p["indices"] = rm(p["indices"])
        if "targets" in p:
            p["targets"] = [{k: rm(v) for k, v in t.items()} for t in p["targets"]]
for anim in g.get("animations", []):
    for smp in anim["samplers"]:
        smp["input"] = rm(smp["input"])
        smp["output"] = rm(smp["output"])

for img in images:
    data = img.pop("_data")
    while len(blob) % 4:
        blob.append(0)
    new_views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)})
    blob.extend(data)
    img["bufferView"] = len(new_views) - 1

g["accessors"] = new_accessors
g["bufferViews"] = new_views
g["materials"] = materials
g["images"] = images
g["textures"] = textures
g["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
while len(blob) % 4:
    blob.append(0)
g["buffers"] = [{"byteLength": len(blob)}]
g["asset"] = {"version": "2.0", "generator": "astravexi pack_glb"}

js = json.dumps(g, separators=(",", ":")).encode("utf-8")
js += b" " * ((4 - len(js) % 4) % 4)
total = 12 + 8 + len(js) + 8 + len(blob)
with out.open("wb") as f:
    f.write(struct.pack("<4sII", b"glTF", 2, total))
    f.write(struct.pack("<I4s", len(js), b"JSON"))
    f.write(js)
    f.write(struct.pack("<I4s", len(blob), b"BIN\x00"))
    f.write(blob)
print(f"wrote {out} {total / 1e6:.1f} MB; meshes:", [m["name"] for m in g["meshes"]])
