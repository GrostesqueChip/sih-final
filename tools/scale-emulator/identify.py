"""Listen to a serial port (or read a captured file) and name the indicator protocol in use.

    python identify.py --port COM8            # listens for 3 seconds
    python identify.py --file capture.txt
"""
import argparse
import sys
import time

from protocols import BY_KEY, identify, split_frames

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--port')
ap.add_argument('--file')
ap.add_argument('--baud', type=int, default=9600)
ap.add_argument('--seconds', type=float, default=3.0)
a = ap.parse_args()

if a.file:
    data = open(a.file, 'rb').read()
elif a.port:
    try:
        import serial
    except ImportError:
        sys.exit('pyserial is not installed. Run:  python -m pip install pyserial')
    with serial.Serial(a.port, a.baud, timeout=0.2) as s:
        data, end = b'', time.time() + a.seconds
        while time.time() < end:
            data += s.read(256)
else:
    ap.error('give --port or --file')

frames = split_frames(data)
if not frames:
    sys.exit('No frames received. Check the port, the baud rate and that the indicator is in continuous-output mode.')
ranked = identify(frames)
best, share = ranked[0]
print(f'{len(frames)} frames read. Example: {frames[-1]!r}')
if share < 0.8:
    print(f'No confident match (best: {best}, {share:.0%} of frames). Unknown format: use manual entry or CSV, or add a parser.')
else:
    p = BY_KEY[best]
    r = p.parse(frames[-1])
    print(f'Detected: {p.maker} ({p.key}), {share:.0%} of frames parse.  Signature: {p.signature}')
    print(f'Last reading: {r.weight} {r.unit}  {"stable" if r.stable else "in motion"}{"  OVERLOAD" if r.overload else ""}')
