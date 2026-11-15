import { rupiah } from '../constants/defaults';
import type { DiscountType, ServicePackage, VoucherCode } from '../types';

export const VOUCHER_CODE_PREFIX = 'VOUCHER_';

export function normalizeVoucherCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 24);
}

export function isVoucherPackage(pkg: ServicePackage): boolean {
  return pkg.code.startsWith(VOUCHER_CODE_PREFIX);
}

export function packageToVoucher(pkg: ServicePackage): VoucherCode {
  const rawSuffix = pkg.code.startsWith(VOUCHER_CODE_PREFIX)
    ? pkg.code.slice(VOUCHER_CODE_PREFIX.length)
    : pkg.name;
  const discountType: DiscountType =
    pkg.promoText === 'VOUCHER_PERCENT' ? 'percent' : 'fixed';
  const rawVal = Math.max(0, Number(pkg.digitalPrice) || 0);
  const discountValue = discountType === 'percent' ? Math.min(100, rawVal) : rawVal;

  return {
    id: pkg.id,
    code: normalizeVoucherCode(rawSuffix) || normalizeVoucherCode(pkg.name) || 'PROMO',
    discountType,
    discountValue,
    description: pkg.description || '',
    isActive: Boolean(pkg.isActive),
  };
}

// Stored in existing `packages` Firestore documents so live security rules allow Admin CRUD without rule redeploys
export function voucherToPackage(voucher: VoucherCode, sortOrder = 950): ServicePackage {
  const cleanCode = normalizeVoucherCode(voucher.code) || 'PROMO';
  const rawVal = Math.max(0, Math.round(Number(voucher.discountValue) || 0));
  const cleanVal =
    voucher.discountType === 'percent' ? Math.min(100, rawVal) : Math.min(10000000, rawVal);

  return {
    id: voucher.id,
    code: `${VOUCHER_CODE_PREFIX}${cleanCode}`,
    name: cleanCode,
    description: voucher.description.trim().slice(0, 300),
    promoText: voucher.discountType === 'percent' ? 'VOUCHER_PERCENT' : 'VOUCHER_FIXED',
    digitalPrice: cleanVal,
    includesDoodle: false,
    includesPrint: false,
    isActive: Boolean(voucher.isActive),
    sortOrder: Math.max(100, Math.min(1000, sortOrder)),
  };
}

export function calculateVoucherDiscount(
  subtotal: number,
  voucher: VoucherCode | null
): number {
  if (!voucher || !voucher.isActive || subtotal <= 0) return 0;
  if (voucher.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, voucher.discountValue));
    return Math.min(subtotal, Math.round((subtotal * pct) / 100));
  }
  return Math.min(subtotal, Math.max(0, voucher.discountValue));
}

export function formatVoucherBenefit(voucher: VoucherCode): string {
  if (voucher.discountType === 'percent') {
    return `${Math.min(100, Math.max(0, voucher.discountValue))}%`;
  }
  return rupiah(voucher.discountValue);
}

export function appendVoucherNote(
  doodleNotes: string,
  voucher: VoucherCode | null,
  discountAmount: number
): string {
  const base = doodleNotes.trim();
  if (!voucher || discountAmount <= 0) return base.slice(0, 300);

  const tag = `[Voucher: ${voucher.code} (-${rupiah(discountAmount)})]`;
  if (!base) return tag.slice(0, 300);

  const maxBaseLen = Math.max(0, 300 - tag.length - 1);
  return `${base.slice(0, maxBaseLen)} ${tag}`.trim().slice(0, 300);
}
