import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Configure pdfjs worker to the exact version available on unpkg
try {
  if (typeof window !== 'undefined') {
    // Use unpkg which reliably serves pdfjs-dist 6.5.438
    const version = pdfjsLib.version || '6.5.438';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('PDF worker configuration warning:', e);
}

export async function renderPdfFirstPageToDataUrl(
  pdfBlobOrBuffer: Blob | ArrayBuffer
): Promise<{ dataUrl: string; width: number; height: number; blob: Blob }> {
  const buffer = pdfBlobOrBuffer instanceof Blob
    ? await pdfBlobOrBuffer.arrayBuffer()
    : pdfBlobOrBuffer;

  // First try rendering through pdfjs-dist
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });

    // 10 second timeout for worker loading
    const pdfDoc = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF rendering worker timed out')), 10000)
      ),
    ]);

    const page = await pdfDoc.getPage(1);
    const defaultViewport = page.getViewport({ scale: 1.0 });
    const scale = 2.0; // Sharp 2x raster preview
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas,
    };

    await (page.render(renderContext as any) as any).promise;
    const dataUrl = canvas.toDataURL('image/png');

    // Create a PNG Blob from dataUrl
    const byteString = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const previewBlob = new Blob([ab], { type: 'image/png' });

    return {
      dataUrl,
      width: Math.round(defaultViewport.width),
      height: Math.round(defaultViewport.height),
      blob: previewBlob,
    };
  } catch (pdfjsErr) {
    console.warn('pdfjs-dist rendering encountered an issue, using pdf-lib fallback:', pdfjsErr);

    // Fallback using pdf-lib: extract dimensions and draw a clean canvas placeholder
    try {
      const pdfDoc = await PDFDocument.load(buffer);
      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();

      const canvasW = Math.round(width * 2);
      const canvasH = Math.round(height * 2);
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d')!;

      // Clean parchment background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Subtle border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, canvasW - 60, canvasH - 60);

      // PDF Badge watermark
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PDF Certificate Template', canvasW / 2, canvasH / 2 - 20);

      ctx.fillStyle = '#64748b';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Vector PDF (${Math.round(width)} × ${Math.round(height)}pt)`, canvasW / 2, canvasH / 2 + 30);
      ctx.fillText('The original PDF artwork will be used for high-fidelity export', canvasW / 2, canvasH / 2 + 70);

      const dataUrl = canvas.toDataURL('image/png');
      const blob = new Blob([buffer], { type: 'application/pdf' });

      return {
        dataUrl,
        width: Math.round(width),
        height: Math.round(height),
        blob,
      };
    } catch (fallbackErr: any) {
      throw new Error(`Unable to read PDF: ${fallbackErr.message || 'Corrupt or unsupported PDF'}`);
    }
  }
}

