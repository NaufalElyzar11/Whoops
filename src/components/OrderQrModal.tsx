import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { rupiah } from '../constants/defaults';
import type { GDriveUploadProgress } from '../services/googleDriveService';
import type { GoogleDriveConfig, PhotoboothOrder } from '../types';
import { QrCodeBox } from './QrCodeBox';

interface OrderQrModalProps {
  order: PhotoboothOrder;
  gdriveConfig: GoogleDriveConfig;
  isUploadingGdrive: boolean;
  gdriveProgress?: GDriveUploadProgress | null;
  gdriveError: string | null;
  gdriveWarning?: string | null;
  onUploadToGdrive: (order: PhotoboothOrder) => void;
  onClose: () => void;
  onDownloadHighRes: (
    order: PhotoboothOrder,
    kind: 'original' | 'final',
    filename: string
  ) => void;
  isDownloading: boolean;
}

export function OrderQrModal({
  order,
  gdriveConfig,
  isUploadingGdrive,
  gdriveProgress,
  gdriveError,
  gdriveWarning,
  onUploadToGdrive,
  onClose,
  onDownloadHighRes,
  isDownloading,
}: OrderQrModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const gdriveFolderUrl = order.gdriveFolderUrl?.trim() || '';
  const hasGdriveFolder = Boolean(gdriveFolderUrl);
  const fallbackDownloadUrl = `${window.location.origin}${import.meta.env.BASE_URL}?download=${encodeURIComponent(order.id)}`;
  const qrTargetUrl = hasGdriveFolder ? gdriveFolderUrl : fallbackDownloadUrl;
  const mediaKind = order.doodleDone && order.finalChunks > 0 ? 'final' : 'original';
  const hasAppsScriptUrl = Boolean(gdriveConfig.webAppUrl.trim());

  return (
    <div
      className="fixed inset-0 z-50 bg-[#3A231E]/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-qr-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="whoops-card w-full max-w-2xl p-5 sm:p-6 my-auto"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#3A231E]/20">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-100 border border-[#3A231E] text-[11px] font-display font-bold text-emerald-900 mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pembayaran Terverifikasi</span>
            </div>
            <h2
              id="order-qr-modal-title"
              className="font-display font-bold text-xl sm:text-2xl text-[#3A231E]"
            >
              QR Unduh Pelanggan ({order.orderCode})
            </h2>
            <p className="text-xs text-[#61433B] mt-0.5">
              {order.packageName}
              {order.wantsPrint ? ' + Cetak 4R' : ''} |{' '}
              <b className="tabular-nums text-[#6D1D3A]">{rupiah(order.totalAmount)}</b>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela QR pelanggan"
            className="whoops-btn whoops-btn-ghost whoops-btn-compact p-2 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center mt-5">
          <div className="flex flex-col items-center justify-center bg-[#EFE2CE]/70 border-2 border-[#3A231E] rounded-2xl p-4">
            {isUploadingGdrive ? (
              <div className="py-12 px-4 flex flex-col items-center text-center gap-3">
                <Loader2
                  className="w-8 h-8 animate-spin text-[#6D1D3A]"
                  aria-hidden="true"
                />
                <div className="font-display font-bold text-sm text-[#3A231E] tabular-nums">
                  {gdriveProgress && gdriveProgress.totalFiles > 0
                    ? `Mengupload ${Math.min(gdriveProgress.uploadedFiles + 1, gdriveProgress.totalFiles)}/${gdriveProgress.totalFiles} file ke Google Drive...`
                    : 'Mengupload Foto Mentah + 4R ke Google Drive...'}
                </div>
                <p className="text-[11px] text-[#61433B] leading-relaxed">
                  QR Code langsung ke folder Google Drive akan muncul begitu upload selesai.
                </p>
              </div>
            ) : (
              <>
                {hasGdriveFolder && (
                  <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-100 border border-[#3A231E] text-[11px] font-display font-bold text-emerald-900">
                    <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      Folder GDrive ({order.gdriveUploadedCount || 'Semua'} File: Mentah + 4R)
                    </span>
                  </div>
                )}

                <QrCodeBox
                  url={qrTargetUrl}
                  size={200}
                  caption={
                    hasGdriveFolder
                      ? `Scan QR -> Folder Google Drive ${order.orderCode}`
                      : `Scan QR Unduh ${order.orderCode}`
                  }
                />

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(qrTargetUrl);
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {copiedLink
                        ? 'Tautan Disalin!'
                        : hasGdriveFolder
                          ? 'Salin Link GDrive'
                          : 'Salin Link Unduh'}
                    </span>
                  </button>

                  {hasGdriveFolder && (
                    <a
                      href={gdriveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Buka Folder</span>
                    </a>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col items-center text-center sm:items-start sm:text-left gap-3">
            {order.previewThumbUrl && (
              <div className="w-32 aspect-[1205/1795] border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white mx-auto sm:mx-0">
                <img
                  src={order.previewThumbUrl}
                  alt={`Preview ${order.orderCode}`}
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {gdriveError && (
              <div className="w-full p-2.5 rounded-xl bg-rose-100 border border-[#6D1D3A] text-[11px] text-[#6D1D3A] text-left">
                <b>Upload GDrive gagal:</b> {gdriveError}
              </div>
            )}

            {gdriveWarning && (
              <div className="w-full p-2.5 rounded-xl bg-amber-50 border border-[#3A231E] text-[11px] text-[#3A231E] text-left">
                <b>Catatan Akses Folder:</b> {gdriveWarning}
              </div>
            )}

            {!hasGdriveFolder && !isUploadingGdrive && !hasAppsScriptUrl && (
              <div className="w-full p-2.5 rounded-xl bg-[#EFE2CE] border border-[#3A231E]/60 text-[11px] text-[#61433B] text-left">
                Web App URL Google Apps Script belum diatur (tab <b>Harga, Paket &amp; Voucher</b>). Saat ini QR memakai tautan unduh lokal sementara.
              </div>
            )}

            {hasAppsScriptUrl && !isUploadingGdrive && (
              <button
                type="button"
                onClick={() => onUploadToGdrive(order)}
                className="whoops-btn whoops-btn-primary w-full py-2.5 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" aria-hidden="true" />
                <span>
                  {hasGdriveFolder
                    ? 'Upload Ulang Mentah + 4R ke GDrive'
                    : 'Upload Mentah + 4R ke Google Drive'}
                </span>
              </button>
            )}

            {order.includesDoodle && !order.doodleDone ? (
              <div className="w-full p-3 rounded-xl bg-[#F3D2DB]/75 border border-[#3A231E] text-xs text-[#3A231E] leading-relaxed">
                <div className="font-display font-bold text-[#6D1D3A] inline-flex items-center gap-1 mb-0.5">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Menunggu Doodle Artist</span>
                </div>
                <p>
                  Foto mentah &amp; 4R masuk ke folder GDrive yang sama. Begitu Doodle selesai disimpan, file Doodle otomatis ikut ditambahkan ke folder ini.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#61433B] leading-relaxed">
                {hasGdriveFolder
                  ? 'Arahkan kamera HP pelanggan ke QR Code untuk membuka folder Google Drive berisi semua foto mentah + hasil 4R.'
                  : 'Arahkan kamera HP pelanggan ke QR Code di samping untuk mengunduh hasil foto resolusi 300 DPI.'}
              </p>
            )}

            <button
              type="button"
              onClick={() =>
                onDownloadHighRes(
                  order,
                  mediaKind,
                  `WHOOPS-${order.orderCode}-4R-300DPI.png`
                )
              }
              disabled={isDownloading}
              className="whoops-btn whoops-btn-secondary w-full py-2.5 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>{isDownloading ? 'Mengunduh...' : 'Unduh PNG 300 DPI (Laptop)'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
