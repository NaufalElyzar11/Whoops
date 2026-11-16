import { useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { getOrderGDriveLinkMap, type OrderGDriveLinkInfo } from '../services/demoStore';
import {
  fetchOrderMediaDataUrl,
  subscribeOrderGDriveMeta,
  subscribeSingleOrder,
} from '../services/firestoreService';
import type { PhotoboothOrder } from '../types';
import { WhoopsLogo } from './WhoopsLogo';

interface DownloadPageProps {
  orderId: string;
  onExitDownload: () => void;
}

export function DownloadPage({ orderId, onExitDownload }: DownloadPageProps) {
  const [order, setOrder] = useState<PhotoboothOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [gdriveMeta, setGdriveMeta] = useState<OrderGDriveLinkInfo | null>(
    () => getOrderGDriveLinkMap()[orderId] || null
  );

  useEffect(() => {
    setLoadingOrder(true);
    setErrorMsg(null);
    const unsub = subscribeSingleOrder(
      orderId,
      (ord) => {
        setOrder(ord);
        setLoadingOrder(false);
      },
      () => {
        setErrorMsg('Pesanan tidak ditemukan atau tautan tidak valid.');
        setLoadingOrder(false);
      }
    );
    const unsubGdrive = subscribeOrderGDriveMeta(orderId, (meta) => {
      if (meta) setGdriveMeta(meta);
    });
    return () => {
      unsub();
      unsubGdrive();
    };
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const isReady =
      order.paymentStatus === 'VERIFIED' &&
      (!order.includesDoodle || order.doodleDone);
    if (!isReady) {
      setFullImageUrl(null);
      return;
    }

    let cancelled = false;
    const kind = order.doodleDone && order.finalChunks > 0 ? 'final' : 'original';
    const chunkCount = kind === 'final' ? order.finalChunks : order.originalChunks;

    if (chunkCount <= 0) {
      setFullImageUrl(order.previewThumbUrl || null);
      return;
    }

    setLoadingImage(true);
    fetchOrderMediaDataUrl(order.id, kind, chunkCount)
      .then((url) => {
        if (!cancelled) setFullImageUrl(url || order.previewThumbUrl || null);
      })
      .catch(() => {
        if (!cancelled) setFullImageUrl(order.previewThumbUrl || null);
      })
      .finally(() => {
        if (!cancelled) setLoadingImage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    order?.id,
    order?.paymentStatus,
    order?.includesDoodle,
    order?.doodleDone,
    order?.finalChunks,
    order?.originalChunks,
    order?.previewThumbUrl,
  ]);

  return (
    <div className="min-h-screen bg-[#FDF7EE] px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <WhoopsLogo size="sm" onClick={onExitDownload} />
          <button
            onClick={onExitDownload}
            className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Ke Studio
          </button>
        </div>

        <div className="whoops-card p-6 text-center">
          {loadingOrder ? (
            <div className="py-12 flex flex-col items-center gap-2 text-sm text-[#61433B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
              <span>Memuat foto kamu...</span>
            </div>
          ) : errorMsg || !order ? (
            <div className="py-8">
              <h1 className="font-display font-bold text-2xl text-[#6D1D3A]">
                Pesanan Tidak Ditemukan
              </h1>
              <p className="text-sm text-[#61433B] mt-2 mb-5">
                {errorMsg || 'Pastikan kode QR yang dipindai masih aktif dan benar.'}
              </p>
              <button
                onClick={onExitDownload}
                className="whoops-btn whoops-btn-primary px-5 py-2.5 text-sm cursor-pointer"
              >
                Kembali ke Beranda
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs text-[#61433B] font-medium">
                <span className="font-mono-tabular font-bold text-[#3A231E]">{order.orderCode}</span>{' '}
                · {order.packageName}
              </div>
              <h1 className="font-display font-bold text-2xl text-[#3A231E] mt-1">
                Kenangan WHOOPS! Kamu
              </h1>
              <p className="font-hand text-xl text-[#61433B] mb-4">
                “oops, we made a memory.”
              </p>

              {order.paymentStatus !== 'VERIFIED' ? (
                <div className="bg-[#EFE2CE] border-2 border-[#3A231E] rounded-2xl p-5 text-sm text-[#3A231E]">
                  Pembayaran sedang menunggu verifikasi kasir ({order.paymentStatus}). Halaman ini akan otomatis diperbarui setelah terverifikasi.
                </div>
              ) : order.includesDoodle && !order.doodleDone ? (
                <div className="bg-[#F3D2DB]/70 border-2 border-[#3A231E] rounded-2xl p-5 text-sm text-[#3A231E]">
                  <Sparkles className="w-6 h-6 text-[#6D1D3A] mx-auto mb-2" />
                  Doodle custom kamu sedang dikerjakan oleh Artist ({order.workflowStatus}). Tunggu sebentar ya!
                </div>
              ) : (
                <>
                  <div className="w-full max-w-[280px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-2xl overflow-hidden bg-white flex items-center justify-center mb-5">
                    {loadingImage ? (
                      <div className="flex flex-col items-center gap-2 text-xs text-[#61433B]">
                        <Loader2 className="w-6 h-6 animate-spin text-[#6D1D3A]" />
                        <span>Menyiapkan file 300 DPI...</span>
                      </div>
                    ) : fullImageUrl ? (
                      <img
                        src={fullImageUrl}
                        alt={`WHOOPS ${order.orderCode}`}
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>

                  {fullImageUrl && (
                    <a
                      href={fullImageUrl}
                      download={`WHOOPS-${order.orderCode}-4R-300DPI.png`}
                      className="whoops-btn whoops-btn-primary w-full py-3.5 text-base inline-flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Unduh Foto 4R (300 DPI PNG)
                    </a>
                  )}

                  {gdriveMeta?.folderUrl && (
                    <a
                      href={gdriveMeta.folderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="whoops-btn whoops-btn-secondary w-full py-3 text-sm inline-flex items-center justify-center gap-2 mt-2.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Buka Folder Google Drive (Foto Mentah + 4R)
                    </a>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
