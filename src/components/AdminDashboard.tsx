import { useEffect, useState } from 'react';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  CheckCircle2,
  Download,
  Loader2,
  LogIn,
  LogOut,
  PenTool,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  Upload,
} from 'lucide-react';
import { formatOrderTime, rupiah } from '../constants/defaults';
import { auth, googleProvider } from '../firebase';
import {
  fetchOrderMediaDataUrl,
  markOrderPrinted,
  rejectOrderPayment,
  saveFrame,
  savePackage,
  saveStoreSettings,
  seedInitialCatalogIfEmpty,
  subscribeOrders,
  updateOrderWorkflow,
  verifyOrderPayment,
} from '../services/firestoreService';
import type {
  AdminTab,
  PhotoFrame,
  PhotoboothOrder,
  ServicePackage,
  StoreSettings,
  WorkflowStatus,
} from '../types';
import { DoodleStudioModal } from './DoodleStudioModal';
import { FramePreviewCanvas } from './FramePreviewCanvas';
import { OrderQrModal } from './OrderQrModal';

interface AdminDashboardProps {
  user: User | null;
  authLoading: boolean;
  packages: ServicePackage[];
  frames: PhotoFrame[];
  settings: StoreSettings;
}

const WORKFLOW_OPTIONS: WorkflowStatus[] = [
  'Waiting for Payment',
  'Waiting for Doodle',
  'In Progress',
  'Doodle Completed',
  'Ready for Download',
  'Ready to Print',
  'Completed',
];

