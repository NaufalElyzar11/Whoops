import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Receipt,
  Sparkles,
  Store,
} from 'lucide-react';
import { rupiah } from '../../constants/defaults';
import type {
  PhotoboothOrder,
  ServicePackage,
  StoreSettings,
} from '../../types';

interface CheckoutStepProps {
  activePkgs: ServicePackage[];
  selectedPkg: ServicePackage | null;
  onSelectPackage: (pkg: ServicePackage) => void;
  wantsPrintOpt: boolean;
  setWantsPrintOpt: (val: boolean) => void;
  doodleNotes: string;
  setDoodleNotes: (val: string) => void;
  settings: StoreSettings;
  finalCompositePng: string | null;
  catalogSynced: boolean;
  isSubmittingOrder: boolean;
  orderError: string | null;
  currentOrderId: string | null;
  liveOrder: PhotoboothOrder | null;
  onSubmitOrder: () => void;
  onOpenAdmin: () => void;
  onResetBoothNow: () => void;
}

const TICKET_AUTO_RESET_SECONDS = 15;

export function CheckoutStep({
  activePkgs,
  selectedPkg,
  onSelectPackage,
  wantsPrintOpt,
  setWantsPrintOpt,
  doodleNotes,
  setDoodleNotes,
  settings,
  finalCompositePng,
  catalogSynced,
  isSubmittingOrder,
  orderError,
  currentOrderId,
  liveOrder,
  onSubmitOrder,
  onOpenAdmin,
  onResetBoothNow,
}: CheckoutStepProps) {
  const [autoResetLeft, setAutoResetLeft] = useState(TICKET_AUTO_RESET_SECONDS);
  const [holdScreen, setHoldScreen] = useState(false);

  // Auto-reset booth shortly after issuing the cashier ticket so the next guest can enter.
  useEffect(() => {
    if (!currentOrderId) {
      setAutoResetLeft(TICKET_AUTO_RESET_SECONDS);
      setHoldScreen(false);
      return;
    }
    if (holdScreen) return;

    const timer = window.setInterval(() => {
      setAutoResetLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          onResetBoothNow();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentOrderId, holdScreen, onResetBoothNow]);

  // View B: Non-blocking Ticket Screen (Cara 1: Pay Outside Booth)
  if (currentOrderId) {
    return (
      <section className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="whoops-ticket p-6 sm:p-8 text-center"
        >
          {!liveOrder ? (
            <div className="py-10 flex flex-col items-center gap-2 text-sm text-[#61433B]">
              <Loader2 className="w-7 h-7 animate-spin text-[#6D1D3A]" aria-hidden="true" />
              <span>Mencetak kode antrean kasir...</span>
            </div>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-100 border-2 border-[#3A231E] text-xs font-display font-bold text-emerald-900 mb-3">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>Pesanan Terkirim ke Kasir</span>
              </div>

              <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#3A231E]">
                Tunjukkan Kode Ini ke Penjaga
              </h1>

              {/* Big Monospace Order Code */}
              <motion.div
                initial={{ scale: 0.92 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 360, damping: 18 }}
                className="my-5 py-5 px-6 rounded-2xl bg-[#EFE2CE] border-2 border-dashed border-[#3A231E]"
              >
                <div className="text-xs font-display font-semibold text-[#61433B] uppercase tracking-wider">
                  Kode Pesanan Kamu
                </div>
                <div className="font-mono-tabular font-bold text-4xl sm:text-5xl text-[#6D1D3A] tracking-wider mt-1">
                  {liveOrder.orderCode}
                </div>
                <div className="mt-2.5 text-sm font-display font-semibold text-[#3A231E]">
                  {liveOrder.packageName}
                  {liveOrder.wantsPrint ? ' + Cetak 4R' : ''}
                  {' | '}
                  <span className="text-[#6D1D3A] tabular-nums">{rupiah(liveOrder.totalAmount)}</span>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left mb-5">
                {[
                  {
                    step: '1',
                    title: 'Keluar dari Booth',
                    desc: `Sebutkan kode ${liveOrder.orderCode} di meja kasir luar.`,
                  },
                  {
                    step: '2',
                    title: 'Bayar di Penjaga',
                    desc: `Bayar QRIS atau tunai sebesar ${rupiah(liveOrder.totalAmount)}.`,
                  },
                  {
                    step: '3',
                    title: 'Scan QR & Ambil',
                    desc: 'Scan QR unduh di layar kasir & ambil cetak 4R.',
                  },
                ].map((item) => (
                  <div key={item.step} className="whoops-card-sm p-3 bg-[#FDF7EE]">
                    <div className="font-mono-tabular text-xs font-bold text-[#6D1D3A]">
                      LANGKAH {item.step}
                    </div>
                    <div className="font-display font-bold text-sm text-[#3A231E] mt-0.5">
                      {item.title}
                    </div>
                    <p className="text-xs text-[#61433B] mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* Booth Auto-Reset Bar */}
              <div className="bg-[#F3D2DB]/55 border-2 border-[#3A231E] rounded-2xl p-3.5 mb-5">
                <div className="flex items-center justify-between text-xs font-display font-semibold text-[#3A231E] mb-1.5 tabular-nums">
                  <span>
                    {holdScreen
                      ? 'Layar ditahan sementara agar kamu bisa mencatat kode'
                      : 'Booth otomatis siap untuk pelanggan berikutnya dalam'}
                  </span>
                  {!holdScreen && (
                    <span className="font-mono-tabular font-bold text-[#6D1D3A]">
                      {autoResetLeft}s
                    </span>
                  )}
                </div>
                {!holdScreen && (
                  <div className="h-2 rounded-full bg-[#FDF7EE] border border-[#3A231E]/40 overflow-hidden">
                    <div
                      className="h-full bg-[#6D1D3A] transition-all duration-1000 linear"
                      style={{ width: `${(autoResetLeft / TICKET_AUTO_RESET_SECONDS) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setHoldScreen((h) => !h)}
                  className="whoops-btn whoops-btn-ghost px-4 py-2.5 text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {holdScreen ? (
                    <>
                      <Play className="w-4 h-4" aria-hidden="true" />
                      <span>Lanjutkan Auto-Reset</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" aria-hidden="true" />
                      <span>Tahan Layar Sebentar</span>
                    </>
                  )}
                </button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={onResetBoothNow}
                  className="whoops-btn whoops-btn-primary px-6 py-2.5 text-sm sm:text-base cursor-pointer"
                >
                  Selesai &amp; Reset Booth Sekarang
                </motion.button>
              </div>
            </>
          )}
        </motion.div>
      </section>
    );
  }

  // View A: Package Selection & Submit to Outside Cashier
  const effectivePkg = selectedPkg || activePkgs[0] || null;
  const printFee = wantsPrintOpt ? settings.printAddonPrice : 0;
  const total = effectivePkg ? effectivePkg.digitalPrice + printFee : 0;

  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
      {/* Left: Package Options (Selectable after seeing Final Preview) */}
      <div className="md:col-span-7 whoops-card p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-xs font-display font-semibold text-[#6D1D3A]">
                Langkah 5 dari 5
              </p>
              <h1 className="font-display font-bold text-2xl text-[#3A231E]">
                Pilih Paket &amp; Lanjut ke Kasir
              </h1>
            </div>
            <span className="font-display font-bold text-xs text-[#6D1D3A] bg-[#EFE2CE] px-2.5 py-1 rounded-lg border border-[#3A231E]">
              @azzzahrraaaa
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {activePkgs.map((p) => {
              const isSelected = effectivePkg?.id === p.id;
              const pkgBaseTotal =
                p.digitalPrice + (p.includesPrint ? settings.printAddonPrice : 0);
              return (
                <motion.button
                  key={p.id}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelectPackage(p)}
                  className={`rounded-2xl border-2 p-3.5 text-left flex flex-col justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#F3D2DB]/75 border-[#3A231E] ring-3 ring-[#6D1D3A] shadow-[3px_3px_0_#3A231E]'
                      : 'bg-[#FDF7EE] border-[#3A231E]/70 hover:bg-[#EFE2CE]/70'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-display font-bold uppercase text-[#6D1D3A]">
                        {p.promoText || (p.includesDoodle ? 'Doodle' : 'Digital')}
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[#6D1D3A] text-[#FDF7EE] flex items-center justify-center">
                          <Check className="w-3 h-3" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-sm text-[#3A231E]">
                      {p.name}
                    </div>
                    <p className="text-[11px] text-[#61433B] mt-1 leading-snug">
                      {p.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-dashed border-[#3A231E]/25 font-display font-bold text-base text-[#6D1D3A] tabular-nums">
                    {rupiah(pkgBaseTotal)}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {effectivePkg?.code === 'PHOTO_ONLY' && (
            <div className="mb-4">
              <div className="text-xs font-display font-semibold text-[#3A231E] mb-2">
                Opsi Tambahan Cetak 4R
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setWantsPrintOpt(false)}
                  className={`whoops-btn py-2.5 text-xs cursor-pointer ${
                    !wantsPrintOpt ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                  }`}
                >
                  Digital Only
                </button>
                <button
                  type="button"
                  onClick={() => setWantsPrintOpt(true)}
                  className={`whoops-btn py-2.5 text-xs cursor-pointer tabular-nums ${
                    wantsPrintOpt ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                  }`}
                >
                  + Cetak 4R (+{rupiah(settings.printAddonPrice)})
                </button>
              </div>
            </div>
          )}

          {effectivePkg?.includesDoodle && (
            <div>
              <label
                htmlFor="doodle-notes-input"
                className="flex items-center gap-1.5 text-xs font-display font-semibold mb-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#6D1D3A]" aria-hidden="true" />
                <span>Request Tema Doodle (Opsional)</span>
              </label>
              <textarea
                id="doodle-notes-input"
                rows={2}
                maxLength={300}
                value={doodleNotes}
                onChange={(e) => setDoodleNotes(e.target.value)}
                placeholder="Misal: tambah gambar bintang, pita pink, dan tanggal hari ini"
                className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 bg-white text-sm"
              />
            </div>
          )}
        </div>

        <div className="mt-4 bg-[#EFE2CE] border-2 border-[#3A231E] rounded-2xl p-4 text-sm">
          <div className="flex justify-between mb-1">
            <span>
              Layanan Digital {effectivePkg?.includesDoodle ? '+ Custom Doodle' : ''}
            </span>
            <b className="tabular-nums">{rupiah(effectivePkg?.digitalPrice || 0)}</b>
          </div>
          <div className="flex justify-between mb-2">
            <span>Biaya Cetak 4R</span>
            <b className="tabular-nums">
              {wantsPrintOpt ? rupiah(settings.printAddonPrice) : 'Rp 0 (Digital Only)'}
            </b>
          </div>
          <div className="border-t border-[#3A231E]/25 pt-2 flex justify-between font-display font-bold text-xl text-[#6D1D3A] tabular-nums">
            <span>Total Bayar di Kasir</span>
            <span>{rupiah(total)}</span>
          </div>
        </div>
      </div>

      {/* Right: Cashier Handover Card (Cara 1 - Pay Outside Booth) */}
      <div className="md:col-span-5 whoops-card p-5 flex flex-col justify-between text-center">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F3D2DB] border border-[#3A231E] text-xs font-display font-bold text-[#6D1D3A] mb-3">
            <Store className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Bayar di Meja Penjaga</span>
          </div>

          <h2 className="font-display font-bold text-xl sm:text-2xl text-[#3A231E]">
            Siap Lanjut ke Kasir?
          </h2>
          <p className="text-xs text-[#61433B] mt-1 mb-4 leading-relaxed">
            Pembayaran QRIS atau tunai dilakukan di meja penjaga di luar booth agar booth tidak macet.
          </p>

          <div className="bg-[#EFE2CE]/75 border-2 border-[#3A231E] rounded-2xl p-4 flex items-center gap-4 text-left">
            {finalCompositePng && (
              <div className="w-20 aspect-[1205/1795] rounded-xl overflow-hidden border-2 border-[#3A231E] bg-white shrink-0">
                <img
                  src={finalCompositePng}
                  alt="Mini preview 4R"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-display font-semibold text-[#61433B]">
                Total Tagihan ({settings.qrisLabel})
              </div>
              <div className="font-display font-bold text-2xl text-[#6D1D3A] tabular-nums mt-0.5">
                {rupiah(total)}
              </div>
              <p className="text-[11px] text-[#61433B] mt-1 leading-snug">
                Setelah klik tombol di bawah, bawa kode pesanan ke kasir untuk bayar &amp; scan QR unduh foto.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          {orderError && (
            <div className="mb-3 p-3 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A] text-left">
              {orderError}
            </div>
          )}

          {!catalogSynced ? (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="whoops-btn whoops-btn-secondary w-full py-3.5 text-sm cursor-pointer"
            >
              Login Admin Dashboard untuk Aktifkan Cloud Sync
            </button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onSubmitOrder}
              disabled={isSubmittingOrder || !effectivePkg || !finalCompositePng}
              className="whoops-btn whoops-btn-primary w-full py-4 text-base inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmittingOrder ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span>Mengirim ke Kasir...</span>
                </>
              ) : (
                <>
                  <Receipt className="w-5 h-5" aria-hidden="true" />
                  <span>KIRIM KE KASIR &amp; DAPAT KODE</span>
                </>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </section>
  );
}
