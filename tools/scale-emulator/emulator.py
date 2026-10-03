"""Weighing-indicator emulator: behaves like a scale's serial output on a COM port.

    python emulator.py --port COM7 --brand mettler-sics
    python emulator.py --dry --brand cas            # no port: print the frames
    python emulator.py --port COM7 --auto           # runs an R 76 weighing sequence by itself

The web app (Chrome / Edge, Web Serial) opens the other end of the port at 9600 8N1 and reads the stream
exactly as it would from a real indicator. Keys while it runs:
    0-5  place 0 / 20 / 40 / 60 / 80 / 100 % of Max        + -  add or remove one scale interval
    z    zero        f  toggle a faulty load cell           b  switch to the next brand        q  quit
"""
from __future__ import annotations

import argparse
import math
import random
import sys
import time

from protocols import BY_KEY, PROTOCOLS, Reading

try:
    import msvcrt  # Windows keyboard
except ImportError:  # pragma: no cover
    msvcrt = None


class LoadCell:
    """A load receptor that settles on its target with a damped swing and a little noise."""

    def __init__(self, max_cap: float, e: float):
        self.max, self.e = max_cap, e
        self.target = 0.0
        self.value = 0.0
        self.zero = 0.0
        self.faulty = False
        self._t0 = time.time()
        self._from = 0.0
        self._still = 0

    def place(self, load: float):
        self._from, self.target, self._t0, self._still = self.value, max(0.0, load), time.time(), 0

    def step(self) -> tuple[float, bool, bool]:
        t = time.time() - self._t0
        swing = math.exp(-3.2 * t) * math.cos(9 * t)          # settles in about 1.5 s
        true = self.target + (self._from - self.target) * swing
        if self.faulty:                                         # non-linear error that grows with load
            true += 4 * self.e * (true / self.max) ** 2
        noise = random.gauss(0, self.e * (0.9 if t < 1.2 else 0.08))
        self.value = true + noise
        shown = round((self.value - self.zero) / self.e) * self.e
        moving = abs(self.value - self.target - (4 * self.e * (self.target / self.max) ** 2 if self.faulty else 0)) > self.e * 0.6
        self._still = 0 if moving else self._still + 1
        return shown, self._still >= 3, shown > self.max + 9 * self.e


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', help='serial port to act as the scale, e.g. COM7 (one end of a virtual pair) or loop://')
    ap.add_argument('--brand', default='mettler-sics', choices=list(BY_KEY))
    ap.add_argument('--max', type=float, default=30.0, help='Max capacity (default 30)')
    ap.add_argument('--e', type=float, default=0.005, help='verification scale interval e (default 0.005)')
    ap.add_argument('--unit', default='kg')
    ap.add_argument('--baud', type=int, default=9600)
    ap.add_argument('--hz', type=float, default=5.0, help='frames per second')
    ap.add_argument('--auto', action='store_true', help='run the R 76 weighing sequence: 0-20-40-60-80-100 % up, then down')
    ap.add_argument('--dry', action='store_true', help='no serial port, print frames only')
    ap.add_argument('--seconds', type=float, default=0, help='stop after this many seconds (0 = run until q)')
    a = ap.parse_args()

    ser = None
    if not a.dry:
        if not a.port:
            ap.error('give --port COMx, or use --dry')
        try:
            import serial
        except ImportError:
            sys.exit('pyserial is not installed. Run:  python -m pip install pyserial')
        ser = serial.serial_for_url(a.port, baudrate=a.baud, bytesize=8, parity='N', stopbits=1, timeout=0, write_timeout=0.5)

    decimals = max(0, -int(math.floor(math.log10(a.e)))) if a.e < 1 else 0
    cell = LoadCell(a.max, a.e)
    brand = BY_KEY[a.brand]
    steps = [0, .2, .4, .6, .8, 1, .8, .6, .4, .2, 0]
    step_i, step_at, started = 0, time.time(), time.time()
    print(f'Emulating {brand.maker} ({brand.key}) on {a.port or "console"}  Max {a.max} {a.unit}, e = {a.e} {a.unit}, {a.baud} 8N1')
    print('keys: 0-5 load   + - one interval   z zero   f faulty cell   b brand   q quit\n')

    try:
        while True:
            if msvcrt and msvcrt.kbhit():
                k = msvcrt.getwch().lower()
                if k == 'q':
                    break
                if k in '012345':
                    cell.place(a.max * int(k) / 5)
                elif k in '+=':
                    cell.place(cell.target + a.e)
                elif k == '-':
                    cell.place(cell.target - a.e)
                elif k == 'z':
                    cell.zero = cell.value
                elif k == 'f':
                    cell.faulty = not cell.faulty
                elif k == 'b':
                    brand = PROTOCOLS[(PROTOCOLS.index(brand) + 1) % len(PROTOCOLS)]
            if a.auto and time.time() - step_at > 4.0:
                step_i = (step_i + 1) % len(steps)
                cell.place(a.max * steps[step_i])
                step_at = time.time()

            # MT-SICS indicators also answer commands from the host
            if ser is not None and ser.in_waiting:
                for cmd in ser.read(ser.in_waiting).decode('latin-1').split():
                    if cmd == 'Z':
                        cell.zero = cell.value
                        ser.write(b'Z A\r\n')
                    elif cmd == '@':
                        ser.write(b'I4 A "EMULATOR-0001"\r\n')

            shown, stable, over = cell.step()
            frame = brand.encode(Reading(shown, a.unit, stable, over, decimals=decimals))
            if ser is not None:
                try:
                    ser.write(frame)
                except Exception:  # nobody is reading the other end yet
                    pass
            tag = 'OVER  ' if over else ('STABLE' if stable else 'MOTION')
            sys.stdout.write(f'\r{brand.key:18} {shown:>10.{decimals}f} {a.unit}  {tag}  load {cell.target:>8.{decimals}f}  {"FAULTY CELL " if cell.faulty else ""}{frame!r:<40}'[:118])
            sys.stdout.flush()
            if a.dry and a.seconds:
                sys.stdout.write('\n')
            if a.seconds and time.time() - started > a.seconds:
                break
            time.sleep(1 / a.hz)
    except KeyboardInterrupt:
        pass
    finally:
        if ser is not None:
            ser.close()
        print('\nstopped.')


if __name__ == '__main__':
    main()
