// Optional AI box detection (Google Gemini). Admin-only and opt-in:
// the admin must confirm consent in the UI before the artwork image is sent.
// Only the blank certificate artwork is sent — never participant data.

import { Router } from 'express';
import { requireRole, type AuthedRequest } from '../auth.ts';
import { logActivity } from '../db.ts';
import { h, HttpError } from '../http.ts';

export const aiRouter = Router();
aiRouter.use(requireRole('admin'));

function configured() {
  const k = process.env.GEMINI_API_KEY;
  return !!k && k !== 'MY_GEMINI_API_KEY';
}

aiRouter.post(
  '/detect-boxes',
  h(async (req: AuthedRequest, res) => {
    if (!configured()) throw new HttpError(503, 'AI detection is not configured (GEMINI_API_KEY is not set).');
    if (req.body?.consent !== true) throw new HttpError(400, 'Consent is required before sending the artwork to Google.');
    const imageBase64 = String(req.body?.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
    const mimeType = req.body?.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    if (!imageBase64 || imageBase64.length > 20 * 1024 * 1024) throw new HttpError(400, 'Invalid image.');

    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `This is a blank certificate design. Find the empty areas or outlined placeholder boxes where
variable content belongs: recipient name, title, main message, date, QR code, passport photo, signature.
Return one entry per area with:
- "type": "text" | "qr" | "photo" | "signature"
- "label": short human-readable name (e.g. "Recipient name")
- "x","y","width","height": normalised 0..1 relative to the full image.
Do not transcribe or invent certificate wording.`;
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['text', 'qr', 'photo', 'signature'] },
              label: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
            },
            required: ['type', 'label', 'x', 'y', 'width', 'height'],
          },
        },
      },
    });
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(response.text || '[]');
    } catch {
      throw new HttpError(502, 'The AI service returned an unreadable answer.');
    }
    const clamp = (n: any) => Math.min(1, Math.max(0, Number(n) || 0));
    const boxes = (Array.isArray(parsed) ? parsed : []).slice(0, 40).map((b) => ({
      type: ['text', 'qr', 'photo', 'signature'].includes(b.type) ? b.type : 'text',
      label: String(b.label || '').slice(0, 60),
      x: clamp(b.x) * 100,
      y: clamp(b.y) * 100,
      w: clamp(b.width) * 100,
      h: clamp(b.height) * 100,
    }));
    logActivity(req.user!.id, 'ai_detection_used', `${boxes.length} boxes suggested`);
    res.json({ boxes });
  })
);
