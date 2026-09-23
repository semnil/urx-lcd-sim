#!/usr/bin/env python3
"""Record which part of each screen capture the user guide's pages show.

The guide clips some of its screen captures, and pdfimages (scripts/extract-ug-screens.mjs) extracts
every image whole, so those files carry pixels no page shows. This walks the PDF's drawing commands,
intersects each capture with the clip in force when it is drawn, and writes reference/ug-lcd/visible.json:
for each capture name, the shown rectangle in the capture's own pixels and the shown share of its area.

    python3 scripts/ug-visible-ranges.py --pdf <path to the user guide PDF>

Requires pypdf and cryptography (the guide PDF is AES-encrypted). The output is derived from Yamaha's
guide, so it stays under the gitignored reference/.
"""
import argparse
import json
import os
import sys

from pypdf import PdfReader
from pypdf.generic import ContentStream

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NARROW = {(480, 272), (480, 281), (480, 289)}
WIDE = {(685, 281), (685, 289), (685, 297), (686, 281), (686, 289), (686, 297)}
# The guide also crops part of a screen where it calls one control out. A crop is
# no larger than the screen and no smaller than this, which leaves out the glyphs
# and marks the guide sets in its own text.
CROP_MIN = 88


def is_crop(size):
    w, h = size
    return size not in NARROW and size not in WIDE and CROP_MIN <= w <= 480 and CROP_MIN <= h <= 272


def mul(m, n):
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F)


def point(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def box(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def intersect(a, b):
    if a is None:
        return b
    if b is None:
        return a
    r = [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]
    return r if r[0] < r[2] and r[1] < r[3] else [0, 0, 0, 0]


def area(r):
    return max(0, r[2] - r[0]) * max(0, r[3] - r[1]) if r else 0


def walk(reader, content, resources, ctm, clip, images):
    """Append every image drawn, with its page box and the clip in force, in drawing order."""
    stack, path, pending_clip = [], [], False
    xobjects = resources.get("/XObject", {}) if resources else {}
    xobjects = xobjects.get_object() if hasattr(xobjects, "get_object") else xobjects
    for operands, op in ContentStream(content, reader).operations:
        if op == b"q":
            stack.append((ctm, clip))
        elif op == b"Q":
            if stack:
                ctm, clip = stack.pop()
        elif op == b"cm":
            ctm = mul(tuple(float(v) for v in operands), ctm)
        elif op == b"re":
            x, y, w, h = (float(v) for v in operands)
            path += [point(ctm, x, y), point(ctm, x + w, y), point(ctm, x, y + h), point(ctm, x + w, y + h)]
        elif op in (b"m", b"l"):
            path.append(point(ctm, float(operands[0]), float(operands[1])))
        elif op == b"c":
            path += [point(ctm, float(operands[i]), float(operands[i + 1])) for i in (0, 2, 4)]
        elif op in (b"v", b"y"):
            path += [point(ctm, float(operands[i]), float(operands[i + 1])) for i in (0, 2)]
        elif op in (b"W", b"W*"):
            pending_clip = True
        elif op in (b"n", b"f", b"F", b"f*", b"S", b"s", b"B", b"B*", b"b", b"b*"):
            # A clip is taken as the bounding box of its path.
            if path and pending_clip:
                clip = intersect(clip, box(path))
            path, pending_clip = [], False
        elif op == b"Do":
            name = operands[0]
            x = xobjects[name].get_object() if name in xobjects else None
            if x is None:
                continue
            subtype = x.get("/Subtype")
            if subtype == "/Image":
                ref = getattr(x, "indirect_reference", None)
                images.append(dict(obj=ref.idnum if ref else None, w=int(x["/Width"]), h=int(x["/Height"]),
                                   bbox=box([point(ctm, 0, 0), point(ctm, 1, 0), point(ctm, 0, 1), point(ctm, 1, 1)]), clip=clip))
            elif subtype == "/Form":
                fctm = mul(tuple(float(v) for v in x.get("/Matrix", [1, 0, 0, 1, 0, 0])), ctm)
                fb = [float(v) for v in x["/BBox"]]
                fclip = intersect(clip, box([point(fctm, fb[0], fb[1]), point(fctm, fb[2], fb[1]), point(fctm, fb[0], fb[3]), point(fctm, fb[2], fb[3])]))
                walk(reader, x, x.get("/Resources", resources), fctm, fclip, images)


def shown_rect(image):
    """The shown part of an image in its own pixels, origin at the top-left."""
    bb, vis = image["bbox"], intersect(image["bbox"], image["clip"])
    if not area(vis):
        return None, 0.0
    w, h = image["w"], image["h"]
    px = [round((vis[0] - bb[0]) / (bb[2] - bb[0]) * w, 1), round((bb[3] - vis[3]) / (bb[3] - bb[1]) * h, 1),
          round((vis[2] - bb[0]) / (bb[2] - bb[0]) * w, 1), round((bb[3] - vis[1]) / (bb[3] - bb[1]) * h, 1)]
    return px, round(area(vis) / area(bb), 4)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--pdf", required=True, help="path to the user guide PDF")
    parser.add_argument("--out", default=os.path.join(ROOT, "reference", "ug-lcd", "visible.json"))
    args = parser.parse_args()

    reader = PdfReader(args.pdf)
    result, counts = {}, {}
    for page_no, page in enumerate(reader.pages, start=1):
        contents = page.get_contents()
        if contents is None:
            continue
        resources = page.get("/Resources")
        resources = resources.get_object() if resources is not None else {}
        images = []
        walk(reader, contents, resources, (1, 0, 0, 1, 0, 0), [float(v) for v in page.mediabox], images)
        # Named the way scripts/extract-ug-screens.mjs names the files: numbered
        # per page, per directory, with a page's whole screens numbered before
        # any crop on it.
        whole = [i for i in images if (i["w"], i["h"]) in NARROW or (i["w"], i["h"]) in WIDE]
        crops = [i for i in images if is_crop((i["w"], i["h"]))]
        for image in whole + crops:
            size = (image["w"], image["h"])
            wide = size in WIDE
            counts[(page_no, wide)] = counts.get((page_no, wide), 0) + 1
            name = ("wide/" if wide else "") + f"p{page_no:03d}-{counts[(page_no, wide)]}"
            px, share = shown_rect(image)
            result[name] = dict(visible_px=px, share=share, obj=image["obj"])

    if not result:
        sys.exit("no screen captures found")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(result, f, indent=1)
    partial = sum(1 for v in result.values() if v["share"] < 0.999)
    print(f"{len(result)} captures, {partial} shown only in part -> {args.out}")


if __name__ == "__main__":
    main()
