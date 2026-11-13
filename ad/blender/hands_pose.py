"""Second half of hands.py's build, kept apart while the pose is tuned: trim the arm, place and pose the hand."""
import bmesh


def trim(mesh, keep_x=-0.36):
    """Only the right forearm and hand: the rest (the left arm, the shoulders, the upper arm) goes."""
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    mw = mesh.matrix_world
    gone = [v for v in bm.verts if (mw @ v.co).x > keep_x]
    bmesh.ops.delete(bm, geom=gone, context="VERTS")
    bm.to_mesh(mesh.data)
    bm.free()


def frame(a, b, c):
    """An orthonormal frame from a direction a and a second direction b (c says which way the third points)."""
    f = a.normalized()
    l = (b - f * b.dot(f)).normalized()
    n = f.cross(l)
    return Matrix((f, l, n)).transposed()


def rest_hand(rig):
    mw = rig.matrix_world
    h = lambda n: mw @ rig.data.bones[n].head_local
    wrist = h("RightHand")
    f = h("RightHandMiddle1") - wrist
    l = h("RightHandIndex1") - h("RightHandPinky1")
    return wrist, frame(f, l, None), h


def place(rig, up_deg=35.0, anchor="RightHandIndex1", at_u=(340, 520), depth=0.011, scale=0.92, tilt_deg=0.0, pitch_deg=0.0):
    """Turns, scales and moves the whole rig so the hand points up and to the left at `up_deg`, its palm toward the
    camera behind the phone, the index side up and to the right (the thumb on the phone's right). The `anchor` joint
    lands at `at_u` in phone units, `depth` metres behind the phone's back. `tilt_deg` turns the palm a little about
    the fingers' direction (positive: the little-finger side further back). Starts from the rig as it was loaded."""
    top = rig.parent or rig
    if "rest" not in top:
        top["rest"] = [v for row in top.matrix_world for v in row]
    m = top["rest"]
    top.matrix_world = Matrix([m[0:4], m[4:8], m[8:12], m[12:16]])
    bpy.context.view_layer.update()
    wrist, R0, h = rest_hand(rig)
    a = math.radians(up_deg)
    f1 = Vector((-math.cos(a), 0, math.sin(a)))
    l1 = Vector((math.sin(a), 0, math.cos(a)))
    # pitch_deg tips the fingers back about the knuckle line (positive: the fingertips further from the camera)
    R1 = Matrix.Rotation(math.radians(pitch_deg), 3, l1) @ Matrix.Rotation(math.radians(tilt_deg), 3, f1) @ frame(f1, l1, None)
    R = (R1 @ R0.transposed()).to_4x4()
    p = h(anchor)
    target = unit_to_world(*at_u) + Vector((0, PD / 2 + depth, 0))
    M = Matrix.Translation(target) @ R @ Matrix.Diagonal((scale, scale, scale, 1)) @ Matrix.Translation(-p)
    top.matrix_world = M @ top.matrix_world
    bpy.context.view_layer.update()


def phone_dist(p):
    """Signed distance from a point to the phone's body (negative inside), its corners rounded."""
    r = 60 * K
    qx = abs(p.x) - (PW / 2 - r)
    qz = abs(p.z) - (PH / 2 - r)
    d2 = math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - r
    dy = abs(p.y) - PD / 2
    return math.hypot(max(d2, 0), max(dy, 0)) + min(max(d2, dy), 0)


def chain_points(rig, finger):
    mw = rig.matrix_world
    return [mw @ rig.pose.bones[f"RightHand{finger}{j}"].head for j in (1, 2, 3, 4)]


def fk(pts, across, normal, spread, bends):
    """The finger's joints after spreading it `spread` degrees at the knuckle and bending its three joints by
    `bends` degrees (knuckle, middle joint, end joint). Pure maths: nothing in Blender changes."""
    pts = [p.copy() for p in pts]
    R = Matrix.Rotation(math.radians(spread), 3, normal)
    pts = [pts[0]] + [pts[0] + R @ (p - pts[0]) for p in pts[1:]]
    for j in range(3):
        along = (pts[j + 1] - pts[j]).normalized()
        axis = (across - along * across.dot(along)).normalized()
        Rj = Matrix.Rotation(math.radians(bends[j]), 3, axis)
        pts = pts[: j + 1] + [pts[j] + Rj @ (p - pts[j]) for p in pts[j + 1:]]
    return pts


