"""Writes <name>.gltf.json (standard glTF JSON, buffer embedded as base64) next to every public/models/*.glb.

For hosts that serve JSON but not .glb files, such as a claude.ai artifact; the loader falls back to it on its own.
Run: python tools/glb_to_gltf_json.py [folder]
"""
import base64
import json
import struct
import sys
from pathlib import Path

folder = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'public/models')
for glb in sorted(folder.glob('*.glb')):
    b = glb.read_bytes()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    binc = b[28 + jl:28 + jl + bl]
    j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()
    out = glb.with_name(glb.stem + '.gltf.json')
    out.write_text(json.dumps(j, separators=(',', ':')))
    print(out, out.stat().st_size // 1024, 'KB')
