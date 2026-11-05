"""Build extract.ts input lists. python3 lists.py synth DIR OUT.json | real OUT.json [names...]"""
import json, glob, os, sys
mode = sys.argv[1]
if mode == 'synth':
    d, out = sys.argv[2], sys.argv[3]
    items = []
    for j in sorted(glob.glob(os.path.join(d, '*.json'))):
        m = json.load(open(j))
        items.append(dict(rgb=j[:-5] + '.rgb', w=m['w'], h=m['h'], holes=[h[:2] for h in m['holes']], ring=m['ring'], tag=m['kind']))
    json.dump(items, open(out, 'w'))
elif mode == 'real':
    out = sys.argv[2]
    names = sys.argv[3:]
    T = json.load(open('/tmp/real/truth.json'))
    items = []
    for n, t in T.items():
        if names and n not in names:
            continue
        items.append(dict(rgb=f'/tmp/real/{n}.rgb', w=t['w'], h=t['h'], holes=[x[:2] for x in t['truth']], tag=n))
    json.dump(items, open(out, 'w'))
elif mode == 'range':
    out = sys.argv[2]
    items = [dict(rgb='/tmp/range/range1.rgb', w=502, h=394, holes=[[202, 195]], tag='range1')]
    json.dump(items, open(out, 'w'))
print('items', len(items))