def finger_frame(rig, finger):
    mw = rig.matrix_world
    pts0 = chain_points(rig, finger)
    across = (mw @ rig.pose.bones["RightHandIndex1"].head) - (mw @ rig.pose.bones["RightHandPinky1"].head)
    normal = across.normalized().cross((pts0[1] - pts0[0]).normalized())
    return pts0, across, normal


def solve_finger(rig, finger, tip_target, radius=0.0085, z_weight=0.35, hug=1.0):
    """Finds the spread and bends that bring the fingertip to `tip_target` without the finger entering the phone.
    The end joint follows the middle one (about two thirds of it), as a real finger's does."""
    pts0, across, normal = finger_frame(rig, finger)
    best = None
    for s in range(-14, 15, 2):
        for b1 in range(-20, 101, 5):
            for b2 in range(0, 111, 5):
                b3 = b2 * 0.66
                pts = fk(pts0, across, normal, s, (b1, b2, b3))
                pen = 0.0
                for a, b in zip(pts, pts[1:]):
                    for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0):
                        d = phone_dist(a.lerp(b, t)) - radius
                        if d < 0:
                            pen += -d
                d = pts[-1] - tip_target
                out = sum(max(0.0, -PW / 2 - radius * 1.3 - p.x) for p in pts[1:])
                cost = math.sqrt(d.x ** 2 + d.y ** 2 + (z_weight * d.z) ** 2) + 6.0 * pen + 0.00004 * (abs(s) + abs(b1)) + hug * out
                if best is None or cost < best[0]:
                    best = (cost, s, (b1, b2, b3), pen)
    return {"finger": finger, "cost": round(best[0], 4), "spread": best[1], "bends": best[2], "pen": round(best[3], 4)}


def apply_finger(rig, finger, spread, bends):
    """Poses the finger as fk() computed it."""
    pts0, across, normal = finger_frame(rig, finger)
    turn(rig, f"RightHand{finger}1", normal, spread)
    for j in range(3):
        pts = chain_points(rig, finger)
        along = (pts[j + 1] - pts[j]).normalized()
        axis = (across - along * across.dot(along)).normalized()
        turn(rig, f"RightHand{finger}{j + 1}", axis, bends[j])


def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()


def turn(rig, bone, axis, deg):
    """Rotates a pose bone by `deg` about a world axis through its head (children follow)."""
    pb = rig.pose.bones[bone]
    bpy.context.view_layer.update()
    mw = rig.matrix_world
    head = mw @ pb.head
    Rw = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis).normalized()) @ Matrix.Translation(-head)
    pb.matrix = mw.inverted() @ Rw @ mw @ pb.matrix
    bpy.context.view_layer.update()


FINGERS = ("Index", "Middle", "Ring", "Pinky")


def curl(rig, finger, degs):
    """Bends a finger's three joints by `degs`, each about the axis across the hand at that joint, toward the palm."""
    for j, d in zip((1, 2, 3), degs):
        b = f"RightHand{finger}{j}"
        bpy.context.view_layer.update()
        mw = rig.matrix_world
        pb, nxt = rig.pose.bones[b], rig.pose.bones[f"RightHand{finger}{j + 1}"]
        along = (mw @ nxt.head) - (mw @ pb.head)
        # across the hand: the line through the index and little-finger knuckles, as posed now
        across = (mw @ rig.pose.bones["RightHandIndex1"].head) - (mw @ rig.pose.bones["RightHandPinky1"].head)
        axis = along.cross(across)
        turn(rig, b, axis, d)


