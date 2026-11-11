import QRCode from 'qrcode';

export async function generateQrDataUrl(
  text: string,
  options?: { fgColor?: string; bgColor?: string; margin?: number; width?: number }
): Promise<string> {
  const fg = options?.fgColor || '#000000';
  const bg = options?.bgColor || '#ffffff';
  const margin = options?.margin !== undefined ? options?.margin : 1;
  const width = options?.width || 300;

  try {
    return await QRCode.toDataURL(text || 'https://verify.certigen.org', {
      errorCorrectionLevel: 'M',
      color: {
        dark: fg,
        light: bg,
      },
      margin,
      width,
    });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return '';
  }
}

export async function drawQrOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { fgColor?: string; bgColor?: string; margin?: number }
): Promise<void> {
  const dataUrl = await generateQrDataUrl(text, { ...options, width: Math.round(width * 2) });
  if (!dataUrl) return;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  const size = Math.min(width, height);
  const drawX = x + (width - size) / 2;
  const drawY = y + (height - size) / 2;

  ctx.drawImage(img, drawX, drawY, size, size);
}
