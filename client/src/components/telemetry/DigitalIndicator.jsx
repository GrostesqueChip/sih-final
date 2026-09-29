import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiZap, FiZapOff, FiCpu, FiTerminal, FiCornerDownLeft, FiPlay, FiSquare, FiAlertTriangle } from 'react-icons/fi';
import { decimalsFor } from '../../utils/format';

const PROTOCOLS = [
  ['METTLER_SICS', 'Mettler-Toledo SICS'],
  ['AVERY_WEIGH_TRONIX', 'Avery Weigh-Tronix'],
  ['ESSAE', 'Essae-Teraoka'],
];

/**
 * Digital weighing indicator panel used on the data-entry screen.
 * `ind` is the object returned by useIndicator().
 */
export default function DigitalIndicator({ ind, activeSlot, onCapture, onAutoRun, autoRunning, onStopAuto, remaining, readOnly }) {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);
  const f = ind.frame;
  const dp = Math.min(5, decimalsFor(ind.d));
  const display = ind.connected ? (f.isOverload ? '- OL -' : Number(f.weight || 0).toFixed(dp)) : '— — —';

  return (
    <div className="bg-[#0d1b2a] text-white rounded-xl border border-slate-800 shadow-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-white/10">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-saffron-500">{t('ind.title', 'Weighing indicator')}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {ind.mode === 'SIM' && t('ind.sim', 'RS-232 simulator · live stream')}
            {ind.mode === 'SERIAL' && t('ind.serial', 'USB-serial indicator · 9600 8-N-1')}
            {ind.mode === 'OFF' && t('ind.off', 'Not connected')}
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2 py-1 rounded-full ${ind.connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${ind.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          {ind.connected ? t('ind.online', 'LIVE') : t('ind.offline', 'OFFLINE')}
        </span>
      </div>

      {/* LCD */}
      <div className="p-4">
        <div className="rounded-lg bg-black border border-slate-700 px-4 pt-2.5 pb-3 shadow-inner">
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
            <span className={f.isZero && ind.connected ? 'text-emerald-400' : 'text-slate-700'}>&gt;0&lt;</span>
            <span className={f.isStable && ind.connected ? 'text-emerald-400' : 'text-slate-700'}>STABLE</span>
            <span className={!f.isStable && ind.connected ? 'text-amber-400 animate-pulse' : 'text-slate-700'}>MOTION</span>
            <span className={f.isNet ? 'text-cyan-400' : 'text-slate-700'}>NET</span>
            <span className="ml-auto text-slate-500">{ind.unit}</span>
          </div>
          <div
            className={`mt-1 text-right font-mono font-bold tracking-wider tabular-nums text-[40px] leading-none ${
              !ind.connected ? 'text-slate-700' : f.isOverload ? 'text-red-500' : f.isStable ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.45)]' : 'text-amber-300'
            }`}
            aria-live="polite"
          >
            {display}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-mono text-slate-500">
            <span>Max {ind.max} {ind.unit}</span>
            <span>e = {ind.e} · d = {ind.d}</span>
          </div>
        </div>

        {/* Active slot */}
        <div className="mt-3 rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{t('ind.next', 'Capturing into')}</div>
          {activeSlot ? (
            <>
              <div className="text-sm font-bold text-white mt-0.5">{activeSlot.label}</div>
              <div className="text-[11.5px] text-slate-300">
                {t('ind.testLoad', 'Test load on receptor')}: <b className="text-saffron-500">{activeSlot.load} {ind.unit}</b>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-300 mt-0.5">{readOnly ? t('ind.sealed', 'Session sealed — capture disabled') : t('ind.allDone', 'All readings recorded ✓')}</div>
          )}
        </div>

        <button
          type="button"
          onClick={onCapture}
          disabled={!ind.connected || !activeSlot || readOnly || autoRunning}
          className={`mt-3 w-full h-12 rounded-lg font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            f.isStable ? 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950' : 'bg-amber-400 hover:bg-amber-300 text-amber-950'
          }`}
        >
          <FiCornerDownLeft className="w-5 h-5" />
          {f.isStable ? t('ind.capture', 'Capture stable reading') : t('ind.waitStable', 'Wait for stable — capture')}
        </button>

        {autoRunning ? (
          <button type="button" onClick={onStopAuto} className="mt-2 w-full h-10 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2">
            <FiSquare className="w-4 h-4" /> {t('ind.stop', 'Stop auto-capture')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onAutoRun}
            disabled={!ind.connected || !remaining || readOnly}
            className="mt-2 w-full h-10 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <FiPlay className="w-4 h-4" /> {t('ind.auto', 'Auto-capture remaining ({{n}})', { n: remaining || 0 })}
          </button>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={ind.zero} disabled={!ind.connected || readOnly} className="h-9 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-mono font-bold disabled:opacity-40">&gt;0&lt; ZERO</button>
          <button type="button" onClick={() => ind.placeLoad(0)} disabled={!ind.connected || readOnly} className="h-9 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold disabled:opacity-40">{t('ind.unload', 'Unload receptor')}</button>
        </div>
      </div>

      {/* Settings */}
      <div className="px-4 pb-4 space-y-2.5">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{t('ind.condition', 'Simulated instrument condition')}</div>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-black/40">
            {[
              ['HEALTHY', t('ind.healthy', 'Healthy')],
              ['FAULTY', t('ind.faulty', 'Faulty load cell')],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                disabled={ind.mode !== 'SIM' || readOnly}
                onClick={() => ind.setCondition(k)}
                className={`h-8 rounded text-xs font-bold ${ind.condition === k ? (k === 'HEALTHY' ? 'bg-emerald-500 text-emerald-950' : 'bg-red-500 text-white') : 'text-slate-300 hover:bg-white/10'} disabled:opacity-40`}
              >
                {label}
              </button>
            ))}
          </div>
          {ind.condition === 'FAULTY' && (
            <p className="mt-2 text-[11px] text-red-300 flex gap-1.5"><FiAlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {t('ind.faultyNote', 'Over-reads progressively (~2.6 e at Max) — readings will breach the MPE.')}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={ind.protocol}
            onChange={(e) => ind.changeProtocol(e.target.value)}
            disabled={ind.mode !== 'SIM'}
            className="flex-1 h-9 rounded-md bg-black/40 border border-white/15 text-xs text-slate-200 px-2"
            aria-label={t('ind.protocol', 'Indicator protocol')}
          >
            {PROTOCOLS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button type="button" onClick={() => setShowRaw((v) => !v)} className={`h-9 w-9 rounded-md border inline-flex items-center justify-center ${showRaw ? 'bg-white/15 border-white/30' : 'border-white/15 hover:bg-white/10'}`} title={t('ind.raw', 'Raw RS-232 frames')} aria-pressed={showRaw}>
            <FiTerminal className="w-4 h-4" />
          </button>
        </div>
        {showRaw && (
          <pre className="text-[10.5px] font-mono bg-black rounded-md p-2.5 border border-white/10 text-emerald-400 whitespace-pre-wrap break-all">
            {JSON.stringify(f.rawAscii)}
            {f.rawHex ? `\n${f.rawHex.replace(/(..)/g, '$1 ').trim()}` : ''}
          </pre>
        )}

        <div className="flex gap-2">
          {ind.connected ? (
            <button type="button" onClick={ind.disconnect} className="flex-1 h-9 rounded-md border border-white/15 text-xs font-bold text-slate-300 hover:bg-white/10 inline-flex items-center justify-center gap-1.5">
              <FiZapOff className="w-3.5 h-3.5" /> {t('ind.disconnect', 'Disconnect')}
            </button>
          ) : (
            <button type="button" onClick={() => ind.connectSim()} className="flex-1 h-9 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-bold inline-flex items-center justify-center gap-1.5">
              <FiZap className="w-3.5 h-3.5" /> {t('ind.connectSim', 'Connect simulator')}
            </button>
          )}
          {ind.serialSupported && (
            <button type="button" onClick={ind.connectSerial} className="flex-1 h-9 rounded-md border border-cyan-400/40 text-xs font-bold text-cyan-300 hover:bg-cyan-400/10 inline-flex items-center justify-center gap-1.5">
              <FiCpu className="w-3.5 h-3.5" /> {t('ind.usb', 'USB indicator')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
