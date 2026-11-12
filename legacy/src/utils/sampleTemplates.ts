import { CertificateTemplate, TemplateField } from '../types';

/**
 * Creates high-resolution canvas drawings of certificate artwork templates
 * and converts them to PNG blobs.
 */

export function createAcademicSampleCanvas(): { blob: Blob; dataUrl: string; width: number; height: number } {
  const width = 1920;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background - Ivory / Warm Parchment
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#fdfbf7');
  bgGrad.addColorStop(0.5, '#fbf8f0');
  bgGrad.addColorStop(1, '#f5efe1');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Outer ornate border (Deep Navy & Burnished Gold)
  ctx.strokeStyle = '#c5a059';
  ctx.lineWidth = 14;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(52, 52, width - 104, height - 104);

  ctx.strokeStyle = '#e2c589';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(62, 62, width - 124, height - 124);

  // Ornate Corner Accents
  const drawCorner = (x: number, y: number, angle: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#c5a059';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(80, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 80);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(24, 24, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#c5a059';
    ctx.beginPath();
    ctx.arc(24, 24, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  drawCorner(70, 70, 0);
  drawCorner(width - 70, 70, Math.PI / 2);
  drawCorner(width - 70, height - 70, Math.PI);
  drawCorner(70, height - 70, -Math.PI / 2);

  // Gold Seal / Emblem at top
  const sealX = width / 2;
  const sealY = 175;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sealX, sealY, 48, 0, Math.PI * 2);
  const sealGrad = ctx.createRadialGradient(sealX - 10, sealY - 10, 5, sealX, sealY, 48);
  sealGrad.addColorStop(0, '#fce59f');
  sealGrad.addColorStop(0.7, '#c5a059');
  sealGrad.addColorStop(1, '#977227');
  ctx.fillStyle = sealGrad;
  ctx.fill();
  ctx.strokeStyle = '#785b1a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Seal inner star
  ctx.fillStyle = '#ffffff';
  ctx.font = '32px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', sealX, sealY);
  ctx.restore();

  // Certificate Header Artwork (static template artwork)
  ctx.fillStyle = '#977227';
  ctx.font = '600 20px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '8px';
  ctx.fillText('ACADEMIC COUNCIL FOR HONORS & DISTINCTION', width / 2, 260);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 54px "Cinzel", Georgia, serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('CERTIFICATE OF ACHIEVEMENT', width / 2, 335);

  ctx.strokeStyle = '#c5a059';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 200, 365);
  ctx.lineTo(width / 2 + 200, 365);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 400 20px "Playfair Display", Georgia, serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('THIS IS PROUDLY CONFERRED UPON', width / 2, 415);

  // Bottom Signature Lines (artwork)
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  // Left - Certificate verification line
  ctx.beginPath();
  ctx.moveTo(180, 950);
  ctx.lineTo(480, 950);
  ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Montserrat", sans-serif';
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'center';
  ctx.fillText('OFFICIAL REGISTRATION NO.', 330, 970);

  // Center - Date line
  ctx.beginPath();
  ctx.moveTo(width / 2 - 150, 950);
  ctx.lineTo(width / 2 + 150, 950);
  ctx.stroke();
  ctx.fillText('DATE OF CONFERRAL', width / 2, 970);

  // Right - Authorized Signature line
  ctx.beginPath();
  ctx.moveTo(width - 480, 950);
  ctx.lineTo(width - 180, 950);
  ctx.stroke();
  ctx.fillText('AUTHORIZED FACULTY CHAIR', width - 330, 970);

  const dataUrl = canvas.toDataURL('image/png');
  const byteString = atob(dataUrl.split(',')[1]);
  const mimeString = 'image/png';
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeString });

  return { blob, dataUrl, width, height };
}

