# Renders the downloaded PDFs to PNG (~220 dpi) and pulls the QR code out of the
# certificate, for the film: assets/capture/pdf-*.png and qr-pass.png.
#
#   python tools/pdf2png.py <dir with cert-pass.pdf, cert-reject.pdf, datasheet.pdf>
import os, sys
import pymupdf as fitz  # pip install pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'capture')
src = sys.argv[1]
for name in ['cert-pass', 'cert-reject', 'datasheet']:
    doc = fitz.open(os.path.join(src, f'{name}.pdf'))
    for i, page in enumerate(doc):
        page.get_pixmap(dpi=220).save(os.path.join(OUT, f'pdf-{name}-p{i + 1}.png'))
        text = page.get_text()
        for line in text.splitlines():
            if 'verify' in line.lower() or 'localhost' in line or 'vercel' in line:
                print(f'{name} p{i + 1}: {line.strip()[:110]}')
    print(name, len(doc), 'pages')

# the QR is the square image in the bottom-right quarter of the certificate's first page
doc = fitz.open(os.path.join(src, 'cert-pass.pdf'))
page = doc[0]
for info in page.get_image_info(xrefs=True):
    x0, y0, x1, y1 = info['bbox']
    if x0 > page.rect.width / 2 and y0 > page.rect.height / 2 and abs(info['width'] - info['height']) <= 2:
        pix = fitz.Pixmap(doc, info['xref'])
        if pix.n - pix.alpha >= 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        pix.save(os.path.join(OUT, 'qr-pass.png'))
        print('qr', pix.width, 'px')
        break
