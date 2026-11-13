"""A real hand round the ad's phone, rendered in Blender as see-through layers that replace the drawn hand.

Runs inside Blender (the Blender MCP connector, or `blender -b -P ad/blender/hands.py`). It needs the free FPS Arms
Pack (no credit required, commercial use allowed, not to be resold) unpacked in ad/out/blender/arms; the pack stays
out of git.

The phone sits at real size, its screen toward an orthographic camera that frames exactly the drawn hand's box in the
phone's own units (ad/art.js `hand`: x -300..700, y -120..1780, the phone 400 x 833). So a render lines up with the
DOM phone in ad.js wherever and however it is placed. The phone itself is a shadow catcher: it never shows, but the
fingers' shadows on it do.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else r"C:\Users\david\Downloads\Claude\soma\ad"
PACK = os.path.join(ROOT, "out", "blender", "arms")
OUT = os.path.join(ROOT, "out", "blender")

K = 0.0715 / 400  # metres per phone unit: the phone is 71.5 mm wide
PW, PH, PD = 400 * K, 833 * K, 0.0078
BOX = (-300, -120, 1000, 1900)  # the hand's box in phone units: x, y, width, height


def unit_to_world(ux, uy):
    """A point in phone units (origin at the phone's top left, y down) on the phone's plane, in metres."""
    return Vector(((ux - 200) * K, 0.0, -(uy - 416.5) * K))


def clear():
    bpy.ops.wm.read_homefile(use_empty=True)


def phone():
    """The phone's body: a rounded slab, corners 60 units, made a shadow catcher."""
    r, n = 60 * K, 16
    pts = []
    for cx, cz, a0 in ((PW / 2 - r, PH / 2 - r, 0), (-PW / 2 + r, PH / 2 - r, 90), (-PW / 2 + r, -PH / 2 + r, 180), (PW / 2 - r, -PH / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), -PD / 2, cz + r * math.sin(a)))
    me = bpy.data.meshes.new("Phone")
    me.from_pydata(pts, [], [list(range(len(pts)))])
    o = bpy.data.objects.new("Phone", me)
    bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new("depth", "SOLIDIFY")
    sol.thickness = PD
    sol.offset = -1.0  # from the screen (y = -PD/2) back to y = +PD/2
    rim = o.modifiers.new("rim", "BEVEL")
    rim.width = 0.0016
    rim.segments = 6
    rim.limit_method = "ANGLE"
    o.is_shadow_catcher = True
    return o


def camera():
    x, y, w, h = BOX
    c = unit_to_world(x + w / 2, y + h / 2)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = h * K
    cam_data.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (c.x, -1.0, c.z)
    cam.rotation_euler = (math.radians(90), 0, 0)
    cam_data.clip_start, cam_data.clip_end = 0.5, 1.6
    s = bpy.context.scene
    s.camera = cam
    s.render.resolution_x, s.render.resolution_y = w * 2, h * 2
    s.render.film_transparent = True
    return cam


def arms():
    p = os.path.join(PACK, "Fps_Arms", "No_Sleeve", "FpsArmsHigh.blend")
    with bpy.data.libraries.load(p, link=False) as (src, dst):
        dst.objects = ["FpsArms", "FpsArms.3", "Reference"]
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
    return bpy.data.objects["Reference"], bpy.data.objects["FpsArms.3"]


def skin(mesh):
    """Skin as Cycles sees it: the pack's photographed colour and normal maps, light scattering under the surface
    (red travelling furthest, as in real skin), a soft sheen, and the low mesh smoothed."""
    tex = os.path.join(PACK, "Arms_Texture")
    m = bpy.data.materials.new("Skin")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = bpy.data.images.load(os.path.join(tex, "ArmsTexD.jpg"), check_existing=True)
    nrm = nt.nodes.new("ShaderNodeTexImage")
    nrm.image = bpy.data.images.load(os.path.join(tex, "ArmsTexN.jpg"), check_existing=True)
    nrm.image.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 1.3
    # tone: hue, saturation and value of the photographed skin, so one map serves several skin tones
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.name = "Tone"
    # pores: a fine noise on the surface, too small to see as a pattern, enough to break the highlight
    tc = nt.nodes.new("ShaderNodeTexCoord")
    pores = nt.nodes.new("ShaderNodeTexNoise")
    pores.inputs["Scale"].default_value = 2600.0
    pores.inputs["Detail"].default_value = 4.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.0002
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.38
    rough.inputs["To Max"].default_value = 0.55
    L = nt.links
    L.new(col.outputs["Color"], hsv.inputs["Color"])
    L.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])
    L.new(nrm.outputs["Color"], nmap.inputs["Color"])
    L.new(tc.outputs["Object"], pores.inputs["Vector"])
    L.new(pores.outputs["Fac"], bump.inputs["Height"])
    L.new(nmap.outputs["Normal"], bump.inputs["Normal"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    L.new(pores.outputs["Fac"], rough.inputs["Value"])
    L.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Subsurface Weight"].default_value = 1.0
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.18)
    bsdf.inputs["Subsurface Scale"].default_value = 0.0018
    bsdf.subsurface_method = "RANDOM_WALK_SKIN"
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    bsdf.inputs["Sheen Weight"].default_value = 0.08
    mesh.data.materials.clear()
    mesh.data.materials.append(m)
    if not any(md.type == "SUBSURF" for md in mesh.modifiers):
        sub = mesh.modifiers.new("smooth", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 2
    for p in mesh.data.polygons:
        p.use_smooth = True
    return m


def lights(screen_rgb=(0.56, 0.54, 0.97)):
    """Evening light: a warm, soft key from the upper left, a cool fill, a lilac rim from behind on the right, and
    the screen's own glow falling on the fingers and thumb in front of it."""
    aim = Vector((0.0, 0.0, -0.03))  # the middle of the hand

    def area(name, loc, size, energy, rgb):
        d = bpy.data.lights.new(name, "AREA")
        d.shape, d.size, d.energy, d.color = "DISK", size, energy, rgb
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (aim - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return o
    area("Key", (-0.35, -0.45, 0.35), 0.5, 9.0, (1.0, 0.82, 0.66))
    area("Fill", (0.45, -0.5, -0.05), 0.6, 2.2, (0.72, 0.8, 1.0))
    area("Rim", (0.35, 0.4, 0.2), 0.25, 14.0, (0.75, 0.7, 1.0))
    d = bpy.data.lights.new("Screen", "AREA")
    d.shape, d.size, d.size_y, d.energy, d.color = "RECTANGLE", PW * 0.9, PH * 0.9, 0.35, screen_rgb
    o = bpy.data.objects.new("Screen", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0, -PD / 2 - 0.0005, 0)
    o.rotation_euler = (math.radians(90), 0, 0)  # facing the camera, -Y
    w = bpy.data.worlds.new("Night")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.018, 0.03, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = w


def cycles(samples=192, pct=50):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    s.cycles.device = "GPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.denoiser = "OPENIMAGEDENOISE"
    s.render.film_transparent = True
    s.render.resolution_percentage = pct
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "None"
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"


def contact(mesh, phone_obj):
    """Where the skin meets the phone it gives, as real skin does: anything inside the phone is pushed out to its
    surface (a shrinkwrap that only acts on what is inside), after the smoothing so the contact is exact."""
    for md in list(mesh.modifiers):
        if md.type == "SHRINKWRAP":
            mesh.modifiers.remove(md)
    sw = mesh.modifiers.new("contact", "SHRINKWRAP")
    sw.target = phone_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "OUTSIDE"
    sw.offset = 0.0003
    return sw
