"""Serial output formats of common weighing indicators: encode, parse and identify.

Each protocol has
  encode(Reading) -> bytes   one frame as the indicator would send it
  parse(line)     -> Reading | None
and identify() scores a batch of raw lines against every protocol and names the most likely one.

Formats follow the manufacturers' published interface manuals (see README.md). Indian indicator
makers ship several firmware variants, so the ESSAE and AVERY formats here are the ones the
NAWI-ReportPro simulator uses; check them against the manual of the actual unit before a lab trial.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional

STX, CR, LF = '\x02', '\r', '\n'


@dataclass
class Reading:
    weight: float
    unit: str = 'kg'
    stable: bool = True
    overload: bool = False
    net: bool = False
    decimals: int = 3
    tare: float = 0.0


def _num(r: Reading, width: int, sign: bool = True, zero_pad: bool = False) -> str:
    body = f'{abs(r.weight):.{r.decimals}f}'
    s = ('-' if r.weight < 0 else '+') if sign else ''
    body = body.rjust(width - len(s), '0' if zero_pad else ' ')
    return s + body


# ---------------------------------------------------------------- Mettler-Toledo MT-SICS
# "S S     12.345 kg" stable, "S D     12.345 kg" dynamic, "S +" overload, "S -" underload.
def enc_sics(r: Reading) -> bytes:
    if r.overload:
        return b'S +\r\n'
    return f"S {'S' if r.stable else 'D'} {r.weight:>10.{r.decimals}f} {r.unit}\r\n".encode()


_SICS = re.compile(r'^S ([SD])\s+(-?\d+(?:\.\d+)?)\s+([A-Za-z]+)$')


def par_sics(line: str) -> Optional[Reading]:
    if line in ('S +', 'S -'):
        return Reading(0.0, overload=True, stable=False)
    m = _SICS.match(line)
    return Reading(float(m[2]), m[3], m[1] == 'S', decimals=_dec(m[2])) if m else None


# ---------------------------------------------------------------- Sartorius SBI (16 characters)
# sign, 9 characters of value (right aligned), space, 3 unit characters, CR LF.
# The unit is blank while the reading is unstable.
def enc_sbi(r: Reading) -> bytes:
    if r.overload:
        return b'     High     \r\n'
    sign = '-' if r.weight < 0 else '+'
    val = f'{abs(r.weight):.{r.decimals}f}'.rjust(9)
    unit = (r.unit if r.stable else '').ljust(3)
    return f'{sign}{val} {unit}\r\n'.encode()


_SBI = re.compile(r'^([+-])\s*(\d+(?:\.\d+)?) ([A-Za-z ]{0,3})\s*$')


def par_sbi(line: str) -> Optional[Reading]:
    if line.strip() in ('High', 'Low'):
        return Reading(0.0, overload=True, stable=False)
    if len(line) not in (14, 13, 12, 11) and not line.startswith(('+', '-')):
        return None
    m = _SBI.match(line)
    if not m:
        return None
    unit = m[3].strip()
    return Reading(float(m[1] + m[2]), unit or 'kg', bool(unit), decimals=_dec(m[2]))


# ---------------------------------------------------------------- A&D (standard format)
# "ST,+00012.345 kg" stable, "US," unstable, "OL," out of range. Header, comma, 9-character value, 3-character unit.
def enc_and(r: Reading) -> bytes:
    if r.overload:
        return f"OL,+{'9' * 5}.{'9' * r.decimals} {r.unit.rjust(2)}\r\n".encode()
    head = 'ST' if r.stable else 'US'
    return f'{head},{_num(r, 9, zero_pad=True)} {r.unit.rjust(2)}\r\n'.encode()


_AND = re.compile(r'^(ST|US|OL|QT),([+-]\d+(?:\.\d+)?)\s*([A-Za-z]+)$')


def par_and(line: str) -> Optional[Reading]:
    m = _AND.match(line)
    if not m:
        return None
    return Reading(float(m[2]), m[3], m[1] == 'ST', overload=m[1] == 'OL', decimals=_dec(m[2]))


# ---------------------------------------------------------------- CAS (CI / NT series, 22 bytes)
# "ST,GS,<device id><lamp byte>,<8-char weight> kg": ST/US/OL, GS gross or NT net.
def enc_cas(r: Reading) -> bytes:
    head = 'OL' if r.overload else ('ST' if r.stable else 'US')
    body = f'{r.weight:8.{r.decimals}f}'
    return f"{head},{'NT' if r.net else 'GS'},\x30\x80,{body} {r.unit.ljust(2)}\r\n".encode('latin-1')


_CAS = re.compile(r'^(ST|US|OL),(GS|NT),..,\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$', re.S)


def par_cas(line: str) -> Optional[Reading]:
    m = _CAS.match(line)
    if not m:
        return None
    return Reading(float(m[3]), m[4], m[1] == 'ST', overload=m[1] == 'OL', net=m[2] == 'NT', decimals=_dec(m[3]))


# ---------------------------------------------------------------- Ohaus (standard print line)
# value right aligned, space, unit, then "?" while unstable.
def enc_ohaus(r: Reading) -> bytes:
    if r.overload:
        return b'Err 8.4\r\n'
    return f"{r.weight:>10.{r.decimals}f} {r.unit.ljust(3)}{' ' if r.stable else '?'}\r\n".encode()


_OHAUS = re.compile(r'^\s*(-?\d+(?:\.\d+)?) ([A-Za-z]+)\s*(\?)?\s*$')


def par_ohaus(line: str) -> Optional[Reading]:
    if line.startswith('Err'):
        return Reading(0.0, overload=True, stable=False)
    m = _OHAUS.match(line)
    return Reading(float(m[1]), m[2], m[3] is None, decimals=_dec(m[1])) if m else None


# ---------------------------------------------------------------- Mettler-Toledo continuous output
# STX, status words A B C, 6 weight digits, 6 tare digits, CR. The decimal point lives in status word A.
_TOL_DP = {0: 0b010, 1: 0b011, 2: 0b100, 3: 0b101, 4: 0b110, 5: 0b111}


def enc_toledo(r: Reading) -> bytes:
    swa = 0b0100000 | _TOL_DP[r.decimals]
    swb = 0b0100000 | (1 if r.net else 0) | (2 if r.weight < 0 else 0) | (4 if r.overload else 0) | (0 if r.stable else 8) | (16 if r.unit == 'kg' else 0)
    swc = 0b0100000
    digits = lambda v: f'{int(round(abs(v) * 10 ** r.decimals)):06d}'[-6:]
    return (STX + chr(swa) + chr(swb) + chr(swc) + digits(r.weight) + digits(r.tare) + CR).encode('latin-1')


def par_toledo(line: str) -> Optional[Reading]:
    line = line.lstrip(STX)
    if len(line) < 15 or not line[3:15].isdigit():
        return None
    swa, swb = ord(line[0]), ord(line[1])
    if not (swa & 0x20 and swb & 0x20):
        return None
    dec = {v: k for k, v in _TOL_DP.items()}.get(swa & 0b111)
    if dec is None:
        return None
    w = int(line[3:9]) / 10 ** dec
    return Reading(-w if swb & 2 else w, 'kg' if swb & 16 else 'lb', not swb & 8, bool(swb & 4), bool(swb & 1), dec, int(line[9:15]) / 10 ** dec)


# ---------------------------------------------------------------- Avery Weigh-Tronix style (as used by NAWI-ReportPro's simulator)
# STX, sign, 8-digit zero-padded value, unit, G/N, S/M, CR LF.
def enc_avery(r: Reading) -> bytes:
    return f"{STX}{'-' if r.weight < 0 else ' '}{abs(r.weight):0>8.{r.decimals}f} {r.unit} {'N' if r.net else 'G'} {'S' if r.stable else 'M'}\r\n".encode()


_AVERY = re.compile(r'^\x02?([ -])(\d+(?:\.\d+)?) ([A-Za-z]+) ([GN]) ([SM])$')


def par_avery(line: str) -> Optional[Reading]:
    m = _AVERY.match(line)
    if not m:
        return None
    w = float(m[2])
    return Reading(-w if m[1] == '-' else w, m[3], m[5] == 'S', net=m[4] == 'N', decimals=_dec(m[2]))


# ---------------------------------------------------------------- Essae style (as used by NAWI-ReportPro's simulator)
# STX, 6-digit zero-padded value, unit, S/M, CR.
def enc_essae(r: Reading) -> bytes:
    return f"{STX}{abs(r.weight):0>6.{r.decimals}f}{r.unit}{'S' if r.stable else 'M'}\r".encode()


_ESSAE = re.compile(r'^\x02?(\d+(?:\.\d+)?)([a-z]+)([SM])$')


def par_essae(line: str) -> Optional[Reading]:
    m = _ESSAE.match(line)
    return Reading(float(m[1]), m[2], m[3] == 'S', decimals=_dec(m[1])) if m else None


def _dec(s: str) -> int:
    return len(s.split('.')[1]) if '.' in s else 0


@dataclass
class Protocol:
    key: str
    maker: str
    models: str
    encode: Callable[[Reading], bytes]
    parse: Callable[[str], Optional[Reading]]
    signature: str
    native_serial: str


PROTOCOLS = [
    Protocol('mettler-sics', 'Mettler-Toledo', 'MT-SICS balances and terminals (XPR, MS, ICS, IND series)', enc_sics, par_sics, 'line starts "S S" or "S D"', '9600 8N1'),
    Protocol('sartorius-sbi', 'Sartorius', 'SBI balances (Entris, Quintix, Secura, Cubis)', enc_sbi, par_sbi, 'sign first, unit blank while unstable', '1200 7O1 default'),
    Protocol('and', 'A&D', 'GX / GF / FX-i / HR / EK-i balances, AD-4xxx indicators', enc_and, par_and, 'header "ST," "US," "OL,"', '2400 7E1 default'),
    Protocol('cas', 'CAS', 'CI-2001, CI-200, NT-200 series indicators', enc_cas, par_cas, '"ST,GS," / "US,NT," plus id and lamp bytes', '9600 8N1'),
    Protocol('ohaus', 'Ohaus', 'Scout, Navigator, Ranger, Defender, Adventurer', enc_ohaus, par_ohaus, 'value, unit, "?" while unstable', '9600 8N1 or 2400 7N2'),
    Protocol('toledo-continuous', 'Mettler-Toledo', 'industrial terminals in continuous mode (IND, Jaguar, 8142)', enc_toledo, par_toledo, 'STX, 3 status bytes, 12 digits', '9600 7E1 typical'),
    Protocol('avery', 'Avery Weigh-Tronix', 'ZM / E-series style line (as in the app simulator)', enc_avery, par_avery, 'STX, value, unit, G/N, S/M', '9600 8N1'),
    Protocol('essae', 'Essae-Teraoka', 'DS / SI series style frame (as in the app simulator)', enc_essae, par_essae, 'STX, digits, unit, S/M, CR only', '9600 8N1'),
]
BY_KEY = {p.key: p for p in PROTOCOLS}


def split_frames(data: bytes) -> list[str]:
    """Split raw bytes into frames on CR and/or LF, keeping leading STX."""
    return [f for f in re.split(r'[\r\n]+', data.decode('latin-1')) if f.strip(STX).strip()]


def identify(lines: list[str]) -> list[tuple[str, float]]:
    """Return (protocol key, share of lines it parses), best first. More specific formats win ties."""
    scores = []
    for rank, p in enumerate(PROTOCOLS):
        ok = sum(1 for ln in lines if p.parse(ln) is not None)
        scores.append((p.key, ok / max(1, len(lines)), rank))
    # generic formats (ohaus, sbi) also accept other makers' lines, so prefer the most specific full match
    specificity = {'toledo-continuous': 0, 'cas': 1, 'and': 2, 'mettler-sics': 3, 'avery': 4, 'essae': 5, 'sartorius-sbi': 6, 'ohaus': 7}
    scores.sort(key=lambda s: (-s[1], specificity[s[0]]))
    return [(k, round(v, 3)) for k, v, _ in scores]


# What the unchanged NAWI-ReportPro web app does with a serial line (client/src/components/telemetry/useIndicator.js):
# first number in the line is the weight; stable if the line starts "S S", else when the last 3 readings agree within d.
_APP = re.compile(r'([+-]?\s*\d+(?:\.\d+)?)')


def app_reads(line: str) -> Optional[float]:
    m = _APP.search(line)
    return float(re.sub(r'\s+', '', m[1])) if m else None
