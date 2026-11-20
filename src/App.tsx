import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import { ArrowLeft, Clock } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { BoothFlow } from './components/BoothFlow';
import { DownloadPage } from './components/DownloadPage';
import { WhoopsLogo } from './components/WhoopsLogo';
import {
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
} from './constants/defaults';
import { auth } from './firebase';
import {
  loadDemoState,
  subscribeDemoState,
  type DemoStoreState,
} from './services/demoStore';
import {
  subscribeFrames,
  subscribePackages,
  subscribeStoreSettings,
} from './services/firestoreService';
import type {
  AppMode,
  BoothStep,
  PhotoFrame,
  ServicePackage,
  StoreSettings,
} from './types';
import {
  isGDriveConfigPackage,
  packageToGDriveConfig,
} from './utils/gdriveConfigSync';
import { isVoucherPackage, packageToVoucher } from './utils/voucher';

const SESSION_DURATION_SECONDS = 360; // 6 minutes per booth session

const STEP_LABELS: Partial<Record<BoothStep, string>> = {
  frame: '1/5 Pilih Frame',
  camera: '2/5 Kamera & Retake',
  editor: '3/5 Edit & Susun Foto',
  preview: '4/5 Final Preview',
  checkout: '5/5 Paket & Kasir',
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getDownloadOrderIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('download');
    return id && /^[a-zA-Z0-9_\-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isAdminRouteFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get('admin');
    const modeParam = params.get('mode');
    if (adminParam === '1' || adminParam === 'true' || modeParam === 'admin') {
      return true;
    }
    const cleanPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (cleanPath.endsWith('/admin')) {
      return true;
    }
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    return hash === 'admin' || hash.startsWith('admin?') || hash.startsWith('admin/');
  } catch {
    return false;
  }
}

export function getBoothBaseUrl(): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('admin');
    url.searchParams.delete('mode');
    url.searchParams.delete('download');
    if (url.pathname.replace(/\/+$/, '').toLowerCase().endsWith('/admin')) {
      url.pathname = url.pathname.replace(/\/admin\/?$/i, '/');
    }
    url.hash = '';
    return url.toString();
  } catch {
    return import.meta.env.BASE_URL || '/';
  }
}

export function getAdminAccessUrl(): string {
  try {
    const url = new URL(getBoothBaseUrl());
    url.searchParams.set('admin', '1');
    return url.toString();
  } catch {
    return '?admin=1';
  }
}

