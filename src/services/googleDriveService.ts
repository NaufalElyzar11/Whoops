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

async function postAppsScript(webAppUrl: string, body: Record<string, unknown>) {
  const cleanUrl = webAppUrl.trim();
  if (!cleanUrl) {
    throw new Error('URL Web App Google Apps Script belum diisi.');
  }

  // Send as text/plain JSON so Google Apps Script accepts cross-origin POST without CORS preflight errors
  const response = await fetch(cleanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} dari Google Apps Script.`);
  }

  const parsed = (await response.json()) as {
    ok?: boolean;
    error?: string;
    message?: string;
    folderId?: string;
    folderUrl?: string;
    fileCount?: number;
  };

  if (!parsed.ok) {
    throw new Error(parsed.error || 'Google Apps Script mengembalikan gagal.');
  }

  return parsed;
}

export async function testGoogleAppsScriptConnection(
  config: GoogleDriveConfig
): Promise<string> {
  const res = await postAppsScript(config.webAppUrl, {
    action: 'ping',
    secret: config.secretKey.trim(),
    rootFolderId: config.rootFolderId.trim(),
  });
  return res.message || 'Koneksi ke Google Apps Script berhasil.';
}

export async function uploadOrderToGoogleDrive(
  config: GoogleDriveConfig,
  order: PhotoboothOrder,
  composite4RPng: string | null,
  rawPhotos: RawPhotoPayload[],
  existingFolderId?: string
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

  const res = await postAppsScript(config.webAppUrl, {
    action: 'upload_order',
    secret: config.secretKey.trim(),
    rootFolderId: config.rootFolderId.trim(),
    orderCode: order.orderCode,
    folderId: existingFolderId || order.gdriveFolderId || '',
    files,
  });

  if (!res.folderUrl || !res.folderId) {
    throw new Error('Google Apps Script tidak mengembalikan link folder.');
  }

  return {
    folderId: res.folderId,
    folderUrl: res.folderUrl,
    fileCount: res.fileCount ?? files.length,
  };
}

export async function uploadDoodleToGoogleDrive(
  config: GoogleDriveConfig,
  order: PhotoboothOrder,
  folderId: string,
  doodleFinalPng: string
): Promise<GDriveUploadResult> {
  const parsed = parseDataUrlParts(doodleFinalPng);
  if (!parsed) {
    throw new Error('Gambar hasil doodle tidak valid.');
  }

  const res = await postAppsScript(config.webAppUrl, {
    action: 'add_doodle',
    secret: config.secretKey.trim(),
    rootFolderId: config.rootFolderId.trim(),
    orderCode: order.orderCode,
    folderId,
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
    fileCount: res.fileCount ?? 1,
  };
}
