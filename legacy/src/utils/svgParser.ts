import { TemplateField, FieldType } from '../types';

/**
 * Parses an SVG file to extract placeholder elements whose id starts with 'field_'
 * (e.g., field_text_recipient, field_qr, field_image, field_signature_1)
 */
export function extractFieldsFromSvg(svgText: string): { fields: TemplateField[]; width: number; height: number } | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return null;

    let totalWidth = 1920;
    let totalHeight = 1080;

    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        totalWidth = parts[2];
        totalHeight = parts[3];
      }
    } else {
      const w = parseFloat(svgEl.getAttribute('width') || '0');
      const h = parseFloat(svgEl.getAttribute('height') || '0');
      if (w > 0 && h > 0) {
        totalWidth = w;
        totalHeight = h;
      }
    }

    const fieldElements = doc.querySelectorAll('[id^="field_"], [id^="field-"]');
    if (fieldElements.length === 0) {
      return null;
    }

    const fields: TemplateField[] = [];

    fieldElements.forEach((el, index) => {
      const id = el.getAttribute('id') || `field_${index + 1}`;
      const idLower = id.toLowerCase();

      // Determine field type from ID
      let type: FieldType = 'text';
      if (idLower.includes('qr')) {
        type = 'qr';
      } else if (idLower.includes('image') || idLower.includes('photo') || idLower.includes('logo')) {
        type = 'image';
      } else if (idLower.includes('signature') || idLower.includes('sig')) {
        type = 'signature';
      } else if (idLower.includes('date')) {
        type = 'date';
      } else if (idLower.includes('number') || idLower.includes('no')) {
        type = 'number';
      }

      // Extract geometry
      let x = 0;
      let y = 0;
      let width = 0;
      let height = 0;

      if (el.tagName.toLowerCase() === 'rect') {
        x = parseFloat(el.getAttribute('x') || '0');
        y = parseFloat(el.getAttribute('y') || '0');
        width = parseFloat(el.getAttribute('width') || '0');
        height = parseFloat(el.getAttribute('height') || '0');
      } else {
        // Fallback for paths / groups
        x = parseFloat(el.getAttribute('x') || el.getAttribute('cx') || '0');
        y = parseFloat(el.getAttribute('y') || el.getAttribute('cy') || '0');
        width = parseFloat(el.getAttribute('width') || el.getAttribute('r') || '100');
        height = parseFloat(el.getAttribute('height') || el.getAttribute('r') || '50');
      }

      if (width <= 0 || height <= 0) return;

      // Extract label and key
      const key = id.replace(/^field[_-]/, '').replace(/^(text|qr|image|signature|date)[_-]/, '') || `field_${index + 1}`;
      const label = key
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Normalize to percentages (0-100)
      const normX = Math.max(0, Math.min(100, (x / totalWidth) * 100));
      const normY = Math.max(0, Math.min(100, (y / totalHeight) * 100));
      const normW = Math.max(1, Math.min(100, (width / totalWidth) * 100));
      const normH = Math.max(1, Math.min(100, (height / totalHeight) * 100));

      fields.push({
        id: `f-${Date.now()}-${index}`,
        key,
        label,
        type,
        required: true,
        defaultValue: type === 'text' ? label : '',
        x: Number(normX.toFixed(2)),
        y: Number(normY.toFixed(2)),
        width: Number(normW.toFixed(2)),
        height: Number(normH.toFixed(2)),
        fontFamily: 'Montserrat',
        fontSize: Math.round(height * 0.5) || 28,
        fontWeight: '500',
        color: '#0f172a',
        align: 'center',
        autoShrink: true,
        transform: 'none',
        multiline: type === 'text' && normH > 10,
        qrConfig: type === 'qr' ? { contentType: 'verification_url', baseUrl: 'https://verify.certigen.org?id=', fgColor: '#000000', bgColor: '#ffffff', margin: 2 } : undefined,
        signatureConfig: type === 'signature' ? { allowedMethods: { upload: true, draw: true, type: true }, hasUnderline: true } : undefined,
        imageConfig: type === 'image' ? { fit: 'contain', borderRadius: 'rounded', allowCrop: true } : undefined,
      });
    });

    return { fields, width: totalWidth, height: totalHeight };
  } catch (err) {
    console.warn('Failed to parse SVG fields:', err);
    return null;
  }
}