def solve_thumb(rig, tip_target, radius=0.0095):
    """The thumb comes round in front of the phone, its tip resting on the screen's right edge: the base joint turns
    two ways, the two joints beyond it bend. Returns the angles; apply_thumb() poses them."""
    mw = rig.matrix_world
    pts0 = [mw @ rig.pose.bones[f"RightHandThumb{j}"].head for j in (1, 2, 3, 4)]
    f_pts = chain_points(rig, "Middle")
    fdir = (f_pts[1] - f_pts[0]).normalized()
    across = (mw @ rig.pose.bones["RightHandIndex1"].head) - (mw @ rig.pose.bones["RightHandPinky1"].head)
    normal = across.normalized().cross(fdir)
    best = None
    for a in range(-50, 51, 5):
        for b in range(-50, 51, 5):
            R = Matrix.Rotation(math.radians(a), 3, normal) @ Matrix.Rotation(math.radians(b), 3, fdir)
            base = [pts0[0]] + [pts0[0] + R @ (p - pts0[0]) for p in pts0[1:]]
            for c in range(-20, 61, 5):
                pts = base
                for j, d in ((1, c), (2, c * 1.3)):
                    along = (pts[j + 1] - pts[j]).normalized()
                    ax = along.cross(normal).normalized()
                    Rj = Matrix.Rotation(math.radians(d), 3, ax)
                    pts = pts[: j + 1] + [pts[j] + Rj @ (p - pts[j]) for p in pts[j + 1:]]
                pen = 0.0
                for p, q in zip(pts, pts[1:]):
                    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
                        dd = phone_dist(p.lerp(q, t)) - radius
                        if dd < 0:
                            pen += -dd
                cost = (pts[-1] - tip_target).length + 6.0 * pen
                if best is None or cost < best[0]:
                    best = (cost, a, b, c, pen)
    return {"cost": round(best[0], 4), "a": best[1], "b": best[2], "c": best[3], "pen": round(best[4], 4)}


def apply_thumb(rig, a, b, c):
    mw = rig.matrix_world
    f_pts = chain_points(rig, "Middle")
    fdir = (f_pts[1] - f_pts[0]).normalized()
    across = (mw @ rig.pose.bones["RightHandIndex1"].head) - (mw @ rig.pose.bones["RightHandPinky1"].head)
    normal = across.normalized().cross(fdir)
    # one turn about the combined axis, as solve_thumb() composed it (b first, then a)
    turn(rig, "RightHandThumb1", fdir, b)
    turn(rig, "RightHandThumb1", normal, a)
    for j, d in ((2, c), (3, c * 1.3)):
        pts = [rig.matrix_world @ rig.pose.bones[f"RightHandThumb{k}"].head for k in (1, 2, 3, 4)]
        along = (pts[j] - pts[j - 1]).normalized()
        turn(rig, f"RightHandThumb{j}", along.cross(normal).normalized(), d)


def solve_thumb2(rig, tip_target, radius=0.0095, step=10, lim=90, c_weight=0.0001):
    """A wider thumb search: the base joint turned about the three world axes, the two joints beyond it bent about
    the axis the thumb's own flexion uses (found from its rest curl)."""
    mw = rig.matrix_world
    pts0 = [mw @ rig.pose.bones[f"RightHandThumb{j}"].head for j in (1, 2, 3, 4)]
    # the thumb's flexion axis: normal to the plane its rest joints lie in
    flex = (pts0[2] - pts0[1]).cross(pts0[3] - pts0[2]).normalized()
    best = None
    rng = range(-lim, lim + 1, step)
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    for ax in rng:
        Rx = Matrix.Rotation(math.radians(ax), 3, X)
        for ay in rng:
            Rxy = Matrix.Rotation(math.radians(ay), 3, Y) @ Rx
            for az in rng:
                R = Matrix.Rotation(math.radians(az), 3, Z) @ Rxy
                base = [pts0[0]] + [pts0[0] + R @ (p - pts0[0]) for p in pts0[1:]]
                fl = R @ flex
                for c in (-40, -25, -10, 0, 15, 30, 45, 60, 75, 90):
                    pts = base
                    for j, d in ((1, c), (2, c * 1.2)):
                        Rj = Matrix.Rotation(math.radians(d), 3, fl)
                        pts = pts[: j + 1] + [pts[j] + Rj @ (p - pts[j]) for p in pts[j + 1:]]
                    cost = (pts[-1] - tip_target).length
                    if best is not None and cost > best[0]:
                        continue
                    pen = 0.0
                    for p, q in zip(pts, pts[1:]):
                        for t in (0.0, 0.33, 0.66, 1.0):
                            dd = phone_dist(p.lerp(q, t)) - radius
                            if dd < 0:
                                pen += -dd
                    cost += 6.0 * pen + 0.00003 * (abs(ax) + abs(ay) + abs(az)) + c_weight * abs(c)
                    if best is None or cost < best[0]:
                        best = (cost, ax, ay, az, c, pen)
    return {"cost": round(best[0], 4), "ax": best[1], "ay": best[2], "az": best[3], "c": best[4], "pen": round(best[5], 4)}