export function createModernSampleCanvas(): { blob: Blob; dataUrl: string; width: number; height: number } {
  const width = 1920;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Clean white canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Top modern geometric accent bar
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, '#0f172a');
  headerGrad.addColorStop(0.6, '#1e293b');
  headerGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = headerGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, 60);
  ctx.lineTo(0, 110);
  ctx.closePath();
  ctx.fill();

  // Emerald geometric sub-stripe
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.lineTo(width, 60);
  ctx.lineTo(width, 74);
  ctx.lineTo(0, 124);
  ctx.closePath();
  ctx.fill();

  // Left side subtle geometric polygons
  ctx.fillStyle = 'rgba(2, 132, 199, 0.05)';
  ctx.beginPath();
  ctx.moveTo(0, 200);
  ctx.lineTo(240, 400);
  ctx.lineTo(0, 600);
  ctx.closePath();
  ctx.fill();

  // Right side polygon
  ctx.fillStyle = 'rgba(5, 150, 105, 0.05)';
  ctx.beginPath();
  ctx.moveTo(width, 400);
  ctx.lineTo(width - 280, 650);
  ctx.lineTo(width, 900);
  ctx.closePath();
  ctx.fill();

  // Outer sleek border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  // Subtitle and header artwork
  ctx.fillStyle = '#0284c7';
  ctx.font = '600 16px "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '6px';
  ctx.fillText('GLOBAL TECH INSTITUTE & MASTERCLASS NETWORK', width / 2, 230);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 52px "Plus Jakarta Sans", sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('CERTIFICATE OF COMPLETION', width / 2, 298);

  ctx.fillStyle = '#64748b';
  ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('FOR SUCCESSFUL PARTICIPATION & DEMONSTRATED PROFICIENCY IN', width / 2, 365);

  // Bottom signature lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(180, 940);
  ctx.lineTo(460, 940);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = '12px "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '1px';
  ctx.fillText('DATE OF ISSUE', 320, 965);

  ctx.beginPath();
  ctx.moveTo(width - 460, 940);
  ctx.lineTo(width - 180, 940);
  ctx.stroke();
  ctx.fillText('VERIFIED CREDENTIAL ID', width - 320, 965);

  const dataUrl = canvas.toDataURL('image/png');
  const byteString = atob(dataUrl.split(',')[1]);
  const mimeString = 'image/png';
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeString });

  return { blob, dataUrl, width, height };
}