export function AdminDashboard({
  user,
  authLoading,
  packages,
  frames,
  settings,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [orders, setOrders] = useState<PhotoboothOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'>('ALL');
  const [activeDoodleOrder, setActiveDoodleOrder] = useState<PhotoboothOrder | null>(null);
  const [activeQrOrder, setActiveQrOrder] = useState<PhotoboothOrder | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Settings & package local editing buffers
  const [printAddonDraft, setPrintAddonDraft] = useState<number>(settings.printAddonPrice);
  const [qrisLabelDraft, setQrisLabelDraft] = useState<string>(settings.qrisLabel);
  const [pkgDrafts, setPkgDrafts] = useState<Record<string, ServicePackage>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // New Frame Form
  const [newFrameName, setNewFrameName] = useState('');
  const [newFrameCategory, setNewFrameCategory] = useState('Custom');
  const [newFrameType, setNewFrameType] = useState<'vector' | 'image'>('vector');
  const [newFrameBg, setNewFrameBg] = useState('#6D1D3A');
  const [newFrameTrim, setNewFrameTrim] = useState('#FDF7EE');
  const [newFrameLabelColor, setNewFrameLabelColor] = useState('#FDF7EE');
  const [newFrameOverlayData, setNewFrameOverlayData] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  useEffect(() => {
    setPrintAddonDraft(settings.printAddonPrice);
    setQrisLabelDraft(settings.qrisLabel);
  }, [settings.printAddonPrice, settings.qrisLabel]);

  useEffect(() => {
    const map: Record<string, ServicePackage> = {};
    packages.forEach((p) => {
      map[p.id] = { ...p };
    });
    setPkgDrafts(map);
  }, [packages]);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;
    setOrdersLoading(true);
    setAccessError(null);

    seedInitialCatalogIfEmpty()
      .then(() => {
        unsub = subscribeOrders((list) => {
          setOrders(list);
          setOrdersLoading(false);
        });
      })
      .catch(() => {
        setAccessError(
          `Akun ${user.email} tidak memiliki izin Admin di Firestore. Masuk menggunakan akun Google Admin studio.`
        );
        setOrdersLoading(false);
      });

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login error:', err);
      setAuthError('Gagal masuk dengan Google. Pastikan pop-up diizinkan pada browser.');
    }
  };

  const handleDownloadHighRes = async (
    order: PhotoboothOrder,
    kind: 'original' | 'final',
    filename: string
  ) => {
    setDownloadingOrderId(order.id);
    try {
      const count = kind === 'final' ? order.finalChunks : order.originalChunks;
      const dataUrl =
        (await fetchOrderMediaDataUrl(order.id, kind, count)) || order.previewThumbUrl;
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingOrderId(null);
    }
  };

  const handleSaveSettings = async () => {
    setSavingId('settings');
    try {
      await saveStoreSettings({
        ...settings,
        printAddonPrice: printAddonDraft,
        qrisLabel: qrisLabelDraft,
      });
      showToast('Pengaturan harga cetak & QRIS tersimpan.');
    } catch {
      showToast('Gagal menyimpan pengaturan ke Firestore.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSavePackage = async (pkgId: string) => {
    const draft = pkgDrafts[pkgId];
    if (!draft) return;
    setSavingId(pkgId);
    try {
      await savePackage(draft);
      showToast(`Paket "${draft.name}" berhasil diperbarui.`);
    } catch {
      showToast(`Gagal memperbarui paket "${draft.name}".`);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateFrame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFrameName.trim()) return;
    if (newFrameType === 'image' && !newFrameOverlayData) {
      showToast('Silakan unggah gambar overlay PNG frame terlebih dahulu.');
      return;
    }
    setSavingId('new-frame');
    try {
      const id = `f-${Date.now()}`;
      await saveFrame({
        id,
        name: newFrameName.trim(),
        category: newFrameCategory.trim() || 'Custom',
        type: newFrameType,
        bg: newFrameBg,
        trim: newFrameTrim,
        labelColor: newFrameLabelColor,
        overlayImageData: newFrameType === 'image' ? newFrameOverlayData : '',
        active: true,
        sortOrder: frames.length + 1,
      });
      setNewFrameName('');
      setNewFrameOverlayData('');
      showToast('Frame baru berhasil ditambahkan.');
    } catch {
      showToast('Gagal menyimpan frame baru ke Firestore.');
    } finally {
      setSavingId(null);
    }
  };

  const handleFramePngUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (reader.result.length > 740000) {
          showToast('Ukuran PNG overlay maksimal ~500 KB agar sinkron cepat.');
          return;
        }
        setNewFrameOverlayData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  if (authLoading) {
    return (
      <div className="whoops-card max-w-md mx-auto mt-10 p-10 text-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#6D1D3A] mx-auto mb-3" />
        <p className="text-sm text-[#61433B]">Memeriksa sesi Admin...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="whoops-card max-w-md mx-auto mt-10 p-8 text-center">
        <h1 className="font-display font-bold text-2xl text-[#3A231E]">
          Masuk Admin Dashboard
        </h1>
        <p className="text-sm text-[#61433B] mt-2 mb-6 leading-relaxed">
          Masuk dengan akun Google Studio untuk memverifikasi QRIS, mengerjakan doodle, mengekspor cetak 4R, dan mengelola paket & frame.
        </p>
        {authError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-100 border border-[#6D1D3A] text-xs text-[#6D1D3A]">
            {authError}
          </div>
        )}
        <button
          onClick={handleGoogleLogin}
          className="whoops-btn whoops-btn-primary w-full py-3 text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          Masuk dengan Google
        </button>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="whoops-card max-w-md mx-auto mt-10 p-8 text-center">
        <h2 className="font-display font-bold text-2xl text-[#6D1D3A]">Akses Ditolak</h2>
        <p className="text-sm text-[#61433B] mt-2 mb-6">{accessError}</p>
        <button
          onClick={() => signOut(auth)}
          className="whoops-btn whoops-btn-secondary px-5 py-2.5 text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Ganti Akun Google
        </button>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'ALL' || o.paymentStatus === statusFilter;
    const matchesSearch =
      !searchTerm.trim() ||
      o.orderCode.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      o.packageName.toLowerCase().includes(searchTerm.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = orders.filter((o) => o.paymentStatus === 'PENDING_VERIFICATION').length;
  const doodleOrders = orders.filter((o) => o.includesDoodle);
  const printOrders = orders.filter(
    (o) => o.paymentStatus === 'VERIFIED' && o.wantsPrint
  );

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'orders', label: pendingCount > 0 ? `Orders (${pendingCount})` : 'Orders' },
    { id: 'doodle', label: 'Doodle Queue & Upload' },
    { id: 'print', label: 'Print Queue' },
    { id: 'packages', label: 'Service & Packages' },
    { id: 'frames', label: 'Frames' },
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whoops-btn px-3.5 py-2 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id ? 'whoops-btn-primary' : 'whoops-btn-ghost'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[#61433B] hidden sm:inline">{user.email}</span>
          <button
            onClick={() => signOut(auth)}
            className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="whoops-card-sm px-4 py-2.5 bg-emerald-50 text-emerald-900 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* TAB 1: ORDERS */}
      {activeTab === 'orders' && (
        <div className="whoops-card overflow-hidden">
          <div className="p-4 border-b border-[#3A231E]/15 flex flex-wrap items-center justify-between gap-3 bg-[#EFE2CE]/40">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#61433B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari kode WHP-..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border-2 border-[#3A231E] rounded-xl bg-white"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['ALL', 'Semua'],
                  ['PENDING_VERIFICATION', pendingCount > 0 ? `Menunggu (${pendingCount})` : 'Menunggu'],
                  ['VERIFIED', 'Terverifikasi'],
                  ['REJECTED', 'Ditolak'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold cursor-pointer border ${
                    statusFilter === val
                      ? 'bg-[#6D1D3A] text-[#FDF7EE] border-[#3A231E]'
                      : 'bg-white text-[#3A231E] border-[#3A231E]/30 hover:bg-[#EFE2CE]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#EFE2CE] font-display text-[11px] uppercase tracking-wider text-[#3A231E]">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Paket</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status Bayar</th>
                  <th className="py-3 px-4">Workflow</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#61433B]">
                      Memuat pesanan dari Firestore...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#61433B]">
                      Belum ada pesanan yang cocok. Pesanan baru dari Booth akan muncul otomatis di sini.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-t border-[#3A231E]/10 hover:bg-[#EFE2CE]/30"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono-tabular font-bold text-[#3A231E]">
                          {o.orderCode}
                        </div>
                        <div className="text-[11px] text-[#61433B] tabular-nums">
                          {formatOrderTime(o.createdAt)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {o.packageName}
                        {o.wantsPrint ? ' + Print' : ''}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-[#6D1D3A] tabular-nums">
                        {rupiah(o.totalAmount)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-md border border-[#3A231E]/40 text-[11px] font-display font-semibold ${
                            o.paymentStatus === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-900'
                              : o.paymentStatus === 'REJECTED'
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {o.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#3A231E]">{o.workflowStatus}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {o.paymentStatus === 'PENDING_VERIFICATION' ? (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await verifyOrderPayment(o);
                                  showToast(`Pesanan ${o.orderCode} terverifikasi.`);
                                  setActiveQrOrder({ ...o, paymentStatus: 'VERIFIED' });
                                } catch {
                                  showToast(`Gagal memverifikasi pesanan ${o.orderCode}.`);
                                }
                              }}
                              className="whoops-btn whoops-btn-primary whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
                            >
                              VERIFIKASI
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await rejectOrderPayment(o.id);
                                  showToast(`Pesanan ${o.orderCode} ditolak.`);
                                } catch {
                                  showToast(`Gagal menolak pesanan ${o.orderCode}.`);
                                }
                              }}
                              className="whoops-btn whoops-btn-ghost whoops-btn-compact px-2.5 py-1 text-[11px] cursor-pointer"
                            >
                              TOLAK
                            </button>
                          </div>
                        ) : o.paymentStatus === 'VERIFIED' ? (
                          <button
                            type="button"
                            onClick={() => setActiveQrOrder(o)}
                            className="whoops-btn whoops-btn-secondary whoops-btn-compact px-2.5 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>QR &amp; Hasil</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#61433B]">Ditolak</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DOODLE QUEUE & UPLOAD */}
      {activeTab === 'doodle' && (
        <>
          {doodleOrders.length === 0 ? (
            <div className="whoops-card p-10 text-center text-sm text-[#61433B]">
              Belum ada pesanan Photo + Doodle.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {doodleOrders.map((o) => (
                <div key={o.id} className="whoops-card p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <b className="font-mono-tabular text-sm">{o.orderCode}</b>
                      <span className="text-xs font-display font-semibold text-[#6D1D3A]">
                        {o.paymentStatus}
                      </span>
                    </div>
                    <p className="text-xs text-[#61433B] mb-3">
                      {o.packageName} · Request: <b>{o.doodleNotes || '-'}</b>
                    </p>
                    <div className="w-[130px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white">
                      {o.previewThumbUrl && (
                        <img
                          src={o.previewThumbUrl}
                          alt={o.orderCode}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <select
                      value={o.workflowStatus}
                      disabled={o.paymentStatus !== 'VERIFIED'}
                      onChange={(e) =>
                        updateOrderWorkflow(o.id, e.target.value as WorkflowStatus)
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-2.5 py-1.5 text-xs bg-white disabled:opacity-50"
                    >
                      {WORKFLOW_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleDownloadHighRes(
                            o,
                            'original',
                            `ORIGINAL-${o.orderCode}-300DPI.png`
                          )
                        }
                        disabled={downloadingOrderId === o.id}
                        className="whoops-btn whoops-btn-ghost flex-1 py-2 text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Foto Asli
                      </button>
                      <button
                        onClick={() => setActiveDoodleOrder(o)}
                        disabled={o.paymentStatus !== 'VERIFIED'}
                        className="whoops-btn whoops-btn-primary flex-1 py-2 text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        Studio Doodle
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 3: PRINT QUEUE */}
      {activeTab === 'print' && (
        <>
          {printOrders.length === 0 ? (
            <div className="whoops-card p-10 text-center text-sm text-[#61433B]">
              Belum ada antrean cetak 4R terverifikasi.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {printOrders.map((o) => {
                const mediaKind = o.doodleDone && o.finalChunks > 0 ? 'final' : 'original';
                return (
                  <div key={o.id} className="whoops-card p-4 text-center flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <b className="font-mono-tabular text-sm">{o.orderCode}</b>
                        <span className="text-xs font-display font-semibold text-[#6D1D3A]">
                          {o.printStatus}
                        </span>
                      </div>
                      <div className="w-[140px] aspect-[1205/1795] mx-auto border-2 border-[#3A231E] rounded-xl overflow-hidden bg-white">
                        {o.previewThumbUrl && (
                          <img
                            src={o.previewThumbUrl}
                            alt={o.orderCode}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveQrOrder(o)}
                        className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                        aria-label={`Tampilkan QR untuk ${o.orderCode}`}
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>QR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadHighRes(
                            o,
                            mediaKind,
                            `PRINT-4R-${o.orderCode}-300DPI.png`
                          )
                        }
                        disabled={downloadingOrderId === o.id}
                        className="whoops-btn whoops-btn-secondary whoops-btn-compact flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ekspor 4R</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await markOrderPrinted(o.id);
                            showToast(`Pesanan ${o.orderCode} ditandai sudah dicetak.`);
                          } catch {
                            showToast(`Gagal memperbarui status cetak ${o.orderCode}.`);
                          }
                        }}
                        disabled={o.printStatus === 'PRINTED'}
                        className="whoops-btn whoops-btn-primary whoops-btn-compact flex-1 py-2 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{o.printStatus === 'PRINTED' ? 'Selesai' : 'Sudah Dicetak'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB 4: SERVICE & PACKAGES */}
      {activeTab === 'packages' && (
        <div className="space-y-5">
          <div className="whoops-card p-5 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-display font-semibold mb-1">
                Biaya Tambahan Cetak 4R (Rp)
              </label>
              <input
                type="number"
                value={printAddonDraft}
                onChange={(e) => setPrintAddonDraft(Number(e.target.value))}
                className="w-48 border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white tabular-nums"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-display font-semibold mb-1">
                Label QRIS Merchant
              </label>
              <input
                type="text"
                value={qrisLabelDraft}
                onChange={(e) => setQrisLabelDraft(e.target.value)}
                className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-2 text-sm bg-white"
              />
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={savingId === 'settings'}
              className="whoops-btn whoops-btn-primary px-5 py-2.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Simpan Pengaturan
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {packages.map((p) => {
              const draft = pkgDrafts[p.id] || p;
              return (
                <div key={p.id} className="whoops-card p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tabular text-xs font-bold text-[#61433B]">
                      {draft.code}
                    </span>
                    <label className="text-xs font-display font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          setPkgDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...draft, isActive: e.target.checked },
                          }))
                        }
                        className="accent-[#6D1D3A]"
                      />
                      Aktif
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-display font-semibold mb-1">
                      Nama Paket
                    </label>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setPkgDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, name: e.target.value },
                        }))
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-display font-semibold mb-1">
                      Label Promo (Opsional)
                    </label>
                    <input
                      value={draft.promoText}
                      placeholder="Misal: BEST VALUE"
                      onChange={(e) =>
                        setPkgDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, promoText: e.target.value },
                        }))
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-display font-semibold mb-1">
                      Deskripsi
                    </label>
                    <textarea
                      rows={2}
                      value={draft.description}
                      onChange={(e) =>
                        setPkgDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, description: e.target.value },
                        }))
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-display font-semibold mb-1">
                      Harga Digital (Rp)
                    </label>
                    <input
                      type="number"
                      value={draft.digitalPrice}
                      onChange={(e) =>
                        setPkgDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...draft, digitalPrice: Number(e.target.value) },
                        }))
                      }
                      className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white tabular-nums"
                    />
                  </div>

                  <button
                    onClick={() => handleSavePackage(p.id)}
                    disabled={savingId === p.id}
                    className="whoops-btn whoops-btn-secondary w-full py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingId === p.id ? 'Menyimpan...' : 'Simpan Paket'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: FRAMES */}
      {activeTab === 'frames' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateFrame} className="whoops-card p-5">
            <h3 className="font-display font-bold text-lg text-[#3A231E] mb-3">
              Tambah Frame 6-Slot Baru
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-display font-semibold mb-1">Nama Frame</label>
                <input
                  required
                  value={newFrameName}
                  onChange={(e) => setNewFrameName(e.target.value)}
                  placeholder="Misal: Matcha Retro Edition"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-display font-semibold mb-1">Kategori</label>
                <input
                  value={newFrameCategory}
                  onChange={(e) => setNewFrameCategory(e.target.value)}
                  placeholder="Retro Classic / Cute Pastel"
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-display font-semibold mb-1">Tipe Frame</label>
                <select
                  value={newFrameType}
                  onChange={(e) => setNewFrameType(e.target.value as 'vector' | 'image')}
                  className="w-full border-2 border-[#3A231E] rounded-xl px-3 py-1.5 text-sm bg-white"
                >
                  <option value="vector">Warna Vektor 6-Slot</option>
                  <option value="image">Unggah PNG Transparan</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={savingId === 'new-frame'}
                  className="whoops-btn whoops-btn-primary w-full py-2 text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Frame
                </button>
              </div>
            </div>

            {newFrameType === 'vector' ? (
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-[#3A231E]/15">
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Latar:
                  <input
                    type="color"
                    value={newFrameBg}
                    onChange={(e) => setNewFrameBg(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Garis Trim:
                  <input
                    type="color"
                    value={newFrameTrim}
                    onChange={(e) => setNewFrameTrim(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
                <label className="text-xs font-display font-semibold inline-flex items-center gap-2">
                  Teks Logo:
                  <input
                    type="color"
                    value={newFrameLabelColor}
                    onChange={(e) => setNewFrameLabelColor(e.target.value)}
                    className="w-9 h-7 rounded cursor-pointer"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-[#3A231E]/15 flex flex-wrap items-center gap-3">
                <label className="whoops-btn whoops-btn-secondary px-4 py-2 text-xs inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Unggah PNG Frame (Rasio 1205×1795)
                  <input
                    type="file"
                    accept="image/png"
                    onChange={handleFramePngUpload}
                    className="hidden"
                  />
                </label>
                {newFrameOverlayData && (
                  <span className="text-xs text-emerald-700 font-semibold">
                    PNG overlay siap diunggah.
                  </span>
                )}
              </div>
            )}
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {frames.map((f) => (
              <div key={f.id} className="whoops-card p-5 text-center flex flex-col justify-between">
                <div>
                  <FramePreviewCanvas frame={f} maxWidthClass="max-w-[165px]" />
                  <div className="text-xs text-[#61433B] mt-3">{f.category}</div>
                  <h4 className="font-display font-bold text-base text-[#3A231E] mb-3">
                    {f.name}
                  </h4>
                </div>
                <button
                  onClick={async () => {
                    await saveFrame({ ...f, active: !f.active });
                    showToast(
                      `Frame "${f.name}" ${!f.active ? 'diaktifkan' : 'dinonaktifkan'}.`
                    );
                  }}
                  className={`whoops-btn w-full py-2 text-xs cursor-pointer ${
                    f.active ? 'whoops-btn-secondary' : 'whoops-btn-ghost'
                  }`}
                >
                  {f.active ? 'Status: AKTIF' : 'Status: NONAKTIF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeDoodleOrder && (
        <DoodleStudioModal
          order={activeDoodleOrder}
          onClose={() => setActiveDoodleOrder(null)}
          onSaved={() => {
            setActiveDoodleOrder(null);
            showToast('Doodle berhasil digabung dan dikirim ke pelanggan!');
          }}
        />
      )}

      {activeQrOrder && (
        <OrderQrModal
          order={activeQrOrder}
          onClose={() => setActiveQrOrder(null)}
          onDownloadHighRes={handleDownloadHighRes}
          isDownloading={downloadingOrderId === activeQrOrder.id}
        />
      )}
    </section>
  );
}