export default function App() {
  const [downloadOrderId, setDownloadOrderId] = useState<string | null>(() =>
    getDownloadOrderIdFromUrl()
  );
  const [mode, setMode] = useState<AppMode>(() =>
    isAdminRouteFromUrl() ? 'admin' : 'booth'
  );
  const [step, setStep] = useState<BoothStep>('welcome');
  const [headerPkgName, setHeaderPkgName] = useState<string | null>(null);

  // 6-Minute Booth Session Timer State
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number | null>(null);
  const [sessionOrderSubmitted, setSessionOrderSubmitted] = useState(false);
  const [hasExtendedOnce, setHasExtendedOnce] = useState(false);
  const deadlineRef = useRef<number | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cloudAccessDenied, setCloudAccessDenied] = useState(false);

  const [demoState, setDemoState] = useState<DemoStoreState>(() => loadDemoState());
  const [cloudSettings, setCloudSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [cloudPackages, setCloudPackages] = useState<ServicePackage[]>([]);
  const [cloudFrames, setCloudFrames] = useState<PhotoFrame[]>([]);
  const [packagesSynced, setPackagesSynced] = useState(false);
  const [framesSynced, setFramesSynced] = useState(false);

  useEffect(() => {
    const syncFromUrl = () => {
      setDownloadOrderId(getDownloadOrderIdFromUrl());
      setMode(isAdminRouteFromUrl() ? 'admin' : 'booth');
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);

    const unsubDemo = subscribeDemoState((next) => {
      setDemoState(next);
    });

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCloudAccessDenied(false);
      setAuthLoading(false);
    });

    const unsubSettings = subscribeStoreSettings((s) => {
      setCloudSettings(s);
    });

    const unsubPackages = subscribePackages((pkgs, exists) => {
      setCloudPackages(pkgs);
      setPackagesSynced(exists);
    });

    const unsubFrames = subscribeFrames((frs, exists) => {
      setCloudFrames(frs);
      setFramesSynced(exists);
    });

    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
      unsubDemo();
      unsubAuth();
      unsubSettings();
      unsubPackages();
      unsubFrames();
    };
  }, []);

  const startSessionTimer = useCallback(() => {
    deadlineRef.current = Date.now() + SESSION_DURATION_SECONDS * 1000;
    setSessionSecondsLeft(SESSION_DURATION_SECONDS);
    setSessionOrderSubmitted(false);
    setHasExtendedOnce(false);
  }, []);

  const resetSessionTimer = useCallback(() => {
    deadlineRef.current = null;
    setSessionSecondsLeft(null);
    setSessionOrderSubmitted(false);
    setHasExtendedOnce(false);
  }, []);

  const extendSessionTimer = useCallback((extraSeconds: number, markExtended = true) => {
    deadlineRef.current = Date.now() + extraSeconds * 1000;
    setSessionSecondsLeft(extraSeconds);
    if (markExtended) setHasExtendedOnce(true);
  }, []);

  useEffect(() => {
    const shouldTick =
      mode === 'booth' &&
      step !== 'welcome' &&
      !sessionOrderSubmitted &&
      sessionSecondsLeft !== null &&
      sessionSecondsLeft > 0;

    if (!shouldTick) return;

    if (!deadlineRef.current) {
      deadlineRef.current = Date.now() + sessionSecondsLeft * 1000;
    }

    const timer = window.setInterval(() => {
      if (!deadlineRef.current) return;
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSessionSecondsLeft(remaining);
    }, 250);

    return () => window.clearInterval(timer);
  }, [mode, step, sessionOrderSubmitted, sessionSecondsLeft]);

  if (downloadOrderId) {
    return (
      <MotionConfig reducedMotion="user">
        <DownloadPage
          orderId={downloadOrderId}
          onExitDownload={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete('download');
            window.history.replaceState({}, '', url.pathname);
            setDownloadOrderId(null);
            setMode('booth');
            setStep('welcome');
            resetSessionTimer();
          }}
        />
      </MotionConfig>
    );
  }

  const adminUsingCloud = Boolean(user && !cloudAccessDenied);
  const preferDemoCatalog = !adminUsingCloud && demoState.hasCustomCatalog;

  const settings = preferDemoCatalog ? demoState.settings : cloudSettings;
  const rawPackages = preferDemoCatalog
    ? demoState.packages
    : packagesSynced
      ? cloudPackages
      : demoState.packages;
  const parsedPackages = rawPackages.filter(
    (p) => !isVoucherPackage(p) && !isGDriveConfigPackage(p)
  );
  const packages = parsedPackages.length > 0 ? parsedPackages : DEFAULT_PACKAGES;
  const vouchers = rawPackages
    .filter((p) => isVoucherPackage(p) && !isGDriveConfigPackage(p))
    .map(packageToVoucher);
  const cloudGDrivePkg = cloudPackages.find(isGDriveConfigPackage) || null;
  const cloudGDriveConfig = cloudGDrivePkg
    ? packageToGDriveConfig(cloudGDrivePkg)
    : null;
  const frames = preferDemoCatalog
    ? demoState.frames
    : framesSynced
      ? cloudFrames
      : demoState.frames;
  const catalogSynced = packagesSynced && framesSynced;

  const navigateToBooth = useCallback(() => {
    try {
      const target = new URL(getBoothBaseUrl());
      window.history.replaceState({}, '', target.pathname + target.search);
    } catch {
      // Ignore history restrictions
    }
    setMode('booth');
    setStep('welcome');
    resetSessionTimer();
  }, [resetSessionTimer]);

  const isSessionExpired =
    mode === 'booth' &&
    step !== 'welcome' &&
    !sessionOrderSubmitted &&
    sessionSecondsLeft === 0;

  const handleGoBack = () => {
    const prevMap: Partial<Record<BoothStep, BoothStep>> = {
      frame: 'welcome',
      camera: 'frame',
      editor: 'camera',
      preview: 'editor',
      checkout: 'preview',
    };
    const nextStep = prevMap[step] || 'welcome';
    if (nextStep === 'welcome') {
      resetSessionTimer();
    }
    setStep(nextStep);
  };

  const timerUrgent = sessionSecondsLeft !== null && sessionSecondsLeft <= 15;
  const timerWarning = sessionSecondsLeft !== null && sessionSecondsLeft <= 60 && !timerUrgent;

  const isLockedLandscapeEditor = mode === 'booth' && step === 'editor';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen whoops-studio-bg text-[#3A231E] flex flex-col">
        <header className="sticky top-0 z-40 h-14 px-3 sm:px-6 bg-[#FDF7EE]/95 backdrop-blur-xs border-b-2 border-[#3A231E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {mode === 'booth' && step !== 'welcome' && !sessionOrderSubmitted && (
              <button
                type="button"
                onClick={handleGoBack}
                className="whoops-btn whoops-btn-ghost whoops-btn-compact px-3 py-1 text-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kembali</span>
              </button>
            )}

            <WhoopsLogo
              size="sm"
              onClick={
                mode === 'booth'
                  ? () => {
                      setStep('welcome');
                      resetSessionTimer();
                    }
                  : undefined
              }
            />

            {mode === 'admin' && (
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#F3D2DB] border border-[#3A231E] text-xs font-display font-bold text-[#6D1D3A] whitespace-nowrap">
                Kasir &amp; Admin Panel
              </span>
            )}

            {mode === 'booth' && STEP_LABELS[step] && (
              <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#EFE2CE] border border-[#3A231E]/40 text-xs font-display font-semibold text-[#61433B] whitespace-nowrap">
                {STEP_LABELS[step]}
                {headerPkgName ? ` | ${headerPkgName}` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {mode === 'booth' &&
              step !== 'welcome' &&
              !sessionOrderSubmitted &&
              sessionSecondsLeft !== null && (
                <div
                  aria-live="polite"
                  aria-label={`Sisa waktu sesi ${formatCountdown(sessionSecondsLeft)}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#3A231E] text-xs sm:text-sm font-mono-tabular font-bold tabular-nums shadow-[2px_2px_0_#3A231E] transition-colors ${
                    timerUrgent
                      ? 'bg-[#6D1D3A] text-[#FDF7EE]'
                      : timerWarning
                        ? 'bg-[#F3D2DB] text-[#6D1D3A]'
                        : 'bg-[#EFE2CE] text-[#3A231E]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{formatCountdown(sessionSecondsLeft)}</span>
                </div>
              )}

            {mode === 'admin' && (
              <button
                type="button"
                onClick={navigateToBooth}
                className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
              >
                Kembali ke Booth
              </button>
            )}
          </div>
        </header>

        <main
          className={
            isLockedLandscapeEditor
              ? 'w-full max-w-[1280px] mx-auto px-3 sm:px-5 py-3 flex-1 md:h-[calc(100dvh-3.5rem)] md:flex-none md:overflow-hidden'
              : 'w-full max-w-[1180px] mx-auto px-3 sm:px-5 pt-4 sm:pt-5 pb-10 flex-1'
          }
        >
          {mode === 'booth' ? (
            <BoothFlow
              step={step}
              setStep={setStep}
              packages={packages}
              vouchers={vouchers}
              frames={frames}
              settings={settings}
              catalogSynced={catalogSynced}
              preferDemoCatalog={preferDemoCatalog}
              cloudGDriveConfig={cloudGDriveConfig}
              isSessionExpired={isSessionExpired}
              canExtendOnce={!hasExtendedOnce}
              onStartSessionTimer={startSessionTimer}
              onExtendOneMinute={() => extendSessionTimer(60, true)}
              onContinueWithGraceTime={() => extendSessionTimer(90, false)}
              onOrderSubmittedChange={setSessionOrderSubmitted}
              onResetSessionTimer={resetSessionTimer}
              onSelectedPackageChange={setHeaderPkgName}
            />
          ) : (
            <AdminDashboard
              user={user}
              authLoading={authLoading}
              adminUsingCloud={adminUsingCloud}
              framesSynced={framesSynced}
              cloudAccessDenied={cloudAccessDenied}
              onResetCloudAccessDenied={() => setCloudAccessDenied(false)}
              onCloudAccessDenied={() => setCloudAccessDenied(true)}
              demoOrders={demoState.orders}
              packages={packages}
              vouchers={vouchers}
              frames={frames}
              settings={settings}
              cloudGDriveConfig={cloudGDriveConfig}
            />
          )}
        </main>
      </div>
    </MotionConfig>
  );
}
