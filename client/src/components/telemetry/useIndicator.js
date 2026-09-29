import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../../utils/settings';
import { BrowserIndicatorSimulator } from './browserSimulator';

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
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      simRef.current?.stop();
      portRef.current = port;
      setMode('SERIAL');
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      readerRef.current = reader;
      let buf = '';
      let last = [];
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split(/[\r\n]+/);
          buf = lines.pop();
          for (const line of lines) {
            const m = line.match(/([+-]?\s*\d+(?:\.\d+)?)/);
            if (!m) continue;
            const w = parseFloat(m[1].replace(/\s+/g, ''));
            last = [...last.slice(-3), w];
            const stable = /^S\s+S/.test(line) || (last.length >= 3 && Math.max(...last) - Math.min(...last) <= d);
            onFrame({ weight: w, isStable: stable, isZero: Math.abs(w) < d / 2, isOverload: false, isNet: false, rawAscii: line, rawHex: '' });
          }
        }
      })();
      return true;
    } catch {
      return false;
    }
  }, [d, onFrame]);

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
    zero,
    tare,
    serialSupported: typeof navigator !== 'undefined' && 'serial' in navigator,
  };
}
