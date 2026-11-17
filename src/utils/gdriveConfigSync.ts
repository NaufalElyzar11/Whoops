import type { GoogleDriveConfig, ServicePackage } from '../types';
import { extractGoogleDriveFolderId } from '../services/googleDriveService';

export const GDRIVE_CONFIG_PKG_ID = 'sys_gdrive_config';
export const GDRIVE_CONFIG_CODE = 'CONFIG_GDRIVE';

export function isGDriveConfigPackage(pkg: ServicePackage): boolean {
  return pkg.id === GDRIVE_CONFIG_PKG_ID || pkg.code === GDRIVE_CONFIG_CODE;
}

export function packageToGDriveConfig(
  pkg: ServicePackage
): Pick<GoogleDriveConfig, 'webAppUrl' | 'rootFolderId'> | null {
  if (!isGDriveConfigPackage(pkg) || !pkg.description) return null;
  try {
    const parsed = JSON.parse(pkg.description) as { u?: string; r?: string };
    if (typeof parsed.u !== 'string') return null;
    return {
      webAppUrl: parsed.u.trim(),
      rootFolderId: extractGoogleDriveFolderId(parsed.r || ''),
    };
  } catch {
    return null;
  }
}

// Stored inside an inactive system document in `packages` so live Firestore rules share the Web App URL with Booth devices without exposing secretKey
export function gdriveConfigToPackage(
  config: Pick<GoogleDriveConfig, 'webAppUrl' | 'rootFolderId'>
): ServicePackage {
  const payload = JSON.stringify({
    u: config.webAppUrl.trim(),
    r: extractGoogleDriveFolderId(config.rootFolderId),
  });

  if (payload.length > 300) {
    throw new Error('Kombinasi URL Web App dan ID Folder terlalu panjang untuk disinkronkan ke cloud (maks 300 karakter).');
  }

  return {
    id: GDRIVE_CONFIG_PKG_ID,
    code: GDRIVE_CONFIG_CODE,
    name: 'GDRIVE_CONFIG',
    description: payload,
    promoText: 'SYS_CONFIG',
    digitalPrice: 0,
    includesDoodle: false,
    includesPrint: false,
    isActive: false,
    sortOrder: 1000,
  };
}
