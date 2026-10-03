import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../../utils/settings';
import { BrowserIndicatorSimulator } from './browserSimulator';
import { SERIAL_PRESETS, detectProtocol, parseIndicatorLine, splitFrames } from '../../utils/indicatorProtocols';

/**
 * Connection to a weighing indicator: the RS-232 indicator simulator running in
 * this page (default, auto-connected) or a physical indicator on a USB-serial
 * port via the Web Serial API. Exposes the live frame plus helpers to place a
 * test load and to wait for a stable, settled reading.
 */
export default function useIndicator(instrument, { autoConnect = true } = {}) {
  const max = Number(instrument?.maxCapacity) || 0;
  const e = Number(instrument?.verificationInterval || instrument?.verificationScaleInterval_e) || 0;
  const d = Number(instrument?.actualInterval || instrument?.actualScaleInterval_d) || e;
  const unit = instrument?.unit || 'kg';

  const [mode, setMode] = useState('OFF'); // OFF | SIM | SERIAL
  const [protocol, setProtocol] = useState(() => getSettings().indicatorProtocol);
  const [condition, setConditionState] = useState('HEALTHY');
  const [frame, setFrame] = useState({ weight: 0, isStable: false, isZero: true, isOverload: false, isNet: false, rawAscii: '', rawHex: '' });
  const [target, setTarget] = useState(0);
  const [serialPreset, setSerialPreset] = useState(SERIAL_PRESETS[0].key);
  const [detected, setDetected] = useState(null); // { key, label, share } once a USB indicator's format is recognised

  const simRef = useRef(null); // BrowserIndicatorSimulator, kept across reconnects so a placed load survives
  const frameRef = useRef(frame);
  const seqRef = useRef(0); // increments with every frame received
  const targetRef = useRef(0);
  const portRef = useRef(null);
  const readerRef = useRef(null);

  const onFrame = useCallback((f) => {
    frameRef.current = f;
    seqRef.current += 1;
    setFrame(f);
  }, []);

  const disconnect = useCallback(() => {
    simRef.current?.stop();
    try {
      readerRef.current?.cancel();
      portRef.current?.close();
    } catch {
      /* ignore */
    }
    readerRef.current = null;
    portRef.current = null;
    setDetected(null);
    setMode('OFF');
  }, []);

  const connectSim = useCallback(
    async (proto = protocol, cond = condition) => {
      if (!max || !e) return;
      const config = {
        protocol: proto,
        unit,
        maxCapacity: max,
        verificationInterval_e: e,
        actualInterval_d: d,
        noiseLevel: 0.05,
        condition: cond,
        zeroTrackingEnabled: true,
      };
      // No targetWeight here: reconnecting (e.g. to change protocol) must never
      // reset the load receptor back to zero.
      if (simRef.current) simRef.current.configure(config);
      else simRef.current = new BrowserIndicatorSimulator(config);
      simRef.current.start(onFrame);
      setMode('SIM');
    },
    [max, e, d, unit, protocol, condition, onFrame]
  );

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) return false;
    try {
      const preset = SERIAL_PRESETS.find((p) => p.key === serialPreset) || SERIAL_PRESETS[0];
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: preset.baudRate, dataBits: preset.dataBits, stopBits: preset.stopBits, parity: preset.parity });
      simRef.current?.stop();
      portRef.current = port;
      setMode('SERIAL');
      setDetected(null);
      // latin1 keeps status / lamp bytes (CAS, Toledo continuous) as single characters
      const decoder = new TextDecoderStream('latin1');
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      readerRef.current = reader;
      let buf = '';
      let last = [];
      let recent = [];
      let proto = null;
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const [lines, rest] = splitFrames(buf + value);
          buf = rest;
          for (const line of lines) {
            // name the indicator's format from the last dozen frames, and keep checking in case it is switched
            recent = [...recent.slice(-11), line];
            if (recent.length >= 4 && (!proto || recent.length % 4 === 0)) {
              const det = detectProtocol(recent);
              if ((det?.key || null) !== proto) {
                proto = det?.key || null;
                setDetected(det);
              }
            }
            const r = parseIndicatorLine(line, proto);
            if (!r) continue;
            const w = r.weight;
            last = [...last.slice(-3), w];
            const settled = last.length >= 3 && Math.max(...last) - Math.min(...last) <= d;
            // a brand parser states stability; an unknown format is judged from successive readings
            const stable = r.stable === null ? /^S\s+S/.test(line) || settled : r.stable;
            onFrame({ weight: w, isStable: stable, isZero: Math.abs(w) < d / 2, isOverload: r.overload, isNet: r.net, rawAscii: line, rawHex: '' });
          }
        }
      })();
      return true;
    } catch {
      return false;
    }
  }, [d, onFrame, serialPreset]);

  /** Place a test load on the (simulated) load receptor. */
  const placeLoad = useCallback(
    async (load) => {
      const v = Math.max(0, Number(load) || 0);
      targetRef.current = v;
      setTarget(v);
      simRef.current?.setTargetWeight(v);
    },
    []
  );

  /**
   * Resolve with { frame, settled } for the next reading that is stable and
   * settled near the target load. `settled` is false if the indicator did not
   * reach the test load in time — callers must then refuse to record it.
   */
  const waitForStable = useCallback(
    (timeoutMs = 7000) =>
      new Promise((resolve) => {
        const startSeq = seqRef.current;
        const started = Date.now();
        const tolerance = Math.max(3 * e, 0.02 * targetRef.current + e);
        const tick = () => {
          const f = frameRef.current;
          const near = mode !== 'SIM' || Math.abs(f.weight - targetRef.current) <= tolerance;
          if (seqRef.current > startSeq + 2 && f.isStable && !f.isOverload && near) return resolve({ frame: f, settled: true });
          if (Date.now() - started > timeoutMs) return resolve({ frame: f, settled: false });
          setTimeout(tick, 120);
        };
        tick();
      }),
    [mode, e]
  );

  const setCondition = useCallback(
    async (c) => {
      setConditionState(c);
      simRef.current?.configure({ condition: c });
    },
    []
  );

  const changeProtocol = useCallback(
    async (p) => {
      setProtocol(p);
      if (mode === 'SIM') await connectSim(p, condition);
    },
    [mode, connectSim, condition]
  );

  const zero = useCallback(async () => simRef.current?.zero(), []);
  const tare = useCallback(async () => simRef.current?.tare(), []);

  useEffect(() => {
    if (autoConnect && getSettings().autoConnectIndicator && max && e) connectSim();
    return () => {
      simRef.current?.stop();
      try {
        readerRef.current?.cancel();
        portRef.current?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, e, d]);

  return {
    mode,
    connected: mode !== 'OFF',
    frame,
    target,
    unit,
    d,
    e,
    max,
    protocol,
    condition,
    connectSim,
    connectSerial,
    disconnect,
    placeLoad,
    waitForStable,
    setCondition,
    changeProtocol,
    serialPreset,
    setSerialPreset,
    detected,
    zero,
    tare,
    serialSupported: typeof navigator !== 'undefined' && 'serial' in navigator,
  };
}
