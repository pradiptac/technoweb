"""Crop and thumbnail behaviour through the HTTP API, on a real upload."""
import json, zlib, uuid, io
from struct import pack
from urllib import request, error

API = "http://127.0.0.1:8000/api/v1"
passed = failed = 0


def chk(label, got, want):
    global passed, failed
    if got == want:
        print("PASS  " + label + f"  ({got!r})")
        passed += 1
    else:
        print(f"FAIL  {label} — got {got!r}, want {want!r}")
        failed += 1


def call(method, path, token=None, body=None, raw=None, ctype=None, binary=False):
    req = request.Request(API + path, method=method)
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    elif raw is not None:
        data = raw
        req.add_header("Content-Type", ctype)
    try:
        with request.urlopen(req, data) as r:
            payload = r.read()
            return r.status, (payload if binary else (json.loads(payload) if payload else {}))
    except error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, payload


def circle_png(w, h, d):
    """A white image with a red circle of diameter d, centred."""
    cx, cy, r = w / 2, h / 2, d / 2
    rows = []
    for y in range(h):
        row = bytearray(b"\x00")
        for x in range(w):
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
            row += bytes((220, 30, 30) if inside else (255, 255, 255))
        rows.append(bytes(row))

    def chunk(tag, dd):
        c = tag + dd
        return pack(">I", len(dd)) + c + pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 6))
            + chunk(b"IEND", b""))


def multipart(filename, blob):
    b = "----probe" + uuid.uuid4().hex
    out = io.BytesIO()
    out.write(f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n".encode())
    out.write(b"Content-Type: image/png\r\n\r\n" + blob + b"\r\n")
    out.write(f"--{b}--\r\n".encode())
    return out.getvalue(), "multipart/form-data; boundary=" + b


def red_extent(png_bytes):
    """Measure the red region by decoding the PNG with GD via a temp file."""
    import subprocess, tempfile, os
    fd, path = tempfile.mkstemp(suffix=".png")
    os.write(fd, png_bytes)
    os.close(fd)
    php = r"C:/laragon/bin/php/php-8.3.30-Win32-vs16-x64/php.exe"
    code = (
        '$im=imagecreatefrompng($argv[1]);$w=imagesx($im);$h=imagesy($im);'
        '$minX=$w;$maxX=-1;$minY=$h;$maxY=-1;'
        'for($y=0;$y<$h;$y++){for($x=0;$x<$w;$x++){$c=imagecolorat($im,$x,$y);'
        '$r=($c>>16)&255;$g=($c>>8)&255;$b=$c&255;'
        'if($r>150&&$g<100&&$b<100){$minX=min($minX,$x);$maxX=max($maxX,$x);'
        '$minY=min($minY,$y);$maxY=max($maxY,$y);}}}'
        'echo ($maxX-$minX+1),",",($maxY-$minY+1);'
    )
    out = subprocess.run([php, "-r", code, path], capture_output=True, text=True).stdout
    os.unlink(path)
    w, h = (int(v) for v in out.split(","))
    return w, h


_, tok = call("POST", "/admin/auth/login",
              body={"email": "audit-bot@technoware.invalid", "password": "AuditBot!2026#tmp"})
token = tok["token"]

print("--- upload an 800x400 image with a round 300px circle ---")
body, ctype = multipart("circle.png", circle_png(800, 400, 300))
st, up = call("POST", "/admin/media", token, raw=body, ctype=ctype)
mid = up["data"]["id"]
chk("uploaded", f'{up["data"]["width"]}x{up["data"]["height"]}', "800x400")

print("\n--- thumbnails must crop, not squash ---")
_, res = call("POST", f"/admin/media/{mid}/resize", token,
              {"width": 800, "height": 400, "thumbnails": [90, 180]})
for t in sorted(res["thumbnails"], key=lambda x: x["width"]):
    _, blob = call("GET", f'/admin/media/{t["id"]}/download', token, binary=True)
    w, h = red_extent(blob)
    ratio = round(w / h, 2)
    chk(f'the {t["width"]}x{t["height"]} thumbnail keeps the circle round', ratio, 1.0)

print("\n--- crop ---")
# the circle occupies x 250..550, y 50..350 in the source
_, cropped = call("POST", f"/admin/media/{mid}/crop", token,
                  {"x": 250, "y": 50, "width": 300, "height": 300})
chk("crop returns the region asked for",
    f'{cropped["data"]["width"]}x{cropped["data"]["height"]}', "300x300")
_, blob = call("GET", f"/admin/media/{mid}/download", token, binary=True)
w, h = red_extent(blob)
chk("the cropped circle is still round", round(w / h, 2), 1.0)
chk("and fills the crop", w >= 295, True)

print("\n--- crop with an output size ---")
_, scaled = call("POST", f"/admin/media/{mid}/crop", token,
                 {"x": 0, "y": 0, "width": 300, "height": 300, "out_width": 120, "out_height": 120})
chk("crop scales its output", f'{scaled["data"]["width"]}x{scaled["data"]["height"]}', "120x120")

print("\n--- an SVG cannot be cropped ---")
_, all_media = call("GET", "/admin/media?per_page=100", token)
svg = next((m for m in all_media["data"] if str(m.get("mime", "")).endswith("svg+xml")), None)
if svg:
    st, msg = call("POST", f'/admin/media/{svg["id"]}/crop', token,
                   {"x": 0, "y": 0, "width": 10, "height": 10})
    chk("cropping an SVG is refused", st, 422)
    chk("...and says why", "SVG" in msg.get("message", ""), True)

print("\n--- clean up ---")
ids = [mid] + [t["id"] for t in res["thumbnails"]]
for i in ids:
    call("DELETE", f"/admin/media/{i}", token)
_, after = call("GET", "/admin/media?per_page=100", token)
chk("library back to its seeded size", after["meta"]["total"], 33)

print(f"\n{passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
