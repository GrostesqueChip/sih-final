import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Renders every page of a PDF (given as an object URL) to canvases, so the
 * certificate previews identically in every browser — no reliance on the
 * browser's built-in PDF plug-in.
 */
export default function PdfPreview({ url, className = '' }) {
  const hostRef = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    let doc;
    setState('loading');
    (async () => {
      try {
        doc = await pdfjs.getDocument(url).promise;
        const host = hostRef.current;
        if (!host || cancelled) return;
        host.innerHTML = '';
        const width = Math.min(host.clientWidth - 32, 900);
        for (let n = 1; n <= doc.numPages; n += 1) {
          // eslint-disable-next-line no-await-in-loop
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          canvas.className = 'bg-white shadow-lg mx-auto block mb-4 last:mb-0';
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
          host.appendChild(canvas);
          // eslint-disable-next-line no-await-in-loop
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
        if (!cancelled) setState('ready');
      } catch (err) {
        console.error('[PdfPreview]', err);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy?.();
    };
  }, [url]);

  return (
    <div className={`relative ${className}`}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-200 text-sm gap-3 pointer-events-none">
          <span className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Rendering document…
        </div>
      )}
      {state === 'error' && <div className="absolute inset-0 flex items-center justify-center text-white text-sm">Could not render the PDF.</div>}
      <div ref={hostRef} className="p-4" />
    </div>
  );
}