export function getInitialSampleTemplates(): CertificateTemplate[] {
  const academic = createAcademicSampleCanvas();
  const modern = createModernSampleCanvas();

  const academicFields: TemplateField[] = [
    {
      id: 'f-acad-1',
      key: 'student_name',
      label: 'Student Name',
      type: 'text',
      required: true,
      defaultValue: 'Eleanor Vance',
      x: 15,
      y: 43.5,
      width: 70,
      height: 9.5,
      fontFamily: 'Great Vibes',
      fontSize: 60,
      fontWeight: '400',
      color: '#1a365d',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-acad-2',
      key: 'course_title',
      label: 'Course / Honor Title',
      type: 'text',
      required: true,
      defaultValue: 'Mastery in Data Engineering & Distributed Systems',
      x: 20,
      y: 57,
      width: 60,
      height: 7,
      fontFamily: 'Playfair Display',
      fontSize: 26,
      fontWeight: '600',
      color: '#334155',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: true,
    },
    {
      id: 'f-acad-3',
      key: 'grade',
      label: 'Grade / Distinction',
      type: 'text',
      required: false,
      defaultValue: 'Passed with Highest Distinction (Summa Cum Laude)',
      x: 25,
      y: 67,
      width: 50,
      height: 5.5,
      fontFamily: 'Montserrat',
      fontSize: 18,
      fontWeight: '500',
      color: '#977227',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-acad-4',
      key: 'certificate_no',
      label: 'Certificate Number',
      type: 'text',
      required: true,
      defaultValue: 'CERT-2025-0101',
      x: 10,
      y: 84.5,
      width: 24,
      height: 4.5,
      fontFamily: 'JetBrains Mono',
      fontSize: 16,
      fontWeight: '500',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'uppercase',
      multiline: false,
      certNumberConfig: {
        autoGenerate: true,
        prefix: 'CERT-2025-',
        startNumber: 101,
        padding: 4,
      },
    },
    {
      id: 'f-acad-5',
      key: 'issue_date',
      label: 'Issue Date',
      type: 'date',
      required: true,
      defaultValue: '2025-11-04',
      x: 39,
      y: 84.5,
      width: 22,
      height: 4.5,
      fontFamily: 'Montserrat',
      fontSize: 16,
      fontWeight: '500',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
      dateFormat: 'MMMM D, YYYY',
    },
    {
      id: 'f-acad-6',
      key: 'instructor_name',
      label: 'Faculty Chair / Signature',
      type: 'text',
      required: false,
      defaultValue: 'Dr. Arthur Sterling, Ph.D.',
      x: 67,
      y: 84.5,
      width: 24,
      height: 4.5,
      fontFamily: 'Playfair Display',
      fontSize: 17,
      fontWeight: '600',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
  ];

  const modernFields: TemplateField[] = [
    {
      id: 'f-mod-1',
      key: 'recipient_name',
      label: 'Recipient Full Name',
      type: 'text',
      required: true,
      defaultValue: 'Marcus Aurelius Vance',
      x: 12,
      y: 42,
      width: 76,
      height: 9,
      fontFamily: 'Montserrat',
      fontSize: 46,
      fontWeight: '700',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'uppercase',
      multiline: false,
    },
    {
      id: 'f-mod-2',
      key: 'workshop_topic',
      label: 'Workshop Topic',
      type: 'text',
      required: true,
      defaultValue: 'Full-Stack TypeScript & Cloud Microservices Architecture',
      x: 15,
      y: 55,
      width: 70,
      height: 7.5,
      fontFamily: 'Poppins',
      fontSize: 25,
      fontWeight: '600',
      color: '#0284c7',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: true,
    },
    {
      id: 'f-mod-3',
      key: 'organization',
      label: 'Host Organization',
      type: 'text',
      required: false,
      defaultValue: 'Apex Systems Labs & Academy',
      x: 25,
      y: 66,
      width: 50,
      height: 5,
      fontFamily: 'Montserrat',
      fontSize: 17,
      fontWeight: '500',
      color: '#64748b',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-mod-4',
      key: 'completion_date',
      label: 'Completion Date',
      type: 'date',
      required: true,
      defaultValue: '2025-11-04',
      x: 11,
      y: 83.5,
      width: 22,
      height: 4.5,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
      dateFormat: 'DD/MM/YYYY',
    },
    {
      id: 'f-mod-5',
      key: 'certificate_id',
      label: 'Certificate ID',
      type: 'text',
      required: true,
      defaultValue: 'WS-8842-X',
      x: 68,
      y: 83.5,
      width: 22,
      height: 4.5,
      fontFamily: 'JetBrains Mono',
      fontSize: 16,
      fontWeight: '500',
      color: '#0f172a',
      align: 'center',
      autoShrink: true,
      transform: 'uppercase',
      multiline: false,
      certNumberConfig: {
        autoGenerate: true,
        prefix: 'WS-2025-',
        startNumber: 501,
        padding: 4,
      },
    },
  ];

  return [
    createEcbSampleTemplate(),
    {
      id: 'template-sample-academic',
      name: 'Classical Academic Honors',
      fileName: 'academic_achievement_template.png',
      fileType: 'image/png',
      blob: academic.blob,
      previewDataUrl: academic.dataUrl,
      width: academic.width,
      height: academic.height,
      fields: academicFields,
      isPublished: true,
      createdAt: Date.now() - 100000,
      updatedAt: Date.now() - 100000,
    },
    {
      id: 'template-sample-modern',
      name: 'Modern Tech Workshop',
      fileName: 'modern_tech_completion.png',
      fileType: 'image/png',
      blob: modern.blob,
      previewDataUrl: modern.dataUrl,
      width: modern.width,
      height: modern.height,
      fields: modernFields,
      isPublished: true,
      createdAt: Date.now() - 50000,
      updatedAt: Date.now() - 50000,
    },
  ];
}

export function createEcbSampleTemplate(): CertificateTemplate {
  const width = 3514;
  const height = 2489;
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = Math.round(800 * (height / width));
  const ctx = canvas.getContext('2d')!;

  // Warm parchment white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border with ECB palette: Orange #F59119, Yellow #FFF005, Navy #002C6A
  ctx.strokeStyle = '#002C6A';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  ctx.strokeStyle = '#F59119';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.strokeStyle = '#FFF005';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  const placeholderDataUrl = canvas.toDataURL('image/png');
  const byteString = atob(placeholderDataUrl.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: 'image/png' });

  const fields: TemplateField[] = [
    {
      id: 'f-ecb-1',
      key: 'header_title',
      label: 'Header / Organization',
      type: 'text',
      required: true,
      clientPermission: 'fixed',
      defaultValue: 'འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN',
      x: 25.4,
      y: 5.2,
      width: 49.2,
      height: 16.0,
      fontFamily: 'Noto Sans Tibetan',
      fontSize: 48,
      fontWeight: '700',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: true,
    },
    {
      id: 'f-ecb-2',
      key: 'qr_code',
      label: 'Security QR / Verification Code',
      type: 'text',
      required: false,
      defaultValue: 'ECB-VERIFY-2026-10212000257',
      x: 11.2,
      y: 28.2,
      width: 11.5,
      height: 16.5,
      fontFamily: 'JetBrains Mono',
      fontSize: 20,
      fontWeight: '600',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: true,
    },
    {
      id: 'f-ecb-3',
      key: 'photo',
      label: 'Official Recipient Badge / Photo',
      type: 'image',
      required: false,
      defaultValue: '/assets/aistudio/1_923d5de2.png',
      x: 77.2,
      y: 28.2,
      width: 11.5,
      height: 16.5,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-ecb-4',
      key: 'message',
      label: 'Certificate Body Text (Smart Sentence)',
      type: 'text',
      required: true,
      clientPermission: 'fully_editable',
      contentMode: 'smart_sentence',
      smartSentenceConfig: {
        sentence: 'This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.',
        templateSentence: 'This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.',
        clientWordingEditable: true,
        tags: [
          {
            key: 'name',
            label: 'Recipient Name',
            type: 'text',
            required: true,
            placeholder: 'Karma Wangchuk',
            defaultValue: 'Karma Wangchuk',
            textCase: 'capitalize_words',
            style: { bold: true, color: '#002C6A' },
          },
          {
            key: 'cid',
            label: 'Bhutan CID No. (11 digits)',
            type: 'text',
            required: true,
            placeholder: '11501002345',
            defaultValue: '11501002345',
            pattern: '^[0-9]{11}$',
            patternErrorMessage: 'CID must be exactly 11 digits',
            style: { bold: true, color: '#F59119' },
          },
          {
            key: 'course',
            label: 'Course / Event Name',
            type: 'text',
            required: true,
            placeholder: 'Local Government Election Management',
            defaultValue: 'Local Government Election Management',
            textCase: 'capitalize_words',
            style: { bold: true, color: '#002C6A' },
          },
          {
            key: 'date',
            label: 'Issuance Date',
            type: 'date',
            required: true,
            defaultValue: '2026-07-20',
            dateFormat: 'gregorian',
            style: { italic: true, color: '#002C6A' },
          },
        ],
      },
      isDynamicMessage: true,
      richFormatting: true,
      multiline: true,
      defaultValue: 'This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.',
      x: 17.2,
      y: 50.2,
      width: 65.6,
      height: 26.5,
      fontFamily: 'Poppins',
      fontSize: 44,
      fontWeight: '500',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
    },
    {
      id: 'f-ecb-5',
      key: 'date',
      label: 'Issuance Date',
      type: 'date',
      required: true,
      defaultValue: '2026-07-20',
      dateFormat: 'DD/MM/YYYY',
      x: 7.2,
      y: 83.5,
      width: 23.0,
      height: 13.5,
      fontFamily: 'Poppins',
      fontSize: 32,
      fontWeight: '600',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-ecb-6',
      key: 'signature',
      label: 'Authorized Signature & Seal',
      type: 'signature',
      required: true,
      defaultValue: 'Dasho Sonam Topgay',
      x: 67.2,
      y: 83.5,
      width: 23.5,
      height: 13.5,
      fontFamily: 'Great Vibes',
      fontSize: 50,
      fontWeight: '400',
      color: '#002C6A',
      align: 'center',
      autoShrink: true,
      transform: 'none',
      multiline: false,
    },
    // Dynamic placeholder variable fields (accessible via {name}, {cid}, {course}, {orgname} in the message)
    {
      id: 'f-ecb-var-1',
      key: 'name',
      label: 'Recipient Full Name',
      type: 'text',
      required: true,
      defaultValue: 'Karma Wangchuk',
      hidden: true,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#002C6A',
      align: 'left',
      autoShrink: false,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-ecb-var-2',
      key: 'cid',
      label: 'CID Number',
      type: 'text',
      required: true,
      defaultValue: '10212000257',
      hidden: true,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#002C6A',
      align: 'left',
      autoShrink: false,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-ecb-var-3',
      key: 'course',
      label: 'Course / Event Title',
      type: 'text',
      required: true,
      defaultValue: 'Local Government Election Management',
      hidden: true,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#002C6A',
      align: 'left',
      autoShrink: false,
      transform: 'none',
      multiline: false,
    },
    {
      id: 'f-ecb-var-4',
      key: 'orgname',
      label: 'Organization Name',
      type: 'text',
      required: false,
      defaultValue: 'Election Commission of Bhutan',
      hidden: true,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '500',
      color: '#002C6A',
      align: 'left',
      autoShrink: false,
      transform: 'none',
      multiline: false,
    },
  ];

  return {
    id: 'template-sample-ecb',
    name: 'ECB Official Certificate (Bhutan)',
    fileName: 'ECB_Certificate_Official_Boxes.png',
    fileType: 'image/png',
    blob,
    previewDataUrl: '/assets/aistudio/Untitled-1_ba49ba48.png',
    width,
    height,
    fields,
    isPublished: true,
    createdAt: Date.now() - 200000,
    updatedAt: Date.now() - 200000,
  };
}

