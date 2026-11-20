import { rupiah } from '../constants/defaults';
import type { PhotoboothOrder, ServicePackage } from '../types';
import { triggerBlobDownload } from './zipDownload';

export function parseOrderDate(ts: unknown): Date | null {
  if (!ts) return null;
  try {
    if (
      typeof ts === 'object' &&
      ts !== null &&
      'toDate' in ts &&
      typeof (ts as { toDate: () => Date }).toDate === 'function'
    ) {
      const d = (ts as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (ts instanceof Date) {
      return Number.isNaN(ts.getTime()) ? null : ts;
    }
    if (typeof ts === 'string' || typeof ts === 'number') {
      const d = new Date(ts);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
}

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayDateKey(): string {
  return toLocalDateKey(new Date());
}

export function getLocalDayBounds(dateKey: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day, 23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export interface PackageRecapItem {
  packageName: string;
  count: number;
  revenue: number;
}

export interface DailyRecapSummary {
  ordersForPeriod: PhotoboothOrder[];
  verifiedCount: number;
  pendingCount: number;
  rejectedCount: number;
  verifiedRevenue: number;
  pendingRevenue: number;
  printCount: number;
  doodleCount: number;
  packageBreakdown: PackageRecapItem[];
}

export function buildDailyRecap(
  orders: PhotoboothOrder[],
  dateKey: string | 'ALL'
): DailyRecapSummary {
  const ordersForPeriod =
    dateKey === 'ALL'
      ? orders
      : orders.filter((o) => {
          const d = parseOrderDate(o.createdAt);
          return d ? toLocalDateKey(d) === dateKey : false;
        });

  let verifiedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let verifiedRevenue = 0;
  let pendingRevenue = 0;
  let printCount = 0;
  let doodleCount = 0;
  const packageMap = new Map<string, PackageRecapItem>();

  for (const o of ordersForPeriod) {
    const amount = Number(o.totalAmount) || 0;
    if (o.paymentStatus === 'VERIFIED') {
      verifiedCount += 1;
      verifiedRevenue += amount;
      if (o.wantsPrint) printCount += 1;
      if (o.includesDoodle) doodleCount += 1;

      const label = o.wantsPrint && !o.packageName.toUpperCase().includes('PRINT')
        ? `${o.packageName} + Cetak 4R`
        : o.packageName;
      const prev = packageMap.get(label);
      if (prev) {
        prev.count += 1;
        prev.revenue += amount;
      } else {
        packageMap.set(label, { packageName: label, count: 1, revenue: amount });
      }
    } else if (o.paymentStatus === 'PENDING_VERIFICATION') {
      pendingCount += 1;
      pendingRevenue += amount;
    } else if (o.paymentStatus === 'REJECTED') {
      rejectedCount += 1;
    }
  }

  const packageBreakdown = Array.from(packageMap.values()).sort(
    (a, b) => b.revenue - a.revenue || b.count - a.count
  );

  return {
    ordersForPeriod,
    verifiedCount,
    pendingCount,
    rejectedCount,
    verifiedRevenue,
    pendingRevenue,
    printCount,
    doodleCount,
    packageBreakdown,
  };
}

export function formatRecapTextSummary(
  recap: DailyRecapSummary,
  periodLabel: string
): string {
  const lines: string[] = [
    `REKAP KASIR WHOOPS! PHOTOBOOTH`,
    `Periode: ${periodLabel}`,
    `Omzet Terverifikasi: ${rupiah(recap.verifiedRevenue)}`,
    `Transaksi Lunas: ${recap.verifiedCount} (Cetak 4R: ${recap.printCount}, Doodle: ${recap.doodleCount})`,
    `Menunggu Bayar: ${recap.pendingCount} (${rupiah(recap.pendingRevenue)})`,
    `Ditolak: ${recap.rejectedCount}`,
  ];

  if (recap.packageBreakdown.length > 0) {
    lines.push('', 'Rincian Paket Lunas:');
    for (const item of recap.packageBreakdown) {
      lines.push(`- ${item.packageName}: ${item.count}x (${rupiah(item.revenue)})`);
    }
  }

  return lines.join('\n');
}

export function getExpectedOrderBaseTotal(
  order: PhotoboothOrder,
  packages: ServicePackage[],
  printAddonPrice: number
): number | null {
  const pkg = packages.find((p) => p.id === order.packageId);
  if (!pkg) return null;
  const printFee = order.wantsPrint ? Number(printAddonPrice) || 0 : 0;
  return Math.max(0, (Number(pkg.digitalPrice) || 0) + printFee);
}

export function hasVoucherTag(doodleNotes?: string): boolean {
  return Boolean(doodleNotes && /\[Voucher:\s*[A-Z0-9_]+/i.test(doodleNotes));
}

export function isOrderAmountUnexpected(
  order: PhotoboothOrder,
  packages: ServicePackage[],
  printAddonPrice: number
): { unexpected: boolean; expectedTotal: number | null } {
  const expectedTotal = getExpectedOrderBaseTotal(order, packages, printAddonPrice);
  if (expectedTotal === null) {
    return { unexpected: false, expectedTotal: null };
  }
  const actual = Number(order.totalAmount) || 0;
  if (actual < expectedTotal && !hasVoucherTag(order.doodleNotes)) {
    return { unexpected: true, expectedTotal };
  }
  return { unexpected: false, expectedTotal };
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildOrdersCsv(orders: PhotoboothOrder[]): string {
  const headers = [
    'Tanggal',
    'Waktu',
    'Kode Pesanan',
    'Paket',
    'Doodle',
    'Cetak 4R',
    'Nominal (Rp)',
    'Status Bayar',
    'Workflow',
    'Catatan / Voucher',
    'Link Google Drive',
  ];

  const rows = orders.map((o) => {
    const d = parseOrderDate(o.createdAt);
    const dateStr = d ? toLocalDateKey(d) : '-';
    const timeStr = d
      ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '-';

    return [
      dateStr,
      timeStr,
      o.orderCode,
      o.packageName,
      o.includesDoodle ? 'Ya' : 'Tidak',
      o.wantsPrint ? 'Ya' : 'Tidak',
      Number(o.totalAmount) || 0,
      o.paymentStatus,
      o.workflowStatus,
      o.doodleNotes || '',
      o.gdriveFolderUrl || '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // Prepend UTF-8 BOM so Excel opens Indonesian characters cleanly
  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

export function exportOrdersToCsv(orders: PhotoboothOrder[], dateLabel: string): void {
  const csv = buildOrdersCsv(orders);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const safeLabel = dateLabel.replace(/[^a-zA-Z0-9_-]/g, '');
  triggerBlobDownload(blob, `WHOOPS-Rekap-${safeLabel || 'Pesanan'}.csv`);
}
