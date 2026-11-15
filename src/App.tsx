import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { MotionConfig } from 'motion/react';
import { ArrowLeft, Clock } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { BoothFlow } from './components/BoothFlow';
import { DownloadPage } from './components/DownloadPage';
import { WhoopsLogo } from './components/WhoopsLogo';
import {
  DEFAULT_FRAMES,
  DEFAULT_PACKAGES,
  DEFAULT_STORE_SETTINGS,
} from './constants/defaults';
import { auth } from './firebase';
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

const SESSION_DURATION_SECONDS = 300; // 5 minutes per booth session

const STEP_LABELS: Partial<Record<BoothStep, string>> = {
  frame: '1/5 Pilih Frame',
  camera: '2/5 Kamera & Retake',
  editor: '3/5 Edit 6 Slot',
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

export default function App() {
  const [downloadOrderId, setDownloadOrderId] = useState<string | null>(() =>
    getDownloadOrderIdFromUrl()
  );
  const [mode, setMode] = useState<AppMode>('booth');
  const [step, setStep] = useState<BoothStep>('welcome');
  const [headerPkgName, setHeaderPkgName] = useState<string | null>(null);

  // 5-Minute Booth Session Timer State
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number | null>(null);
  const [sessionOrderSubmitted, setSessionOrderSubmitted] = useState(false);
  const [hasExtendedOnce, setHasExtendedOnce] = useState(false);
  const deadlineRef = useRef<number | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [cloudPackages, setCloudPackages] = useState<ServicePackage[]>([]);
  const [cloudFrames, setCloudFrames] = useState<PhotoFrame[]>([]);
  const [packagesSynced, setPackagesSynced] = useState(false);
  const [framesSynced, setFramesSynced] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    const unsubSettings = subscribeStoreSettings((s) => {
      setSettings(s);
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

  const packages = packagesSynced ? cloudPackages : DEFAULT_PACKAGES;
  const frames = framesSynced ? cloudFrames : DEFAULT_FRAMES;
  const catalogSynced = packagesSynced && framesSynced;

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
              onClick={() => {
                setMode('booth');
                setStep('welcome');
                resetSessionTimer();
              }}
            />

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

            <button
              type="button"
              onClick={() => setMode((m) => (m === 'booth' ? 'admin' : 'booth'))}
              className="whoops-btn whoops-btn-secondary whoops-btn-compact px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              {mode === 'booth' ? 'Admin Dashboard' : 'Kembali ke Booth'}
            </button>
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
              frames={frames}
              settings={settings}
              catalogSynced={catalogSynced}
              isSessionExpired={isSessionExpired}
              canExtendOnce={!hasExtendedOnce}
              onStartSessionTimer={startSessionTimer}
              onExtendOneMinute={() => extendSessionTimer(60, true)}
              onContinueWithGraceTime={() => extendSessionTimer(90, false)}
              onOrderSubmittedChange={setSessionOrderSubmitted}
              onResetSessionTimer={resetSessionTimer}
              onSelectedPackageChange={setHeaderPkgName}
              onOpenAdmin={() => setMode('admin')}
            />
          ) : (
            <AdminDashboard
              user={user}
              authLoading={authLoading}
              packages={packages}
              frames={frames}
              settings={settings}
            />
          )}
        </main>
      </div>
    </MotionConfig>
  );
}
