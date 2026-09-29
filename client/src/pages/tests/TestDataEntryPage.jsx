import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiSave, FiCheckCircle, FiLock, FiUploadCloud, FiRotateCcw, FiInfo, FiChevronRight } from 'react-icons/fi';

import apiClient from '../../hooks/useApi';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import StatusBadge from '../../components/shared/StatusBadge';
import BatchCsvModal from '../../components/batch/BatchCsvModal';
import DigitalIndicator from '../../components/telemetry/DigitalIndicator';
import useIndicator from '../../components/telemetry/useIndicator';
import { calculateMpe } from '../../utils/metrology';
import { useAuth } from '../../contexts/AuthContext';
import { TEST_MODULES, moduleTitle, classLabel, formatMass, decimalsFor } from '../../utils/format';

// ---------------------------------------------------------------------------
// Slot model: every capturable reading has an id, a label and a test load.
// ---------------------------------------------------------------------------
const PCTS = [0, 20, 40, 60, 80, 100];
const ECC_POS = ['Centre', 'Front-left', 'Front-right', 'Back-right', 'Back-left'];
const TEMPS = [20, 40, 10];
const HOURS = [0, 0.5, 1, 2, 4, 8];
const MINUTES = [0, 5, 10, 15, 20, 25, 30];

const r4 = (v) => Math.round(v * 10000) / 10000;
const roundToStep = (v, step) => {
  const dp = decimalsFor(step) + 1;
  return Number((Math.round(v / step) * step).toFixed(dp));
};

function buildSlots(type, inst) {
  const max = Number(inst.maxCapacity);
  const e = Number(inst.verificationInterval);
  switch (type) {
    case 'WEIGHING_PERFORMANCE':
      return [
        ...PCTS.map((p, i) => ({ id: `inc-${i}`, label: `${p} % Max — increasing load`, load: r4((max * p) / 100) })),
        ...PCTS.slice()
          .reverse()
          .map((p) => ({ id: `dec-${PCTS.indexOf(p)}`, label: `${p} % Max — decreasing load`, load: r4((max * p) / 100) })),
      ];
    case 'REPEATABILITY':
      return [
        ...Array.from({ length: 6 }, (_, i) => ({ id: `half-${i}`, label: `50 % Max — run ${i + 1}`, load: r4(max * 0.5) })),
        ...Array.from({ length: 6 }, (_, i) => ({ id: `full-${i}`, label: `100 % Max — run ${i + 1}`, load: max })),
      ];
    case 'ECCENTRICITY': {
      const load = roundToStep(max / 3, e);
      return ECC_POS.map((p, i) => ({ id: `ecc-${i}`, label: `Eccentricity — ${p}`, load }));
    }
    case 'TEMPERATURE':
      return TEMPS.flatMap((tc, i) => [
        { id: `tz-${i}`, label: `${tc} °C — zero (no load)`, load: 0 },
        { id: `ts-${i}`, label: `${tc} °C — span at Max`, load: max },
      ]);
    case 'STABILITY':
      return HOURS.map((h, i) => ({ id: `st-${i}`, label: `Stability — after ${h} h`, load: max }));
    case 'TIME_DEPENDENCE':
      return [
        ...MINUTES.map((m, i) => ({ id: `cr-${i}`, label: `Creep — ${m} min under Max`, load: max })),
        { id: 'zr', label: 'Zero return after unloading', load: 0 },
      ];
    default:
      return [];
  }
}

/** Existing stored payload -> readings map. */
function readingsFromData(type, data, inst) {
  const out = {};
  if (!data) return out;
  const max = Number(inst.maxCapacity);
  const dp = Math.min(6, decimalsFor(inst.actualInterval || inst.verificationInterval));
  const put = (k, v) => {
    if (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))) out[k] = Number(v).toFixed(dp);
  };
  if (type === 'WEIGHING_PERFORMANCE' && Array.isArray(data.points)) {
    PCTS.forEach((p, i) => {
      const L = r4((max * p) / 100);
      const inc = data.points.find((x) => Math.abs(Number(x.appliedLoad) - L) < 1e-6 && x.isIncreasing !== false);
      const dec = data.points.find((x) => Math.abs(Number(x.appliedLoad) - L) < 1e-6 && x.isIncreasing === false);
      put(`inc-${i}`, inc?.indicatedValue);
      put(`dec-${i}`, dec?.indicatedValue);
    });
  }
  if (type === 'REPEATABILITY' && Array.isArray(data.series)) {
    (data.series[0]?.readings || []).forEach((v, i) => put(`half-${i}`, typeof v === 'object' ? v.indicatedValue : v));
    (data.series[1]?.readings || []).forEach((v, i) => put(`full-${i}`, typeof v === 'object' ? v.indicatedValue : v));
  }
  if (type === 'ECCENTRICITY' && Array.isArray(data.positions)) data.positions.forEach((p, i) => put(`ecc-${i}`, p.indicatedValue));
  if (type === 'TEMPERATURE' && Array.isArray(data.temperaturePoints)) {
    TEMPS.forEach((tc, i) => {
      const p = data.temperaturePoints.find((x) => Number(x.temperature) === tc);
      put(`tz-${i}`, p?.zeroIndication);
      put(`ts-${i}`, p?.spanIndication);
    });
  }
  if (type === 'STABILITY' && Array.isArray(data.timePoints)) data.timePoints.forEach((p, i) => put(`st-${i}`, p.loadReading));
  if (type === 'TIME_DEPENDENCE') {
    (data.creepReadings || []).forEach((p, i) => put(`cr-${i}`, p.indication));
    put('zr', data.zeroReturn?.indicationAfterUnload);
  }
  return out;
}

