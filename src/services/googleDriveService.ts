import type { GoogleDriveConfig, PhotoboothOrder, RawPhotoPayload } from '../types';

export interface GDriveUploadFile {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface GDriveUploadResult {
  folderId: string;
  folderUrl: string;
  fileCount: number;
  sharingWarning?: string;
}

export interface GDriveUploadProgress {
  uploadedFiles: number;
  totalFiles: number;
}

const MAX_BATCH_BASE64_CHARS = 1_800_000;
const MAX_BATCH_FILES = 2;

export function extractGoogleDriveFolderId(raw: string): string {
  const val = raw.trim();
  if (!val) return '';
  const folderMatch = val.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = val.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) return idMatch[1];
  return val;
}

export function validateAppsScriptWebAppUrl(raw: string): string {
  const cleanUrl = raw.trim();
  if (!cleanUrl) {
    throw new Error('URL Web App Google Apps Script belum diisi.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
  } catch {
    throw new Error('Format URL Web App tidak valid. Harus diawali https://script.google.com/...');
  }

  if (parsedUrl.hostname !== 'script.google.com') {
    throw new Error('URL Web App harus berasal dari domain script.google.com.');
  }

  if (parsedUrl.pathname.includes('/home/projects/') || parsedUrl.pathname.endsWith('/edit')) {
    throw new Error(
      'Ini URL editor Apps Script, bukan URL Web App. Klik Deploy -> Manage deployments lalu salin URL yang berakhiran /exec.'
    );
  }

  if (parsedUrl.pathname.endsWith('/dev')) {
    throw new Error(
      'URL berakhiran /dev hanya untuk uji internal Google. Gunakan URL Web App resmi yang berakhiran /exec.'
    );
  }

  if (!parsedUrl.pathname.endsWith('/exec')) {
    throw new Error('URL Web App Google Apps Script harus berakhiran /exec.');
  }

  return cleanUrl;
}

function parseDataUrlParts(dataUrl: string): { mimeType: string; base64: string } | null {
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return null;
  const header = dataUrl.slice(0, idx);
  const base64 = dataUrl.slice(idx + 1);
  if (!base64) return null;
  const match = header.match(/^data:([^;]+);base64$/i);
  return {
    mimeType: match?.[1] || 'image/png',
    base64,
  };
}

interface AppsScriptResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  folderId?: string;
  folderUrl?: string;
  fileCount?: number;
  totalFiles?: number;
  sharingWarning?: string;
}

