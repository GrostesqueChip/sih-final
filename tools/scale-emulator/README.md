# Scale emulator and protocol library

A stand-in for a real weighing indicator, so NAWI-ReportPro's USB / RS-232 capture can be shown without lab hardware, plus a parser that recognises eight indicator output formats. Nothing here changes the web app.

| File | What it does |
|---|---|
| `protocols.py` | Encodes, parses and identifies eight indicator formats |
| `emulator.py` | Acts as a scale on a COM port (or prints frames with `--dry`) |
| `identify.py` | Listens to a port or reads a capture file and names the protocol |
| `test_protocols.py` | Round-trip, identification and web-app compatibility checks |
| `arduino_scale/arduino_scale.ino` | Turns any Arduino-type board into a USB "scale" |

## What it is and is not

This is an **emulator**: software that sends the same bytes a scale sends. It proves the capture path (USB serial → browser → MPE verdict → report) works end to end. It is **not** a test with a real indicator, so say "USB serial emulator" in a demo, never "tested on a Mettler-Toledo scale".

## Formats covered

| Key | Maker | Typical models | Example frame | How it is recognised | Read by the web app today |
|---|---|---|---|---|---|
| `mettler-sics` | Mettler-Toledo | MT-SICS balances and terminals | `S S     12.345 kg` | starts `S S` / `S D` | yes |
| `sartorius-sbi` | Sartorius | Entris, Quintix, Secura, Cubis | `+   12.345 kg ` | sign first; unit blank while unstable | yes |
| `and` | A&D | GX, GF, FX-i, HR, EK-i | `ST,+00012.345 kg` | header `ST,` `US,` `OL,` | yes |
| `cas` | CAS | CI-2001, CI-200, NT-200 | `ST,GS,0␦,  12.345 kg` | `ST,GS,` plus id and lamp bytes | **no** |
| `ohaus` | Ohaus | Scout, Navigator, Ranger, Defender | `    12.345 kg  ?` | value, unit, `?` while unstable | yes |
| `toledo-continuous` | Mettler-Toledo | IND, Jaguar, 8142 in continuous mode | `␂5005012345000000␍` | STX, 3 status bytes, 12 digits | **no** |
| `avery` | Avery Weigh-Tronix | as in the app's simulator | `␂ 0012.345 kg G S` | STX, value, unit, G/N, S/M | yes |
| `essae` | Essae-Teraoka | as in the app's simulator | `␂12.345kgS␍` | STX, digits, unit, S/M, CR only | yes |

**Finding:** the web app takes the first number in each line as the weight. That reads six of the eight formats correctly. CAS and Toledo continuous put status or device bytes before the weight, so they need a brand parser like the ones in `protocols.py`. This is the concrete case for the "pluggable parsers" strategy on slide 4.

**Serial settings differ by maker.** The app opens the port at 9600 baud, 8 data bits, no parity. A&D ships at 2400 7E1 and Sartorius at 1200 7O1 by default, so a real unit must be set to 9600 8N1 in its menu, or the app needs a settings choice.

**Check before a lab trial:** the Essae and Avery formats here are the ones the app's own simulator uses. Indian indicator makers ship several firmware variants, so confirm against the manual of the actual unit.

## Run the checks

```bash
python test_protocols.py
```

## Show a "USB scale" feeding the web app

Web Serial only lists real or virtual serial ports, so the emulator needs one of these:

### Option A: an Arduino-type board (looks most real, no driver)

1. Open `arduino_scale/arduino_scale.ino` in the Arduino IDE and upload it to any board.
2. Close the Arduino IDE's serial monitor.
3. In NAWI-ReportPro (Chrome or Edge) open a test session, press **USB indicator**, and pick the board in the port list.
4. The board steps through 0, 20, 40, 60, 80, 100 % of Max; the app captures each stable reading.

### Option B: a virtual COM-port pair on Windows (no hardware)

1. Install **com0com** (signed open-source null-modem driver) yourself and create one pair, for example `COM7` ↔ `COM8`. In its setup tick "use Ports class" so Chrome can see the ports.
2. Start the emulator on one end:

```bash
python emulator.py --port COM7 --brand mettler-sics --auto
```

3. In NAWI-ReportPro press **USB indicator** and choose `COM8`.
4. Keys in the emulator window: `0`–`5` place 0–100 % of Max, `+`/`-` one interval, `f` faulty load cell (readings go out of tolerance), `b` next brand, `q` quit.

### No port at all: see the frames

```bash
python emulator.py --dry --brand cas --auto
```

### Identify an unknown indicator

```bash
python identify.py --port COM8
```

## Sources for the formats

- Mettler-Toledo MT-SICS reference manuals (mt.com), response format `S S <value> <unit>`.
- Sartorius Entris II technical note and operating instructions: SBI output, 16 or 22 characters.
- A&D balance RS-232C manuals (aandd.jp): headers `ST`, `US`, `QT`, `OL`; 2400 / 4800 / 9600 baud, 7 data bits, even parity.
- CAS and compatible indicators: `ST,GS,` / `US,NT,` headers with device id and lamp bytes.
- Mettler-Toledo continuous output: STX, status words A, B and C, 6 weight digits, 6 tare digits, CR, optional checksum.
- Ohaus RS-232 interface manual: value, unit and `?` stability mark.
