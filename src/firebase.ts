import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import rawAppletConfig from '../firebase-applet-config.json';

const env = import.meta.env;

export const activeFirebaseConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() || rawAppletConfig.apiKey,
  authDomain:
    (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() || rawAppletConfig.authDomain,
  projectId:
    (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() || rawAppletConfig.projectId,
  storageBucket:
    (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() ||
    rawAppletConfig.storageBucket,
  messagingSenderId:
    (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() ||
    rawAppletConfig.messagingSenderId,
  appId: (env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() || rawAppletConfig.appId,
  firestoreDatabaseId:
    (env.VITE_FIREBASE_DATABASE_ID as string | undefined)?.trim() ??
    (rawAppletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ??
    '',
};

const app = initializeApp(activeFirebaseConfig);
const configuredDbId = activeFirebaseConfig.firestoreDatabaseId.trim();

export const db =
  configuredDbId && configuredDbId !== '(default)'
    ? getFirestore(app, configuredDbId)
    : getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'store'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
