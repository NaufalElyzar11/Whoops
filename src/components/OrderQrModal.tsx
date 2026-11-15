import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Copy, Download, Sparkles, X } from 'lucide-react';
import { rupiah } from '../constants/defaults';
import type { PhotoboothOrder } from '../types';
import { QrCodeBox } from './QrCodeBox';

interface OrderQrModalProps {
  order: PhotoboothOrder;
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

  const downloadUrl = `${window.location.origin}${import.meta.env.BASE_URL}?download=${encodeURIComponent(order.id)}`;
  const mediaKind = order.doodleDone && order.finalChunks > 0 ? 'final' : 'original';

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
            <QrCodeBox
              url={downloadUrl}
              size={200}
              caption={`Scan QR untuk ${order.orderCode}`}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(downloadUrl);
                setCopiedLink(true);
                window.setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="mt-3 whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{copiedLink ? 'Tautan Disalin!' : 'Salin Tautan Unduh'}</span>
            </button>
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

            {order.includesDoodle && !order.doodleDone ? (
              <div className="w-full p-3 rounded-xl bg-[#F3D2DB]/75 border border-[#3A231E] text-xs text-[#3A231E] leading-relaxed">
                <div className="font-display font-bold text-[#6D1D3A] inline-flex items-center gap-1 mb-0.5">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Menunggu Doodle Artist</span>
                </div>
                <p>
                  Pelanggan sudah bisa scan QR sekarang. Halaman di HP pelanggan otomatis menampilkan foto final begitu Doodle selesai disimpan.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#61433B] leading-relaxed">
                Arahkan kamera HP pelanggan ke QR Code di samping untuk mengunduh hasil foto resolusi 300 DPI.
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