async function postAppsScript(
  webAppUrl: string,
  body: Record<string, unknown>
): Promise<AppsScriptResponse> {
  const cleanUrl = validateAppsScriptWebAppUrl(webAppUrl);

  // Send as text/plain JSON so Google Apps Script accepts cross-origin POST without CORS preflight errors
  const response = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} dari Google Apps Script.`);
  }

  const rawText = await response.text();
  if (rawText.trimStart().startsWith('<')) {
    throw new Error(
      'Apps Script membalas halaman HTML, bukan JSON. Pastikan Deploy diset "Execute as: Me", "Who has access: Anyone", dan izin Drive sudah di-Authorize.'
    );
  }

  let parsed: AppsScriptResponse;
  try {
    parsed = JSON.parse(rawText) as AppsScriptResponse;
  } catch {
    throw new Error('Respons Google Apps Script tidak dapat dibaca sebagai JSON.');
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'Google Apps Script mengembalikan gagal.');
  }

  return parsed;
}

function buildUploadBatches(files: GDriveUploadFile[]): GDriveUploadFile[][] {
  const batches: GDriveUploadFile[][] = [];
  let current: GDriveUploadFile[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const fileChars = file.base64.length;
    const exceedsBatch =
      current.length >= MAX_BATCH_FILES ||
      (current.length > 0 && currentBytes + fileChars > MAX_BATCH_BASE64_CHARS);

    if (exceedsBatch) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(file);
    currentBytes += fileChars;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export async function testGoogleAppsScriptConnection(
  config: GoogleDriveConfig
): Promise<string> {
  const res = await postAppsScript(config.webAppUrl, {
    action: 'ping',
    secret: config.secretKey.trim(),
    rootFolderId: extractGoogleDriveFolderId(config.rootFolderId),
  });
  return res.message || 'Koneksi ke Google Apps Script berhasil.';
}

export async function uploadOrderToGoogleDrive(
  config: GoogleDriveConfig,
  order: PhotoboothOrder,
  composite4RPng: string | null,
  rawPhotos: RawPhotoPayload[],
  existingFolderId?: string,
  onProgress?: (progress: GDriveUploadProgress) => void,
  onFolderReady?: (folder: { folderId: string; folderUrl: string }) => void
): Promise<GDriveUploadResult> {
  const files: GDriveUploadFile[] = [];

  if (composite4RPng) {
    const parsed = parseDataUrlParts(composite4RPng);
    if (parsed) {
      files.push({
        filename: `WHOOPS-${order.orderCode}-4R-300DPI.png`,
        mimeType: parsed.mimeType,
        base64: parsed.base64,
      });
    }
  }

  rawPhotos.forEach((raw, idx) => {
    const parsed = parseDataUrlParts(raw.dataUrl);
    if (!parsed) return;
    const ext = parsed.mimeType.includes('png') ? 'png' : 'jpg';
    const safeName =
      raw.filename?.trim() || `Pose-${String(idx + 1).padStart(2, '0')}.${ext}`;
    files.push({
      filename: safeName,
      mimeType: parsed.mimeType,
      base64: parsed.base64,
    });
  });

  if (files.length === 0) {
    throw new Error('Tidak ada file foto valid untuk diunggah ke Google Drive.');
  }

  const cleanRootId = extractGoogleDriveFolderId(config.rootFolderId);
  let targetFolderId = extractGoogleDriveFolderId(
    existingFolderId || order.gdriveFolderId || ''
  );
  let targetFolderUrl = order.gdriveFolderUrl || '';
  let lastTotalFiles = 0;
  let sharingWarning = '';
  let uploadedSoFar = 0;

  const batches = buildUploadBatches(files);
  onProgress?.({ uploadedFiles: 0, totalFiles: files.length });

  for (const batch of batches) {
    const res = await postAppsScript(config.webAppUrl, {
      action: 'upload_order',
      secret: config.secretKey.trim(),
      rootFolderId: cleanRootId,
      orderCode: order.orderCode,
      folderId: targetFolderId,
      replaceExisting: true,
      files: batch,
    });

    if (!res.folderUrl || !res.folderId) {
      throw new Error('Google Apps Script tidak mengembalikan link folder.');
    }

    const hadFolder = Boolean(targetFolderId);
    targetFolderId = res.folderId;
    targetFolderUrl = res.folderUrl;
    if (!hadFolder) {
      onFolderReady?.({ folderId: targetFolderId, folderUrl: targetFolderUrl });
    }
    lastTotalFiles = res.totalFiles ?? uploadedSoFar + (res.fileCount ?? batch.length);
    if (res.sharingWarning) sharingWarning = res.sharingWarning;

    uploadedSoFar += batch.length;
    onProgress?.({ uploadedFiles: uploadedSoFar, totalFiles: files.length });
  }

  return {
    folderId: targetFolderId,
    folderUrl: targetFolderUrl,
    fileCount: lastTotalFiles || files.length,
    sharingWarning: sharingWarning || undefined,
  };
}

export async function uploadDoodleToGoogleDrive(
  config: GoogleDriveConfig,
  order: PhotoboothOrder,
  folderId: string | undefined,
  doodleFinalPng: string
): Promise<GDriveUploadResult> {
  const parsed = parseDataUrlParts(doodleFinalPng);
  if (!parsed) {
    throw new Error('Gambar hasil doodle tidak valid.');
  }

  const res = await postAppsScript(config.webAppUrl, {
    action: 'add_doodle',
    secret: config.secretKey.trim(),
    rootFolderId: extractGoogleDriveFolderId(config.rootFolderId),
    orderCode: order.orderCode,
    folderId: extractGoogleDriveFolderId(folderId || ''),
    replaceExisting: true,
    files: [
      {
        filename: `WHOOPS-${order.orderCode}-DOODLE-4R-300DPI.png`,
        mimeType: parsed.mimeType,
        base64: parsed.base64,
      },
    ],
  });

  if (!res.folderUrl || !res.folderId) {
    throw new Error('Google Apps Script tidak mengembalikan link folder.');
  }

  return {
    folderId: res.folderId,
    folderUrl: res.folderUrl,
    fileCount: res.totalFiles ?? res.fileCount ?? 1,
    sharingWarning: res.sharingWarning || undefined,
  };
}