const num = (v) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? null : Number(v));

/** Readings map -> canonical API payload (identical to the seeded format). */
function buildPayload(type, R, inst, slots) {
  const max = Number(inst.maxCapacity);
  switch (type) {
    case 'WEIGHING_PERFORMANCE':
      return {
        points: PCTS.flatMap((p, i) => {
          const L = r4((max * p) / 100);
          return [
            { appliedLoad: L, indicatedValue: num(R[`inc-${i}`]), isIncreasing: true },
            { appliedLoad: L, indicatedValue: num(R[`dec-${i}`]), isIncreasing: false },
          ];
        }),
      };
    case 'REPEATABILITY':
      return {
        series: [
          { load: r4(max * 0.5), readings: Array.from({ length: 6 }, (_, i) => num(R[`half-${i}`])).filter((v) => v !== null) },
          { load: max, readings: Array.from({ length: 6 }, (_, i) => num(R[`full-${i}`])).filter((v) => v !== null) },
        ],
      };
    case 'ECCENTRICITY':
      return {
        positions: ECC_POS.map((_, i) => ({ position: i === 0 ? 'CENTER' : `POS_${i + 1}`, appliedLoad: slots[i].load, indicatedValue: num(R[`ecc-${i}`]) })),
      };
    case 'TEMPERATURE':
      return {
        temperaturePoints: TEMPS.map((tc, i) => ({ temperature: tc, zeroIndication: num(R[`tz-${i}`]), spanLoad: max, spanIndication: num(R[`ts-${i}`]) })),
      };
    case 'STABILITY':
      return { timePoints: HOURS.map((h, i) => ({ timestampMinutes: h * 60, zeroReading: 0, loadReading: num(R[`st-${i}`]), appliedLoad: max })) };
    case 'TIME_DEPENDENCE':
      return {
        testLoad: max,
        creepReadings: MINUTES.map((m, i) => ({ minute: m, indication: num(R[`cr-${i}`]) })),
        zeroReturn: { appliedLoad: max, indicationAfterUnload: num(R.zr) },
      };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Live evaluation (mirrors the server engine so the verdict never surprises)
// ---------------------------------------------------------------------------
function evaluate(type, R, inst, inService, slots) {
  const e = Number(inst.verificationInterval);
  const max = Number(inst.maxCapacity);
  const mpe = (L) => calculateMpe(L, e, inst.accuracyClass, !inService);
  const res = { rows: {}, pass: null };
  const verdicts = [];
  const mark = (id, ok) => {
    res.rows[id] = ok;
    if (ok !== null) verdicts.push(ok);
  };

  if (type === 'WEIGHING_PERFORMANCE') {
    const E0 = num(R['inc-0']) ?? 0;
    res.table = PCTS.map((p, i) => {
      const L = r4((max * p) / 100);
      const I = num(R[`inc-${i}`]);
      const D = num(R[`dec-${i}`]);
      const m = mpe(L);
      const ecI = I === null ? null : I - L - E0;
      const ecD = D === null ? null : D - L - E0;
      const hy = I !== null && D !== null ? Math.abs(D - I) : null;
      mark(`inc-${i}`, ecI === null ? null : Math.abs(ecI) <= m + 1e-9);
      mark(`dec-${i}`, ecD === null ? null : Math.abs(ecD) <= m + 1e-9 && (hy === null || hy <= m + 1e-9));
      return { p, L, ecI, ecD, hy, m };
    });
  } else if (type === 'REPEATABILITY') {
    res.series = [
      ['half', r4(max * 0.5)],
      ['full', max],
    ].map(([k, L]) => {
      const vals = Array.from({ length: 6 }, (_, i) => num(R[`${k}-${i}`])).filter((v) => v !== null);
      const range = vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : null;
      const m = mpe(L);
      const ok = range === null ? null : range <= m + 1e-9;
      Array.from({ length: 6 }, (_, i) => (res.rows[`${k}-${i}`] = num(R[`${k}-${i}`]) === null ? null : ok));
      if (ok !== null && vals.length === 6) verdicts.push(ok);
      return { k, L, range, m, ok, n: vals.length };
    });
  } else if (type === 'ECCENTRICITY') {
    const L = slots[0]?.load || 0;
    const m = mpe(L);
    const c = num(R['ecc-0']);
    res.m = m;
    res.table = ECC_POS.map((pos, i) => {
      const v = num(R[`ecc-${i}`]);
      const err = v === null ? null : v - L;
      mark(`ecc-${i}`, err === null ? null : Math.abs(err) <= m + 1e-9);
      return { pos, v, err, diff: v !== null && c !== null ? v - c : null };
    });
  } else if (type === 'TEMPERATURE') {
    const m = mpe(max);
    const pts = TEMPS.map((tc, i) => {
      const z = num(R[`tz-${i}`]);
      const sp = num(R[`ts-${i}`]);
      const corr = z !== null && sp !== null ? sp - max - z : null;
      mark(`ts-${i}`, corr === null ? null : Math.abs(corr) <= m + 1e-9);
      return { tc, z, sp, corr, i };
    });
    const sorted = [...pts].sort((a, b) => a.tc - b.tc);
    res.drifts = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.z === null || b.z === null) continue;
      const per5 = (Math.abs(b.z - a.z) / Math.abs(b.tc - a.tc)) * 5;
      const ok = per5 <= e + 1e-9;
      res.drifts.push({ from: a.tc, to: b.tc, per5, ok });
      verdicts.push(ok);
    }
    pts.forEach((p) => (res.rows[`tz-${p.i}`] = p.z === null ? null : res.drifts.every((d) => d.ok)));
    res.table = pts;
    res.m = m;
  } else if (type === 'STABILITY') {
    const m = mpe(max);
    const base = num(R['st-0']);
    res.m = m;
    res.table = HOURS.map((h, i) => {
      const v = num(R[`st-${i}`]);
      const drift = v !== null && base !== null ? v - base : null;
      mark(`st-${i}`, drift === null ? null : Math.abs(drift) <= m + 1e-9);
      return { h, v, drift };
    });
  } else if (type === 'TIME_DEPENDENCE') {
    const m = mpe(max);
    const c0 = num(R['cr-0']);
    const c15 = num(R['cr-3']);
    const c30 = num(R['cr-6']);
    const zr = num(R.zr);
    res.c = {
      d30: c0 !== null && c30 !== null ? Math.abs(c30 - c0) : null,
      d15: c15 !== null && c30 !== null ? Math.abs(c30 - c15) : null,
      zr: zr === null ? null : Math.abs(zr),
      l30: 0.5 * m,
      l15: 0.2 * m,
      lz: 0.5 * e,
    };
    const ok30 = res.c.d30 === null ? null : res.c.d30 <= res.c.l30 + 1e-9;
    const ok15 = res.c.d15 === null ? null : res.c.d15 <= res.c.l15 + 1e-9;
    const okz = res.c.zr === null ? null : res.c.zr <= res.c.lz + 1e-9;
    res.c.ok30 = ok30;
    res.c.ok15 = ok15;
    res.c.okz = okz;
    [ok30, ok15, okz].forEach((v) => v !== null && verdicts.push(v));
    MINUTES.forEach((_, i) => (res.rows[`cr-${i}`] = num(R[`cr-${i}`]) === null ? null : i >= 3 ? ok15 ?? ok30 : ok30));
    res.rows.zr = okz;
  }

  const filled = slots.filter((s) => num(R[s.id]) !== null).length;
  res.filled = filled;
  res.total = slots.length;
  res.pass = verdicts.length ? verdicts.every(Boolean) : null;
  return res;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function ReadingInput({ id, R, setR, active, setActive, readOnly, ok, onEnter, inputRef }) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="number"
        step="any"
        inputMode="decimal"
        value={R[id] ?? ''}
        disabled={readOnly}
        onFocus={() => setActive(id)}
        onChange={(ev) => setR(id, ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            onEnter(id);
          }
        }}
        placeholder={readOnly ? '—' : '·'}
        className={`w-full min-w-[92px] h-9 px-2.5 rounded-md border font-mono text-[13px] font-semibold text-right tabular-nums transition-shadow
          ${readOnly ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-white'}
          ${active ? 'border-saffron-500 ring-4 ring-saffron-500/25' : ok === false ? 'border-red-400 bg-red-50/50' : ok === true ? 'border-green-400' : 'border-slate-300'}`}
      />
      {active && !readOnly && <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded bg-saffron-500" aria-hidden="true" />}
    </div>
  );
}

