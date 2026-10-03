"""Run: python test_protocols.py   (no serial port or extra package needed)"""
import random

from protocols import BY_KEY, PROTOCOLS, Reading, app_reads, identify, split_frames

random.seed(76)
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)


def samples(decimals, unit):
    out = [Reading(0.0, unit, True, decimals=decimals)]
    for _ in range(40):
        w = round(random.uniform(0, 30), decimals)
        out.append(Reading(w, unit, random.random() > 0.3, decimals=decimals))
    return out


# 1. round trip: encode -> split -> parse gives the same weight and stability
for p in PROTOCOLS:
    for r in samples(3, 'kg') + samples(2, 'kg'):
        frames = split_frames(p.encode(r))
        check(len(frames) == 1, f'{p.key}: frame split {frames!r}')
        got = p.parse(frames[0])
        check(got is not None, f'{p.key}: cannot parse own frame {frames[0]!r}')
        if got:
            check(abs(got.weight - r.weight) < 10 ** -r.decimals / 2, f'{p.key}: weight {r.weight} -> {got.weight}')
            check(got.stable == r.stable, f'{p.key}: stability lost for {frames[0]!r}')

# 2. identification: a stream from each maker is recognised as that maker
for p in PROTOCOLS:
    stream = b''.join(p.encode(r) for r in samples(3, 'kg'))
    best = identify(split_frames(stream))[0]
    check(best[0] == p.key and best[1] == 1.0, f'identify: {p.key} stream recognised as {best}')

# 3. a mixed or garbage stream is not recognised with confidence
junk = ['hello', '???', 'ERR 12', '']
check(identify(junk)[0][1] == 0.0, 'identify: junk scored above zero')

# 4. which formats the unchanged web app reads correctly (first number in the line = weight)
print('Protocol            round trip  identified  web app reads weight correctly')
for p in PROTOCOLS:
    rs = samples(3, 'kg')
    def good(r):
        got = app_reads(split_frames(p.encode(r))[0])
        return got is not None and abs(got - r.weight) < 0.0005
    ok = all(good(r) for r in rs)
    rt = not any(f.startswith(p.key + ':') for f in fails)
    idn = not any(f.startswith('identify: ' + p.key) for f in fails)
    print(f'{p.key:19} {"yes" if rt else "NO":11} {"yes" if idn else "NO":11} {"yes" if ok else "no (needs the parser in protocols.py)"}')

# 5. overload frames parse as overload
for key in ('mettler-sics', 'and', 'cas', 'toledo-continuous'):
    f = split_frames(BY_KEY[key].encode(Reading(99.0, 'kg', False, overload=True)))[0]
    got = BY_KEY[key].parse(f)
    check(got is not None and got.overload, f'{key}: overload frame not recognised')

print()
print('FAILED:\n  ' + '\n  '.join(fails[:20]) if fails else 'All checks passed.')
raise SystemExit(1 if fails else 0)
