import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../../hooks/useApi';
import { getSettings } from '../../utils/settings';

/**
 * Connection to a weighing indicator: the RS-232 simulator streamed over SSE
 * (default, auto-connected) or a physical indicator on a USB-serial port via
 * the Web Serial API. Exposes the live frame plus helpers to place a test load
 * and to wait for a stable, settled reading.
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

  const esRef = useRef(null);
  const frameRef = useRef(frame);
  const seqRef = useRef(0); // increments with every frame received
  const targetRef = useRef(0);
  const portRef = useRef(null);
  const readerRef = useRef(null);
  // Generation counter: a connect that resolves after a newer connect (or after
  // unmount) must not open a stream, or the connection leaks and exhausts the
  // browser's per-host connection limit.
  const genRef = useRef(0);

  const onFrame = useCallback((f) => {
    frameRef.current = f;
    seqRef.current += 1;
    setFrame(f);
  }, []);

  const disconnect = useCallback(() => {
    genRef.current += 1;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
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
      genRef.current += 1;
      const gen = genRef.current;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      try {
        await apiClient.post('/telemetry/config', {
          protocol: proto,
          unit,
          maxCapacity: max,
          verificationInterval_e: e,
          actualInterval_d: d,
          noiseLevel: 0.05,
          condition: cond,
          zeroTrackingEnabled: true,
        });
      } catch {
        /* viewer role cannot configure; stream still works read-only */
      }
      // No targetWeight here: the stream may connect after a test load has been
      // placed, and must never reset the load receptor back to zero.
      if (gen !== genRef.current) return; // superseded or unmounted meanwhile
      const qs = new URLSearchParams({ protocol: proto, unit, maxCapacity: max, e, d, noise: 0.05, condition: cond });
      const es = new EventSource(`/api/telemetry/stream?${qs}`);
      es.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data);
          if (p.weight === undefined) return;
          onFrame({
            weight: p.weight,
            isStable: Boolean(p.isStable),
            isZero: Boolean(p.isZero),
            isOverload: Boolean(p.isOverload),
            isNet: Boolean(p.isNet),
            rawAscii: p.rawAscii || '',
            rawHex: p.rawHex || '',
          });
        } catch {
          /* heartbeat */
        }
      };
      esRef.current = es;
      setMode('SIM');
    },
    [max, e, d, unit, protocol, condition, onFrame]
  );

  const connectSerial = useCallback(async () => {
    if (!('serial' in navigator)) return false;
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      if (esRef.current) esRef.current.close();
      esRef.current = null;
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
      if (mode === 'SIM' || esRef.current) {
        try {
          await apiClient.post('/telemetry/set-weight', { weight: v });
        } catch {
          /* ignore */
        }
      }
    },
    [mode]
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
      try {
        await apiClient.post('/telemetry/config', { condition: c });
      } catch {
        /* ignore */
      }
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

  const zero = useCallback(() => apiClient.post('/telemetry/zero').catch(() => null), []);
  const tare = useCallback(() => apiClient.post('/telemetry/tare').catch(() => null), []);

  useEffect(() => {
    if (autoConnect && getSettings().autoConnectIndicator && max && e) connectSim();
    return () => {
      genRef.current += 1;
      if (esRef.current) esRef.current.close();
      esRef.current = null;
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