export async function hydrateTemplateBlob(template: CertificateTemplate): Promise<CertificateTemplate> {
  if (template.previewDataUrl.startsWith('/assets/')) {
    try {
      const res = await fetch(template.previewDataUrl);
      if (res.ok) {
        const fetchedBlob = await res.blob();
        return {
          ...template,
          blob: fetchedBlob,
        };
      }
    } catch {
      // Continue with current blob
    }
  }
  return template;
}

export const SAMPLE_CSV_CONTENT = `name,cid,course,date,orgname,header_title,qr_code,signature
"Karma Wangchuk","10212000257","Local Government Election Management 2026","20/07/2026","Election Commission of Bhutan","འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN","ECB-VERIFY-10212000257","Dasho Sonam Topgay"
"Dechen Zangmo","10801002341","National Postal Ballot Administration","20/07/2026","Election Commission of Bhutan","འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN","ECB-VERIFY-10801002341","Dasho Sonam Topgay"
"Dorji Pelden","11505001928","Democracy & Civic Engagement Workshop","20/07/2026","Election Commission of Bhutan","འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN","ECB-VERIFY-11505001928","Dasho Sonam Topgay"
"Sonam Tobgay","10702003847","Electoral Dispute Resolution Masterclass","20/07/2026","Election Commission of Bhutan","འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN","ECB-VERIFY-10702003847","Dasho Sonam Topgay"
"Pema Tshering","11904000852","Returning Officer Executive Certification","20/07/2026","Election Commission of Bhutan","འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས། ELECTION COMMISSION OF BHUTAN","ECB-VERIFY-11904000852","Dasho Sonam Topgay"`;

