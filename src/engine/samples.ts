// Sample content for realistic previews (admin designer and the client's
// first step): an example participant, a neutral portrait silhouette and a
// handwritten-style signature, all generated locally — never real people.

import { findPlaceholders, normKey, resolvePlaceholders } from '../../shared/placeholders';
import { substituteRich } from '../../shared/rich';
import type { ContentConfig, TemplateLayout } from '../../shared/types';
import { draftCertificate, formatDate, PREVIEW_CERT_ID } from './batch';
import type { ImageLibrary } from './images';
import type { ResolvedCertificate } from './renderer';

const SAMPLE_VALUES: Record<string, string> = {
  name: 'Karma Dorji',
  fullname: 'Karma Dorji',
  participantname: 'Karma Dorji',
  recipientname: 'Karma Dorji',
  firstname: 'Karma',
  lastname: 'Dorji',
  cid: '10701000001',
  workshop: 'UX Design Workshop',
  programme: 'Digital Skills Programme',
  program: 'Digital Skills Programme',
  event: 'Digital Skills Programme',
  course: 'Web Development',
  training: 'Leadership Training',
  college: 'Gyalpozhing College of Information Technology',
  institution: 'Gyalpozhing College of Information Technology',
  organisation: 'Gyalpozhing College of Information Technology',
  organization: 'Gyalpozhing College of Information Technology',
  email: 'karma.dorji@example.org',
  grade: 'A',
  position: 'First Place',
  role: 'Participant',
  hours: '24',
  venue: 'Thimphu',
};

/** Example value for a placeholder name (used only in previews). */
export function sampleValue(name: string): string {
  const k = normKey(name);
  if (SAMPLE_VALUES[k] !== undefined) return SAMPLE_VALUES[k];
  if (/date/.test(k)) return formatDate(new Date(), 'D MMMM YYYY');
  if (/name/.test(k)) return 'Karma Dorji';
  if (/year/.test(k)) return String(new Date().getFullYear());
  return `Sample ${name.replace(/_/g, ' ')}`;
}

let photoP: Promise<Blob> | null = null;
let sigP: Promise<Blob> | null = null;

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create sample image'))), 'image/png'));
}

/** Neutral portrait silhouette. */
export function samplePhoto(): Promise<Blob> {
  photoP ||= (async () => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 760;
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, '#dbe7f3');
    bg.addColorStop(1, '#b8cbe0');
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#7d8fa6';
    g.beginPath();
    g.ellipse(300, 300, 125, 150, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(40, 760);
    g.bezierCurveTo(60, 540, 190, 480, 300, 480);
    g.bezierCurveTo(410, 480, 540, 540, 560, 760);
    g.closePath();
    g.fill();
    return toBlob(c);
  })();
  return photoP;
}

/** Handwritten-style example signature on a transparent background. */
export function sampleSignature(): Promise<Blob> {
  sigP ||= (async () => {
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 300;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#1e3a8a';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(80, 200);
    g.bezierCurveTo(120, 40, 170, 40, 160, 190);
    g.bezierCurveTo(150, 260, 230, 120, 260, 150);
    g.bezierCurveTo(290, 180, 300, 200, 340, 140);
    g.bezierCurveTo(380, 80, 400, 210, 450, 160);
    g.bezierCurveTo(500, 110, 520, 190, 560, 170);
    g.bezierCurveTo(610, 140, 640, 120, 700, 150);
    g.bezierCurveTo(760, 180, 800, 140, 830, 120);
    g.stroke();
    g.beginPath();
    g.moveTo(120, 235);
    g.bezierCurveTo(350, 215, 600, 225, 780, 205);
    g.lineWidth = 4;
    g.stroke();
    return toBlob(c);
  })();
  return sigP;
}

/**
 * A realistic certificate for previews: wording with example participant
 * details, the client's images (or example ones), example signatures and a
 * QR code. Used before real participant data is available.
 */
export async function realisticCertificate(
  layout: TemplateLayout,
  content: ContentConfig,
  verifyBase: string,
  fixedSignature: (boxKey: string) => Blob | null,
  images?: ImageLibrary,
  opts: { exampleTextForEmptyBoxes?: boolean } = {}
): Promise<ResolvedCertificate> {
  const cert = draftCertificate(layout, content, verifyBase, fixedSignature, images);
  const value = (tok: { key: string; name: string }) =>
    tok.key === 'certificateid' ? PREVIEW_CERT_ID : tok.key === 'row' ? '1' : tok.key === 'today' ? formatDate(new Date(), 'D MMMM YYYY') : sampleValue(tok.name);
  const fill = (text: string) => {
    const values: Record<string, string> = {};
    for (const t of findPlaceholders(text)) values[t.key] = value(t);
    return resolvePlaceholders(text, values).text;
  };
  const [photo, signature] = await Promise.all([samplePhoto(), sampleSignature()]);
  for (const b of layout.boxes) {
    if (b.type === 'text') {
      let t = cert.texts[b.key] || '';
      if (!t.trim() && opts.exampleTextForEmptyBoxes) t = b.multiline ? `${b.label}\nSecond line of example text` : `Example: ${b.label}`;
      cert.texts[b.key] = fill(t);
      const rich = cert.rich?.[b.key];
      if (rich) cert.rich![b.key] = substituteRich(rich, fill);
    } else if (b.type === 'qr') {
      const q = cert.qr[b.key];
      if (q) cert.qr[b.key] = fill(q);
      else if (opts.exampleTextForEmptyBoxes) cert.qr[b.key] = `${verifyBase}/verify/${PREVIEW_CERT_ID}`;
    } else if (b.type === 'photo') {
      if (!cert.images[b.key]) cert.images[b.key] = photo;
    } else if (b.type === 'signature') {
      const mode = content.signatures[b.key]?.mode;
      if (!cert.images[b.key] && mode !== 'none') cert.images[b.key] = fixedSignature(b.key) || signature;
      if (!cert.signers?.[b.key] && b.caption?.enabled && opts.exampleTextForEmptyBoxes) {
        (cert.signers ||= {})[b.key] = { name: b.caption.name || 'Signer name', title: b.caption.title };
      }
    }
  }
  return cert;
}
