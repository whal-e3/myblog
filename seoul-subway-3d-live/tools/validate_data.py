#!/usr/bin/env python3
"""Validate complete source coverage, geographic values, and graph references."""
from pathlib import Path
import json
import math

root = Path(__file__).resolve().parent.parent
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
data = read(root / 'data/network.json')
source = read(root / 'data/upstream-network.json')
stations = {s['id']: s for s in data['stations']}
assert len(stations) == len(data['stations']), 'Duplicate station ids'
assert set(stations) == {s['i'] for s in source['stations']}, 'Station source coverage changed'
assert len(data['segments']) == len(source['segments']), 'Missing source segments'
assert {l['id'] for l in data['lines']} == {l['id'] for l in source['lines']}, 'Missing lines'
assert data['meta']['snapshot'] == source['generated'], 'Snapshot date mismatch'
for s in stations.values():
    assert s['lines'], f"Orphan station: {s['id']}"
    assert -90 <= s['lat'] <= 90 and -180 <= s['lon'] <= 180
    assert all(math.isfinite(s[k]) for k in ('lat','lon','x','z'))
for e in data['segments']:
    assert e['a'] in stations and e['b'] in stations, f"Invalid endpoints: {e['id']}"
    assert e['line'] in stations[e['a']]['lines'] and e['line'] in stations[e['b']]['lines']
    assert len(e['points']) >= 2, f"Degenerate segment: {e['id']}"
    assert all(len(p) == 2 and all(math.isfinite(v) for v in p) for p in e['points'])
    assert e['points'][0] == [stations[e['a']]['x'], stations[e['a']]['z']]
    assert e['points'][-1] == [stations[e['b']]['x'], stations[e['b']]['z']]
for i,line in enumerate(data['lines']):
    assert line['stations'] == sum(i in s['lines'] for s in stations.values())
    assert line['segments'] == sum(e['line'] == i for e in data['segments'])
assert len(data['surface']['waterTriangles']) % 3 == 0
print(f"PASS: {len(data['lines'])} lines; {len(stations)} station records; {len(data['segments'])} segments.")
print(f"Snapshot: {data['meta']['snapshot']}. Missing-path connectors: {sum(e['approximate'] for e in data['segments'])}.")
