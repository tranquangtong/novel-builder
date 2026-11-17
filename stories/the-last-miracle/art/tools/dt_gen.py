#!/usr/bin/env python3
"""Minimal Draw Things HTTP client: tools/dt_gen.py <payload.json> <out_prefix>  (needs Draw Things API Server on, HTTP :7860)"""
import base64, json, sys, time, urllib.request

API = "http://127.0.0.1:7860/sdapi/v1/txt2img"
payload = json.load(open(sys.argv[1]))
payload.setdefault("controls", [])
payload.setdefault("loras", [])
t = time.time()
req = urllib.request.Request(API, json.dumps(payload).encode(), {"Content-Type": "application/json"})
data = json.load(urllib.request.urlopen(req, timeout=900))
for i, b in enumerate(data.get("images") or []):
    path = f"{sys.argv[2]}_{i}.png"
    open(path, "wb").write(base64.b64decode(b))
    print("saved", path, f"{time.time() - t:.0f}s")
