// Renders a template with example data, entirely in the browser. Used for the
// Super Admin test sandbox and to auto-generate a template's reference image.
// Nothing is sent to the server and no certificate IDs are issued.

import { fetchFile, getConfig, verifyBaseUrl } from '../lib/api';
import type { ContentConfig, TemplateLayout } from '../../shared/types';
import { emptyContent } from './batch';
import { CertificateRenderer } from './renderer';
import { realisticCertificate } from './samples';
import { canvasToPngBlob, renderPdfPage } from './pdfRaster';

/** Certificate ID printed on test certificates (never valid on the verification page). */
export const TEST_CERT_ID = 'CG-TEST-0000-0000';

export async function loadRenderer(layout: TemplateLayout) {
  return CertificateRenderer.load(layout, fetchFile);
}

export async function renderTestPdf(
  renderer: CertificateRenderer,
  opts: { content?: ContentConfig; values?: Record<string, string>; photo?: Blob | null } = {}
): Promise<Uint8Array> {
  const layout = renderer.layout;
  const cfg = await getConfig().catch(() => null);
  const cert = await realisticCertificate(layout, opts.content || emptyContent(layout), verifyBaseUrl(cfg), (k) => renderer.fixedSignature(k), undefined, {
    exampleTextForEmptyBoxes: true,
    values: opts.values,
    certificateId: TEST_CERT_ID,
    photo: opts.photo,
  });
  const { bytes } = await renderer.renderSingle(cert);
  return bytes;
}

/** PNG of page 1 of a sample certificate (for the reference image shown to users). */
export async function renderSamplePng(layout: TemplateLayout, width = 1600): Promise<Blob> {
  const renderer = await loadRenderer(layout);
  const bytes = await renderTestPdf(renderer);
  const canvas = await renderPdfPage(bytes, 0, width, undefined, 1);
  return canvasToPngBlob(canvas);
}
