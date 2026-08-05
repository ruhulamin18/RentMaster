import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  getDocFromServer,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  collectionGroup,
  getDocs,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { LandlordInfo, Tenant, CalculationResult, ReceiptRecord } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (
      error?.code === 'auth/cancelled-popup-request' ||
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/user-cancelled'
    ) {
      console.log('Google sign-in popup cancelled by user or pending request.');
      return null;
    }

    console.warn('Google sign-in popup failed, falling back to redirect:', error);
    try {
      await signInWithRedirect(auth, googleProvider);
      return null;
    } catch (redirectError: any) {
      console.error('Google sign-in redirect failed:', redirectError);
      return null;
    }
  }
};
export const logout = () => signOut(auth);

// Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection Helper
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

// Landlord info (User Profile)
export const saveLandlordInfo = async (userId: string, data: LandlordInfo) => {
  const path = `users/${userId}`;
  try {
    await setDoc(doc(db, path), { ...data, uid: userId });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const getLandlordInfo = async (userId: string) => {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, path));
    return snap.exists() ? snap.data() as (LandlordInfo & { uid: string }) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
};

// Tenants
export const subscribeTenants = (userId: string, callback: (tenants: Tenant[]) => void) => {
  const path = `users/${userId}/tenants`;
  const q = collection(db, path);
  return onSnapshot(q, (snap) => {
    const tenants = snap.docs.map(d => {
      const data = d.data();
      const rawId = data.id !== undefined && data.id !== null ? data.id : d.id;
      const numId = typeof rawId === 'number' ? rawId : (isNaN(Number(rawId)) ? rawId : Number(rawId));
      return { ...data, id: numId } as Tenant;
    });
    callback(tenants);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
};

export const saveTenant = async (userId: string, tenant: Tenant) => {
  const path = `users/${userId}/tenants/${tenant.id}`;
  try {
    await setDoc(doc(db, path), { ...tenant, ownerId: userId });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const removeTenant = async (userId: string, tenantId: number) => {
  const path = `users/${userId}/tenants/${tenantId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// Receipts
export const saveReceipt = async (userId: string, result: CalculationResult, landlordInfo?: LandlordInfo) => {
  const path = `users/${userId}/receipts`;
  try {
    let info = landlordInfo;
    if (!info) {
      info = await getLandlordInfo(userId) || undefined;
    }

    const normalizedResult = {
      ...result,
      flatNoNorm: normalizeStr(result.flatNo),
      tenantNameNorm: normalizeStr(result.tenantName),
      tenantPhoneNorm: normalizePhone(result.tenantPhone || ''),
      houseNameNorm: normalizeStr(info?.houseName),
      houseNoNorm: normalizeStr(info?.houseNo),
      landlordNameNorm: normalizeStr(info?.name),
      landlordMobileNorm: normalizePhone(info?.mobile || ''),
    };

    const existingQuery = query(
      collection(db, path),
      where('tenantId', '==', result.tenantId),
      where('rentMonth', '==', result.rentMonth),
      limit(1)
    );
    const existingSnap = await getDocs(existingQuery);
    const existingDoc = existingSnap.docs[0];

    if (existingDoc) {
      await updateDoc(doc(db, `${path}/${existingDoc.id}`), {
        ...normalizedResult,
        landlordInfo: info || null,
        ownerId: userId,
        updatedAt: serverTimestamp()
      });
      return existingDoc.id;
    } else {
      const ref = await addDoc(collection(db, path), {
        ...normalizedResult,
        landlordInfo: info || null,
        ownerId: userId,
        createdAt: serverTimestamp()
      });
      return ref.id;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const subscribeReceipts = (userId: string, callback: (receipts: any[]) => void) => {
  const path = `users/${userId}/receipts`;
  const q = collection(db, path);
  return onSnapshot(q, (snap) => {
    const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(receipts);
  }, (err) => {
    handleFirestoreError(err, OperationType.GET, path);
  });
};

export const removeReceipt = async (userId: string, receiptId: string) => {
  const path = `users/${userId}/receipts/${receiptId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateReceipt = async (userId: string, receiptId: string, data: Partial<CalculationResult>) => {
  const path = `users/${userId}/receipts/${receiptId}`;
  try {
    const { id, ...updateData } = data as any;
    const normalized = {
      ...updateData,
      flatNoNorm: normalizeStr(updateData.flatNo),
      tenantNameNorm: normalizeStr(updateData.tenantName),
      tenantPhoneNorm: normalizePhone(updateData.tenantPhone || updateData.phone || ''),
      houseNameNorm: normalizeStr(updateData.landlordInfo?.houseName),
      houseNoNorm: normalizeStr(updateData.landlordInfo?.houseNo),
      landlordNameNorm: normalizeStr(updateData.landlordInfo?.name),
      landlordMobileNorm: normalizePhone(updateData.landlordInfo?.mobile || ''),
    };
    await updateDoc(doc(db, path), normalized);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
};

const bnToEnNums = (val: any) => {
  if (!val) return '';
  const bn = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return val.toString().replace(/[০-৯]/g, (w: string) => bn.indexOf(w).toString());
};

const normalizeStr = (val: any) => {
  if (!val) return '';
  const converted = bnToEnNums(val);
  return converted.toLowerCase().replace(/[\s\-_,.]/g, '');
};

const normalizePhone = (val: any) => {
  if (!val) return '';
  const converted = bnToEnNums(val);
  return converted.replace(/\D/g, '');
};

const isFlatQuery = (value: string) => {
  const converted = value.trim();
  if (!converted) return false;
  return /^[0-9A-Za-z]{1,5}$/.test(converted);
};

export const searchReceipts = async (searchTerm?: string, landlordFilter?: string) => {
  const termRaw = bnToEnNums((searchTerm || '').trim().toLowerCase());
  const lFilterRaw = bnToEnNums((landlordFilter || '').trim().toLowerCase());

  const termNorm = normalizeStr(termRaw);
  const termPhone = normalizePhone(termRaw);
  const termPhoneSearch = termPhone.length >= 8;
  const shouldMatchFlat = isFlatQuery(termRaw);

  const lFilterNorm = normalizeStr(lFilterRaw);
  const lFilterPhone = normalizePhone(lFilterRaw);
  const lFilterPhoneSearch = lFilterPhone.length >= 8;

  const isFlatSearch = shouldMatchFlat && termNorm.length > 0;

  try {
    const receiptsRef = collectionGroup(db, 'receipts');

    if (isFlatSearch && !lFilterRaw) {
      const flatQuery = query(receiptsRef, where('flatNoNorm', '==', termNorm), limit(200));
      const snap = await getDocs(flatQuery);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptRecord));
    }

    if (termPhoneSearch && !lFilterRaw) {
      const phoneQuery = query(receiptsRef, where('tenantPhoneNorm', '==', termPhone), limit(200));
      const snap = await getDocs(phoneQuery);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptRecord));
    }

    if (isFlatSearch && lFilterRaw) {
      const combinedQuery = query(
        receiptsRef,
        where('flatNoNorm', '==', termNorm),
        where('houseNameNorm', '==', lFilterNorm),
        limit(200)
      );
      const snap = await getDocs(combinedQuery);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptRecord));
    }

    const snap = await getDocs(receiptsRef);
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptRecord));

    if (!termRaw && !lFilterRaw) {
      return [];
    }

    return all.filter((r: ReceiptRecord) => {
      const flatRaw = (r.flatNo || '').toString().toLowerCase();
      const flatNorm = r.flatNoNorm || normalizeStr(flatRaw);

      const nameRaw = (r.tenantName || '').toString().toLowerCase();
      const nameNorm = r.tenantNameNorm || normalizeStr(nameRaw);

      const tenantPhoneRaw = (r.tenantPhone || r.phone || '').toString().toLowerCase();
      const tenantPhoneNorm = r.tenantPhoneNorm || normalizePhone(tenantPhoneRaw);

      const monthRaw = (r.rentMonth || '').toString().toLowerCase();
      const dateRaw = (r.paymentDate || '').toString().toLowerCase();
      const recIdRaw = (r.id || '').toString().toLowerCase();

      const houseNameRaw = (r.landlordInfo?.houseName || '').toString().toLowerCase();
      const houseNameNorm = r.houseNameNorm || normalizeStr(houseNameRaw);

      const houseNoRaw = (r.landlordInfo?.houseNo || '').toString().toLowerCase();
      const houseNoNorm = r.houseNoNorm || normalizeStr(houseNoRaw);

      const landlordMobileRaw = (r.landlordInfo?.mobile || '').toString().toLowerCase();
      const landlordMobileNorm = r.landlordMobileNorm || normalizePhone(landlordMobileRaw);

      const landlordNameRaw = (r.landlordInfo?.name || '').toString().toLowerCase();
      const landlordNameNorm = r.landlordNameNorm || normalizeStr(landlordNameRaw);

      const ownerIdRaw = (r.ownerId || '').toString().toLowerCase();

      const matchesLandlord = (filterRaw: string, filterNorm: string, filterPhone: string, phoneSearch: boolean) => {
        if (!filterRaw) return true;
        return (
          (phoneSearch && filterPhone && landlordMobileNorm && landlordMobileNorm.includes(filterPhone)) ||
          (landlordMobileRaw && landlordMobileRaw.includes(filterRaw)) ||
          (filterNorm && houseNameNorm && houseNameNorm.includes(filterNorm)) ||
          (houseNameRaw && houseNameRaw.includes(filterRaw)) ||
          (filterNorm && houseNoNorm && houseNoNorm.includes(filterNorm)) ||
          (houseNoRaw && houseNoRaw.includes(filterRaw)) ||
          (filterNorm && landlordNameNorm && landlordNameNorm.includes(filterNorm)) ||
          (landlordNameRaw && landlordNameRaw.includes(filterRaw)) ||
          (ownerIdRaw && ownerIdRaw.includes(filterRaw))
        );
      };

      const matchesTenant = (filterRaw: string, filterNorm: string, filterPhone: string, phoneSearch: boolean) => {
        if (!filterRaw) return true;
        const flatExactMatch = isFlatSearch && filterNorm && flatNorm && flatNorm === filterNorm;
        return (
          flatExactMatch ||
          (filterNorm && nameNorm && nameNorm.includes(filterNorm)) ||
          (phoneSearch && filterPhone && tenantPhoneNorm && tenantPhoneNorm.includes(filterPhone)) ||
          (filterNorm && monthRaw && monthRaw.includes(filterNorm)) ||
          (filterNorm && dateRaw && dateRaw.includes(filterNorm)) ||
          (recIdRaw && recIdRaw === filterRaw)
        );
      };

      if (lFilterRaw && termRaw) {
        const matchesL = matchesLandlord(lFilterRaw, lFilterNorm, lFilterPhone, lFilterPhoneSearch);
        const matchesT = matchesTenant(termRaw, termNorm, termPhone, termPhoneSearch);
        return matchesL && matchesT;
      }

      if (lFilterRaw) {
        return matchesLandlord(lFilterRaw, lFilterNorm, lFilterPhone, lFilterPhoneSearch);
      }

      return matchesTenant(termRaw, termNorm, termPhone, termPhoneSearch) || (termPhoneSearch && matchesLandlord(termRaw, termNorm, termPhone, termPhoneSearch));
    });
  } catch (err) {
    console.error('searchReceipts error:', err);
    return [];
  }
};
