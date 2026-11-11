import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Gemini client server-side with user-agent header
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Gemini endpoint to detect placeholder boxes from certificate templates
  app.post('/api/detect-placeholders', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }

      const prompt = `Analyze this certificate template image. It was designed in Adobe Illustrator or graphic software and contains outlined placeholder boxes or labeled regions marking where dynamic text, QR code, portrait photo/badge, or signature should be placed.
Some boxes have text labels inside them like "Text", "Recipient Name", "QR code", "Image", "Signature", "Date", "Certificate No", etc.
All other graphic elements (borders, decorative corners, logos, seals, colored stripes, watermarks, background artwork) are fixed background and must stay unchanged.

Detect every outlined placeholder box or designated dynamic field region and return:
1. "id": a unique string identifier (e.g. "field_recipient", "field_qr", "field_signature")
2. "type": one of "text", "qr", "image", "signature"
3. "label": clear human-readable name (e.g. "Recipient Name", "Course Title", "Verification QR Code", "Authorized Signature", "Issue Date")
4. "x": normalized left coordinate from 0.0 to 1.0 (relative to total image width)
5. "y": normalized top coordinate from 0.0 to 1.0 (relative to total image height)
6. "width": normalized box width from 0.0 to 1.0
7. "height": normalized box height from 0.0 to 1.0
8. "fontSizeEstimate": estimated font size in pixels (e.g. 24, 36, 48)
9. "align": text alignment ("left", "center", or "right")

Coordinates MUST be normalized between 0 and 1.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/png',
                  data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['text', 'qr', 'image', 'signature'] },
                label: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
                fontSizeEstimate: { type: Type.NUMBER },
                align: { type: Type.STRING, enum: ['left', 'center', 'right'] },
              },
              required: ['id', 'type', 'label', 'x', 'y', 'width', 'height'],
            },
          },
        },
      });

      const jsonText = response.text || '[]';
      const parsed = JSON.parse(jsonText);
      return res.json({ placeholders: parsed });
    } catch (err: any) {
      console.error('Gemini detection error:', err);
      return res.status(500).json({ error: err.message || 'Failed to detect placeholders' });
    }
  });

  // Serve static or Vite middleware
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Certificate Template Studio running at http://localhost:${PORT}`);
  });
}

startServer();