def apply_thumb2(rig, ax, ay, az, c):
    mw = rig.matrix_world
    pts0 = [mw @ rig.pose.bones[f"RightHandThumb{j}"].head for j in (1, 2, 3, 4)]
    flex = (pts0[2] - pts0[1]).cross(pts0[3] - pts0[2]).normalized()
    turn(rig, "RightHandThumb1", (1, 0, 0), ax)
    turn(rig, "RightHandThumb1", (0, 1, 0), ay)
    turn(rig, "RightHandThumb1", (0, 0, 1), az)
    R = Matrix.Rotation(math.radians(az), 3, "Z") @ Matrix.Rotation(math.radians(ay), 3, "Y") @ Matrix.Rotation(math.radians(ax), 3, "X")
    fl = R @ flex
    turn(rig, "RightHandThumb2", fl, c)
    turn(rig, "RightHandThumb3", fl, c * 1.2)


RADIUS = {"Index": 0.0085, "Middle": 0.0088, "Ring": 0.0082, "Pinky": 0.0072}


def penetration(mesh):
    """How much of the skin is inside the phone: the count of vertices inside and the deepest, in metres."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    mw = mesh.matrix_world
    n, deep = 0, 0.0
    for v in me.vertices:
        d = phone_dist(mw @ v.co)
        if d < 0:
            n += 1
            deep = max(deep, -d)
    ev.to_mesh_clear()
    return n, deep


def grip(rig, up=50, at=(0, 430), pitch=0, depth=0.012, tilt=0, heights=(420, 510, 600, 690), thumb=(380, 520), tr=0.0095):
    """The whole pose: place the hand, wrap each finger round the left edge, bring the thumb to the screen."""
    reset_pose(rig)
    place(rig, up_deg=up, at_u=at, pitch_deg=pitch, depth=depth, tilt_deg=tilt)
    out = {}
    for f, uy in zip(("Index", "Middle", "Ring", "Pinky"), heights):
        t = unit_to_world(16, uy) + Vector((0, -PD / 2 - RADIUS[f] - 0.0005, 0))
        r = solve_finger(rig, f, t, radius=RADIUS[f])
        apply_finger(rig, f, r["spread"], r["bends"])
        tip = chain_points(rig, f)[-1]
        out[f] = [round(tip.x / K + 200), round(-tip.z / K + 416.5), round(r["cost"], 4)]
    tt = unit_to_world(*thumb) + Vector((0, -PD / 2 - tr - 0.0005, 0))
    r = solve_thumb2(rig, tt, radius=tr, step=15)
    apply_thumb2(rig, r["ax"], r["ay"], r["az"], r["c"])
    tip = rig.matrix_world @ rig.pose.bones["RightHandThumb4"].head
    out["Thumb"] = [round(tip.x / K + 200), round(-tip.z / K + 416.5), round(r["cost"], 4)]
    w = rig.matrix_world @ rig.pose.bones["RightHand"].head
    out["wrist"] = [round(w.x / K + 200), round(-w.z / K + 416.5), round(w.y, 3)]
    return out


def bend_wrist(rig, axis, deg):
    """Turns the forearm about the wrist by `deg` degrees about a world axis, the hand staying where it is: the
    whole rig turns about the wrist, then the hand bone turns back by the same amount."""
    top = rig.parent or rig
    w = rig.matrix_world @ rig.pose.bones["RightHand"].head
    R = Matrix.Translation(w) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis).normalized()) @ Matrix.Translation(-w)
    top.matrix_world = R @ top.matrix_world
    bpy.context.view_layer.update()
    turn(rig, "RightHand", axis, -deg)


def aim_chain(rig, bones, targets):
    """Points a chain of joints at target positions in turn: each bone turns (the least it can) so the next joint
    lies on the line to its target, the bone lengths kept. `bones` are the joints from the base, `targets` the
    positions wanted for bones[1:] plus one past the last (the tip)."""
    for j in range(len(bones) - 1):
        mw = rig.matrix_world
        a = mw @ rig.pose.bones[bones[j]].head
        b = mw @ rig.pose.bones[bones[j + 1]].head
        want = targets[j] - a
        q = (b - a).rotation_difference(want)
        axis, ang = q.to_axis_angle()
        if abs(ang) > 1e-5:
            turn(rig, bones[j], axis, math.degrees(ang))


def thumb_to(rig, path_u, depths):
    """The thumb along a path: its middle joints and tip aimed at points given in phone units, each at a depth in
    millimetres in front of (negative) or behind the phone's middle plane."""
    pts = [unit_to_world(x, y) + Vector((0, d / 1000, 0)) for (x, y), d in zip(path_u, depths)]
    aim_chain(rig, ["RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumb4"], pts)
