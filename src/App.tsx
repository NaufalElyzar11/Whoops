import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { ArrowLeft } from 'lucide-react';
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

  if (downloadOrderId) {
    return (
      <DownloadPage
        orderId={downloadOrderId}
        onExitDownload={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('download');
          window.history.replaceState({}, '', url.pathname);
          setDownloadOrderId(null);
          setMode('booth');
          setStep('welcome');
        }}
      />
    );
  }

  const packages = packagesSynced ? cloudPackages : DEFAULT_PACKAGES;
  const frames = framesSynced ? cloudFrames : DEFAULT_FRAMES;
  const catalogSynced = packagesSynced && framesSynced;

  const handleGoBack = () => {
    const prevMap: Partial<Record<BoothStep, BoothStep>> = {
      service: 'welcome',
      frame: 'service',
      camera: 'frame',
      editor: 'camera',
      preview: 'editor',
      checkout: 'preview',
    };
    setStep(prevMap[step] || 'welcome');
  };

  return (
    <div className="min-h-screen bg-[#FDF7EE] text-[#3A231E]">
      <header className="sticky top-0 z-40 h-16 px-4 sm:px-6 bg-[#FDF7EE]/95 backdrop-blur-xs border-b-2 border-[#3A231E] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {mode === 'booth' && step !== 'welcome' && (
            <button
              onClick={handleGoBack}
              className="whoops-btn whoops-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali
            </button>
          )}
          <WhoopsLogo
            size="sm"
            onClick={() => {
              setMode('booth');
              setStep('welcome');
            }}
          />
          {mode === 'booth' && headerPkgName && (
            <span className="hidden sm:inline text-xs font-display font-semibold text-[#61433B] truncate">
              · {headerPkgName}
            </span>
          )}
        </div>

        <button
          onClick={() => setMode((m) => (m === 'booth' ? 'admin' : 'booth'))}
          className="whoops-btn whoops-btn-secondary px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
        >
          {mode === 'booth' ? 'Admin Dashboard' : 'Kembali ke Booth'}
        </button>
      </header>

      <main className="max-w-[1120px] mx-auto px-4 pt-6 pb-14">
        {mode === 'booth' ? (
          <BoothFlow
            step={step}
            setStep={setStep}
            packages={packages}
            frames={frames}
            settings={settings}
            catalogSynced={catalogSynced}
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
  );
}