function Verdict({ ok }) {
  if (ok === null || ok === undefined) return <span className="text-slate-300 text-xs">—</span>;
  return <StatusBadge status={ok ? 'PASS' : 'FAIL'} size="xs" />;
}

const th = 'text-left font-bold px-3 py-2.5 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] whitespace-nowrap';

// ---------------------------------------------------------------------------
export default function TestDataEntryPage() {
  const { t } = useTranslation();
  const { id: sessionId, testType: rawType } = useParams();
  const type = (rawType || 'WEIGHING_PERFORMANCE').toUpperCase().replace('TEMPERATURE_EFFECTS', 'TEMPERATURE').replace(/^WEIGHING$/, 'WEIGHING_PERFORMANCE');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ['test-session', sessionId],
    queryFn: async () => (await apiClient.get(`/tests/${sessionId}`)).data?.data,
  });

  const { user, isInspector } = useAuth();
  const inst = session?.instrument;
  const sealed = session ? session.status === 'COMPLETED' || session.status === 'FAILED' : true;
  const isOwner = Boolean(session) && isInspector && (user?.role === 'ADMIN' || session.conductedById === user?.id);
  const readOnly = sealed || !isOwner;
  const inService = session?.verificationType === 'INSPECTION';
  const slots = useMemo(() => (inst ? buildSlots(type, inst) : []), [type, inst]);
  const existing = session?.testResults?.find((r) => r.testType === type);

  const [R, setReadings] = useState({});
  const [active, setActive] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const stopRef = useRef(false);
  const inputRefs = useRef({});
  const Rref = useRef(R);
  Rref.current = R;

  // Load stored readings whenever the module/session changes
  useEffect(() => {
    if (!inst) return;
    const loaded = readingsFromData(type, existing?.data, inst);
    setReadings(loaded);
    setDirty(false);
    const firstEmpty = buildSlots(type, inst).find((s) => loaded[s.id] === undefined);
    setActive(firstEmpty?.id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, inst?.id, existing?.id, existing?.updatedAt]);

  const ind = useIndicator(inst, { autoConnect: Boolean(inst) && !sealed });
  const activeSlot = slots.find((s) => s.id === active) || null;

  // Put the active slot's test load on the receptor
  useEffect(() => {
    if (activeSlot && ind.connected && !readOnly) ind.placeLoad(activeSlot.load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id, activeSlot?.load, ind.connected]);

  const setR = useCallback((id, v) => {
    setReadings((prev) => ({ ...prev, [id]: v }));
    setDirty(true);
  }, []);

  const nextEmptyAfter = useCallback(
    (id, map = Rref.current) => {
      const idx = slots.findIndex((s) => s.id === id);
      const order = [...slots.slice(idx + 1), ...slots.slice(0, idx + 1)];
      return order.find((s) => s.id !== id && (map[s.id] === undefined || map[s.id] === '')) || null;
    },
    [slots]
  );

  const advance = useCallback(
    (id, map) => {
      const nxt = nextEmptyAfter(id, map);
      setActive(nxt?.id || null);
      if (nxt) setTimeout(() => inputRefs.current[nxt.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    },
    [nextEmptyAfter]
  );

  const captureInto = useCallback(
    async (slot, { quiet = false } = {}) => {
      const { frame: f, settled } = await ind.waitForStable();
      if (f.isOverload) {
        toast.error(t('entry.overload', 'Indicator overload — reading not captured'));
        return false;
      }
      if (!settled) {
        toast.error(t('entry.notSettled', 'Indicator did not settle at the {{l}} {{u}} test load — reading not captured. Check the load and try again.', { l: slot.load, u: inst.unit }));
        return false;
      }
      const value = Number(f.weight).toFixed(Math.min(6, decimalsFor(ind.d)));
      const map = { ...Rref.current, [slot.id]: value };
      setReadings(map);
      Rref.current = map;
      setDirty(true);
      if (!quiet) toast.success(`${slot.label}: ${value} ${inst.unit}`, { id: 'capture', duration: 1600 });
      advance(slot.id, map);
      return true;
    },
    [ind, advance, inst, t]
  );

  const onCapture = () => activeSlot && captureInto(activeSlot);

  const runAuto = async () => {
    stopRef.current = false;
    setAutoRunning(true);
    let map = Rref.current;
    for (const slot of slots) {
      if (stopRef.current) break;
      if (map[slot.id] !== undefined && map[slot.id] !== '') continue;
      setActive(slot.id);
      inputRefs.current[slot.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await ind.placeLoad(slot.load);
      await new Promise((r) => setTimeout(r, 250));
      // eslint-disable-next-line no-await-in-loop
      const ok = await captureInto(slot, { quiet: true });
      if (!ok) {
        stopRef.current = true;
        break;
      }
      map = Rref.current;
    }
    setAutoRunning(false);
    if (!stopRef.current) toast.success(t('entry.autoDone', 'All readings captured from the indicator'), { id: 'capture' });
  };

  const evaln = useMemo(() => (inst ? evaluate(type, R, inst, inService, slots) : null), [type, R, inst, inService, slots]);
  const complete = evaln && evaln.filled === evaln.total;

  const save = useMutation({
    mutationFn: async ({ final }) =>
      (await apiClient.post(`/tests/${sessionId}/results`, { testType: type, data: buildPayload(type, R, inst, slots), isPartial: !final })).data,
    onSuccess: (res, { final }) => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['test-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['test-sessions-all'] });
      queryClient.invalidateQueries({ queryKey: ['open-sessions-full'] });
      if (!final) {
        toast.success(t('entry.progressSaved', 'Progress saved — {{n}} of {{t}} readings', { n: evaln.filled, t: evaln.total }));
        return;
      }
      const verdict = res?.data?.result;
      const done = new Set((session.testResults || []).filter((r) => r.status === 'COMPLETED').map((r) => r.testType));
      done.add(type);
      const next = TEST_MODULES.find((m) => !done.has(m.type));
      toast.success(
        `${moduleTitle(type)}: ${verdict}. ${next ? t('entry.next', 'Next: {{m}}', { m: moduleTitle(next.type) }) : t('entry.allDone', 'All six modules complete — ready to seal.')}`,
        { duration: 4000 }
      );
      navigate(next ? `/tests/${sessionId}/${next.type}` : `/tests/${sessionId}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || t('entry.saveFail', 'Could not save readings')),
  });

  if (isLoading) return <LoadingSpinner message={t('common.loading', 'Loading…')} />;
  if (!session || !inst) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <h2 className="text-lg font-bold">{t('entry.notFound', 'Session or instrument not found')}</h2>
        <button type="button" onClick={() => navigate('/tests')} className="mt-4 h-10 px-4 rounded-md bg-navy text-white text-sm font-bold">{t('detail.back', 'Back to sessions')}</button>
      </div>
    );
  }

  const fm = (v, signed) => formatMass(v, inst, { signed });
  const unit = inst.unit;
  const inp = (sid) => (
    <ReadingInput
      id={sid}
      R={R}
      setR={setR}
      active={active === sid}
      setActive={setActive}
      readOnly={readOnly}
      ok={evaln.rows[sid]}
      onEnter={(x) => advance(x)}
      inputRef={(el) => (inputRefs.current[sid] = el)}
    />
  );
  const statusOf = (mType) => {
    const r = session.testResults?.find((x) => x.testType === mType);
    return !r ? 'NOT_STARTED' : r.status !== 'COMPLETED' ? 'IN_PROGRESS' : r.result;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate(`/tests/${sessionId}`)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy mb-1">
            <FiArrowLeft className="w-3.5 h-3.5" /> <span className="font-mono">{session.certificateNo}</span>
          </button>
          <h1 className="text-2xl font-extrabold text-navy">{moduleTitle(type)}</h1>
          <p className="text-sm text-slate-600">
            {inst.name} · {classLabel(inst.accuracyClass)} · Max {fm(inst.maxCapacity)} {unit} · e = {inst.verificationInterval} {unit} ·{' '}
            <b>{inService ? t('entry.inService', 'In-service limits (2 × MPE)') : t('entry.verif', 'Verification limits (1 × MPE)')}</b>
          </p>
        </div>
        {evaln && (
          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
            <div className="text-right">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{t('entry.live', 'Live evaluation')}</div>
              <div className="text-sm font-bold text-slate-900">{evaln.filled}/{evaln.total} {t('entry.readings', 'readings')}</div>
            </div>
            <StatusBadge status={evaln.pass === null ? 'PENDING' : evaln.pass ? 'PASS' : 'FAIL'} size="md" />
          </div>
        )}
      </div>

      {/* Module tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 flex gap-1 overflow-x-auto">
        {TEST_MODULES.map((m, i) => {
          const st = statusOf(m.type);
          const on = m.type === type;
          return (
            <button
              key={m.type}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm(t('entry.unsaved', 'You have unsaved readings. Leave this module without saving?'))) return;
                navigate(`/tests/${sessionId}/${m.type}`);
              }}
              className={`flex items-center gap-2 px-3 h-10 rounded-lg text-[13px] font-semibold whitespace-nowrap ${on ? 'bg-navy text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <span className={`w-5 h-5 rounded-full text-[10.5px] font-bold flex items-center justify-center ${
                st === 'PASS' ? 'bg-green-600 text-white' : st === 'FAIL' ? 'bg-red-600 text-white' : st === 'IN_PROGRESS' ? 'bg-primary-500 text-white' : on ? 'bg-white/20' : 'bg-slate-200 text-slate-600'
              }`}>
                {st === 'PASS' ? '✓' : st === 'FAIL' ? '✕' : i + 1}
              </span>
              {t(`modulesShort.${m.key}`, m.short)}
            </button>
          );
        })}
      </div>

      {!sealed && readOnly && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-300 text-[13px] text-slate-700 flex items-center gap-2">
          <FiLock className="w-4 h-4" />
          {t('entry.notOwner', 'Read-only: this session was opened by {{n}}. Only that officer or the Controller can record readings.', { n: session.conductedBy?.name })}
        </div>
      )}
      {sealed && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-[13px] text-amber-900 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><FiLock className="w-4 h-4" /> {t('entry.sealed', 'This session is sealed. Readings are shown read-only and cannot be changed.')}</span>
          <button type="button" onClick={() => navigate(`/reports/${sessionId}`)} className="h-8 px-3 rounded-md bg-navy text-white text-xs font-bold whitespace-nowrap">{t('detail.openCert', 'Open certificate')}</button>
        </div>
      )}

      <div className={`grid gap-4 items-start ${sealed ? '' : 'xl:grid-cols-[1fr_340px]'}`}>
        {/* Readings */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-slate-600 flex items-center gap-2">
              <FiInfo className="w-4 h-4 text-primary-600 shrink-0" />
              {readOnly
                ? t('entry.hintSealed', 'Recorded indications with automatic error calculation.')
                : t('entry.hint', 'Click a cell to select it — the indicator loads that test point. Capture, or type a value and press Enter.')}
            </p>
            {!readOnly && (
              <div className="flex gap-2">
                {type === 'WEIGHING_PERFORMANCE' && (
                  <button type="button" onClick={() => setCsvOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <FiUploadCloud className="w-3.5 h-3.5" /> {t('entry.csv', 'Import CSV')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReadings({});
                    setDirty(true);
                    setActive(slots[0]?.id || null);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FiRotateCcw className="w-3.5 h-3.5" /> {t('entry.clear', 'Clear readings')}
                </button>
              </div>
            )}
          </div>

          <div className="p-5 overflow-x-auto">
            {type === 'WEIGHING_PERFORMANCE' && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>{t('entry.loadPoint', 'Load point')}</th>
                    <th className={`${th} text-right`}>L ({unit})</th>
                    <th className={th}>{t('entry.indUp', 'Indication ↑')}</th>
                    <th className={`${th} text-right`}>Ec ↑</th>
                    <th className={th}>{t('entry.indDown', 'Indication ↓')}</th>
                    <th className={`${th} text-right`}>Ec ↓</th>
                    <th className={`${th} text-right`}>{t('entry.hyst', 'Hysteresis')}</th>
                    <th className={`${th} text-right`}>MPE</th>
                    <th className={th}>{t('table.result', 'Result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaln.table.map((row, i) => (
                    <tr key={row.p}>
                      <td className={`${td} font-bold text-slate-800`}>{row.p} % Max</td>
                      <td className={`${td} text-right font-mono`}>{fm(row.L)}</td>
                      <td className={td}>{inp(`inc-${i}`)}</td>
                      <td className={`${td} text-right font-mono ${evaln.rows[`inc-${i}`] === false ? 'text-red-700 font-bold' : ''}`}>{row.ecI === null ? '—' : fm(row.ecI, true)}</td>
                      <td className={td}>{inp(`dec-${i}`)}</td>
                      <td className={`${td} text-right font-mono ${evaln.rows[`dec-${i}`] === false ? 'text-red-700 font-bold' : ''}`}>{row.ecD === null ? '—' : fm(row.ecD, true)}</td>
                      <td className={`${td} text-right font-mono`}>{row.hy === null ? '—' : fm(row.hy)}</td>
                      <td className={`${td} text-right font-mono text-slate-600`}>± {fm(row.m)}</td>
                      <td className={td}><Verdict ok={evaln.rows[`inc-${i}`] === null && evaln.rows[`dec-${i}`] === null ? null : evaln.rows[`inc-${i}`] !== false && evaln.rows[`dec-${i}`] !== false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {type === 'REPEATABILITY' && (
              <div className="space-y-5">
                {evaln.series.map((s) => (
                  <div key={s.k} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="text-sm font-bold text-slate-900">
                        {s.k === 'half' ? '50 % Max' : '100 % Max'} — {fm(s.L)} {unit}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-600">{t('entry.spread', 'Spread (max − min)')}: <b className="font-mono">{s.range === null ? '—' : fm(s.range)}</b> / ± {fm(s.m)}</span>
                        <Verdict ok={s.n === 6 ? s.ok : null} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {Array.from({ length: 6 }, (_, i) => (
                        <label key={i} className="block">
                          <span className="block text-[11px] font-semibold text-slate-500 mb-1">{t('entry.run', 'Run')} {i + 1}</span>
                          {inp(`${s.k}-${i}`)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {type === 'ECCENTRICITY' && (
              <div className="grid md:grid-cols-[220px_1fr] gap-6 items-start">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('entry.receptor', 'Load receptor (top view)')}</div>
                  <div className="relative aspect-square rounded-lg border-2 border-slate-400 bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_8px,#f1f5f9_8px,#f1f5f9_16px)]">
                    {[
                      [0, 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'],
                      [1, 'left-3 bottom-3'],
                      [2, 'right-3 bottom-3'],
                      [3, 'right-3 top-3'],
                      [4, 'left-3 top-3'],
                    ].map(([i, pos]) => {
                      const sid = `ecc-${i}`;
                      const ok = evaln.rows[sid];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => !readOnly && setActive(sid)}
                          className={`absolute ${pos} w-12 h-12 rounded-md text-xs font-extrabold border-2 ${
                            active === sid ? 'bg-saffron-500 border-saffron-600 text-navy-dark' : ok === true ? 'bg-green-100 border-green-500 text-green-900' : ok === false ? 'bg-red-100 border-red-500 text-red-900' : 'bg-white border-slate-400 text-slate-600'
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                    <span className="absolute -bottom-6 left-0 right-0 text-center text-[10.5px] text-slate-500">{t('entry.front', '▼ front (operator side)')}</span>
                  </div>
                </div>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>{t('entry.position', 'Position')}</th>
                      <th className={th}>{t('entry.indication', 'Indication')} ({unit})</th>
                      <th className={`${th} text-right`}>{t('entry.error', 'Error')}</th>
                      <th className={`${th} text-right`}>{t('entry.vsCentre', 'vs centre')}</th>
                      <th className={th}>{t('table.result', 'Result')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evaln.table.map((row, i) => (
                      <tr key={row.pos}>
                        <td className={`${td} font-bold text-slate-800`}>{i + 1}. {row.pos}</td>
                        <td className={td}>{inp(`ecc-${i}`)}</td>
                        <td className={`${td} text-right font-mono ${evaln.rows[`ecc-${i}`] === false ? 'text-red-700 font-bold' : ''}`}>{row.err === null ? '—' : fm(row.err, true)}</td>
                        <td className={`${td} text-right font-mono text-slate-600`}>{row.diff === null ? '—' : fm(row.diff, true)}</td>
                        <td className={td}><Verdict ok={evaln.rows[`ecc-${i}`]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="md:col-span-2 text-xs text-slate-500">
                  {t('entry.eccNote', 'Test load {{l}} {{u}} (≈ ⅓ Max) · MPE ± {{m}} {{u}}', { l: fm(slots[0]?.load), u: unit, m: fm(evaln.m) })}
                </p>
              </div>
            )}

            {type === 'TEMPERATURE' && (
              <>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>{t('entry.chamber', 'Chamber temperature')}</th>
                      <th className={th}>{t('entry.zeroInd', 'Zero indication')}</th>
                      <th className={th}>{t('entry.spanInd', 'Indication at Max')}</th>
                      <th className={`${th} text-right`}>{t('entry.corrSpan', 'Span error (corr.)')}</th>
                      <th className={`${th} text-right`}>MPE</th>
                      <th className={th}>{t('table.result', 'Result')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evaln.table.map((row) => (
                      <tr key={row.tc}>
                        <td className={`${td} font-bold text-slate-800`}>{row.tc} °C</td>
                        <td className={td}>{inp(`tz-${row.i}`)}</td>
                        <td className={td}>{inp(`ts-${row.i}`)}</td>
                        <td className={`${td} text-right font-mono ${evaln.rows[`ts-${row.i}`] === false ? 'text-red-700 font-bold' : ''}`}>{row.corr === null ? '—' : fm(row.corr, true)}</td>
                        <td className={`${td} text-right font-mono text-slate-600`}>± {fm(evaln.m)}</td>
                        <td className={td}><Verdict ok={evaln.rows[`ts-${row.i}`]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {evaln.drifts.map((d) => (
                    <div key={`${d.from}-${d.to}`} className={`rounded-lg border p-3 text-xs ${d.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <div className="font-bold text-slate-800">{t('entry.zeroDrift', 'Zero drift')} {d.from} → {d.to} °C</div>
                      <div className="font-mono mt-0.5">{fm(d.per5)} {unit} / 5 °C · {t('entry.limitLower', 'limit')} {inst.verificationInterval} {unit} (1 e)</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {type === 'STABILITY' && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>{t('entry.elapsed', 'Elapsed time')}</th>
                    <th className={th}>{t('entry.indication', 'Indication')} ({unit})</th>
                    <th className={`${th} text-right`}>{t('entry.drift', 'Drift from start')}</th>
                    <th className={`${th} text-right`}>{t('entry.limit', 'Limit')}</th>
                    <th className={th}>{t('table.result', 'Result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {evaln.table.map((row, i) => (
                    <tr key={row.h}>
                      <td className={`${td} font-bold text-slate-800`}>{row.h < 1 ? `${row.h * 60} min` : `${row.h} h`}</td>
                      <td className={td}>{inp(`st-${i}`)}</td>
                      <td className={`${td} text-right font-mono ${evaln.rows[`st-${i}`] === false ? 'text-red-700 font-bold' : ''}`}>{row.drift === null ? '—' : fm(row.drift, true)}</td>
                      <td className={`${td} text-right font-mono text-slate-600`}>± {fm(evaln.m)}</td>
                      <td className={td}><Verdict ok={evaln.rows[`st-${i}`]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {type === 'TIME_DEPENDENCE' && (
              <div className="space-y-5">
                <div>
                  <div className="text-sm font-bold text-slate-900 mb-2">{t('entry.creep', 'Creep under Max load')} ({fm(inst.maxCapacity)} {unit})</div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                    {MINUTES.map((m, i) => (
                      <label key={m} className="block">
                        <span className="block text-[11px] font-semibold text-slate-500 mb-1">{m} min</span>
                        {inp(`cr-${i}`)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid sm:grid-cols-[220px_1fr] gap-4 items-end">
                  <label className="block">
                    <span className="block text-[12px] font-bold text-slate-700 mb-1">{t('entry.zr', 'Zero return after unloading')}</span>
                    {inp('zr')}
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      [t('entry.c30', 'Creep 0 → 30 min'), evaln.c.d30, evaln.c.l30, evaln.c.ok30],
                      [t('entry.c15', 'Creep 15 → 30 min'), evaln.c.d15, evaln.c.l15, evaln.c.ok15],
                      [t('entry.zrLbl', 'Zero return'), evaln.c.zr, evaln.c.lz, evaln.c.okz],
                    ].map(([label, v, lim, ok]) => (
                      <div key={label} className={`rounded-lg border p-2.5 ${ok === false ? 'border-red-200 bg-red-50' : ok ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="font-bold text-slate-800">{label}</div>
                        <div className="font-mono mt-0.5">{v === null ? '—' : fm(v)} ≤ {formatMass(lim, inst, { extra: 1 })}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {!readOnly && (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                {complete
                  ? t('entry.ready', 'All readings recorded. Completing evaluates this module and moves to the next.')
                  : t('entry.missing', '{{n}} reading(s) still blank — save progress, or capture the rest to complete.', { n: evaln.total - evaln.filled })}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={save.isPending || evaln.filled === 0} onClick={() => save.mutate({ final: false })} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap">
                  <FiSave className="w-4 h-4" /> {t('entry.saveProgress', 'Save progress')}
                </button>
                <button type="button" disabled={save.isPending || !complete} onClick={() => save.mutate({ final: true })} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-navy text-white text-sm font-bold hover:bg-navy-light disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
                  <FiCheckCircle className="w-4 h-4" /> {t('entry.complete', 'Complete module')} <FiChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Indicator */}
        {!sealed && (
        <div className="xl:sticky xl:top-[124px]">
          <DigitalIndicator
            ind={ind}
            activeSlot={readOnly ? null : activeSlot}
            onCapture={onCapture}
            onAutoRun={runAuto}
            autoRunning={autoRunning}
            onStopAuto={() => (stopRef.current = true)}
            remaining={evaln ? evaln.total - evaln.filled : 0}
            readOnly={readOnly}
          />
        </div>
        )}
      </div>

      <BatchCsvModal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        sessionId={sessionId}
        instrument={{ ...inst, verificationScaleInterval_e: inst.verificationInterval, actualScaleInterval_d: inst.actualInterval }}
        onImportSuccess={(parsed) => {
          const pts = parsed?.points || [];
          const map = { ...Rref.current };
          let n = 0;
          PCTS.forEach((p, i) => {
            const L = r4((Number(inst.maxCapacity) * p) / 100);
            const row = pts.find((x) => Math.abs(Number(x.appliedLoad) - L) < 1e-6) || pts.find((x) => Number(x.percentMax) === p);
            if (row) {
              if (row.incReading !== undefined && row.incReading !== '') { map[`inc-${i}`] = String(row.incReading); n += 1; }
              if (row.decReading !== undefined && row.decReading !== '') { map[`dec-${i}`] = String(row.decReading); n += 1; }
            }
          });
          setReadings(map);
          setDirty(true);
          toast.success(t('entry.csvDone', 'Imported {{n}} readings from CSV', { n }));
          setCsvOpen(false);
        }}
      />
    </div>
  );
}
