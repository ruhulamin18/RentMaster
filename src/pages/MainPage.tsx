
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BillData, CalculationResult, LandlordInfo, ReceiptRecord, Tenant } from '../types';
import { InputGroup } from '../components/InputGroup';
import { ReceiptCard } from '../components/ReceiptCard';
import { 
  auth, 
  signInWithGoogle, 
  logout, 
  subscribeTenants, 
  saveTenant, 
  removeTenant, 
  saveReceipt, 
  subscribeReceipts,
  removeReceipt,
  updateReceipt,
  getLandlordInfo, 
  saveLandlordInfo,
  searchReceipts
} from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { normalizeStr, normalizePhone, isPhoneSearch } from '../hooks/searchHelpers';

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const INITIAL_TENANTS: Tenant[] = [
  { id: 1, name: "Md. Rasedul Islam", address: "Ruppur, Shahzadpur", phone: "01718-876029", flatNo: "2A", fixedRent: 5500, fixedWifi: 160 },
  { id: 2, name: "Habib", address: "Ruppur, Shahzadpur", phone: "01700000000", flatNo: "2B", fixedRent: 4500, fixedWifi: 0 },
  { id: 3, name: "Faruk", address: "Ruppur, Shahzadpur", phone: "01100000000", flatNo: "2C", fixedRent: 2500, fixedWifi: 160 },
  { id: 4, name: "Jamal", address: "Ruppur, Shahzadpur", phone: "01714-511730", flatNo: "3A", fixedRent: 5500, fixedWifi: 160 },
  { id: 5, name: "Abu Sayed", address: "Ruppur, Shahzadpur", phone: "01800000000", flatNo: "3B", fixedRent: 4500, fixedWifi: 160 },
  { id: 6, name: "Towfik", address: "Ruppur, Shahzadpur", phone: "01800000000", flatNo: "3C", fixedRent: 2500, fixedWifi: 160 },
  { id: 7, name: "Amina", address: "Ruppur, Shahzadpur", phone: "01300000000", flatNo: "4A", fixedRent: 2500, fixedWifi: 130 },
  { id: 8, name: "Liton", address: "Ruppur, Shahzadpur", phone: "01819000000", flatNo: "1B", fixedRent: 4300, fixedWifi: 0 },
];

const LANDLORD_DEFAULT: LandlordInfo = {
  houseName: "",
  houseNo: "",
  address: "",
  name: "",
  mobile: "",
  defaultGasBill: 0,
  defaultGarbageBill: 0,
  defaultWaterBill: 0,
};

type Tab = 'search' | 'calculator' | 'history' | 'tenants' | 'landlord';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [landlord, setLandlord] = useState<LandlordInfo>(LANDLORD_DEFAULT);
  const [isSavingLandlord, setIsSavingLandlord] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [receiptToDelete, setReceiptToDelete] = useState<ReceiptRecord | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [landlordSearchFilter, setLandlordSearchFilter] = useState('');
  const [searchResults, setSearchResults] = useState<ReceiptRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e?: React.FormEvent, customTerm?: string, customLandlordFilter?: string) => {
    if (e) e.preventDefault();
    const term = (customTerm !== undefined ? customTerm : searchQuery).trim().toLowerCase();
    const lFilter = (customLandlordFilter !== undefined ? customLandlordFilter : landlordSearchFilter).trim().toLowerCase();

    if (!term && !lFilter) {
      setSearchResults([]);
      setHasSearched(true);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    try {
      // 1. Search cloud receipts via Firestore
      const cloudResults = await searchReceipts(term, lFilter);

      // 2. Search local receipts state (covers Guest Mode & local receipts)
      const localResults = receipts.filter((r: ReceiptRecord) => {
        if (!term && !lFilter) return false;

        const flatNorm = normalizeStr(r.flatNo);
        const nameNorm = normalizeStr(r.tenantName);
        const tenantPhoneNorm = normalizePhone(r.tenantPhone || r.phone);
        const houseNameNorm = normalizeStr(r.landlordInfo?.houseName || landlord?.houseName);
        const houseNoNorm = normalizeStr(r.landlordInfo?.houseNo || landlord?.houseNo);
        const landlordMobileNorm = normalizePhone(r.landlordInfo?.mobile || landlord?.mobile);
        const landlordNameNorm = normalizeStr(r.landlordInfo?.name || landlord?.name);

        const termNorm = normalizeStr(term);
        const termPhone = normalizePhone(term);
        const termPhoneSearch = termPhone.length >= 8;
        const lFilterNorm = normalizeStr(lFilter);
        const lFilterPhone = normalizePhone(lFilter);
        const lFilterPhoneSearch = lFilterPhone.length >= 8;

        const matchesLandlord = (fNorm: string, fPhone: string, phoneSearch: boolean) => {
          if (!fNorm && !fPhone) return true;
          return (
            (phoneSearch && fPhone && landlordMobileNorm && landlordMobileNorm.includes(fPhone)) ||
            (fNorm && houseNameNorm && houseNameNorm.includes(fNorm)) ||
            (fNorm && houseNoNorm && houseNoNorm.includes(fNorm)) ||
            (fNorm && landlordNameNorm && landlordNameNorm.includes(fNorm))
          );
        };

        const matchesTenant = (fNorm: string, fPhone: string, phoneSearch: boolean) => {
          if (!fNorm && !fPhone) return true;
          const flatExactMatch = flatNorm && fNorm && flatNorm === fNorm;
          return (
            flatExactMatch ||
            (fNorm && nameNorm && nameNorm.includes(fNorm)) ||
            (phoneSearch && fPhone && tenantPhoneNorm && tenantPhoneNorm.includes(fPhone)) ||
            (fNorm && (r.rentMonth || '').toLowerCase().includes(fNorm)) ||
            (fNorm && (r.paymentDate || '').toLowerCase().includes(fNorm)) ||
            (fNorm && (r.id || '').toString().toLowerCase() === fNorm)
          );
        };

        if (lFilter && term) {
          return matchesLandlord(lFilterNorm, lFilterPhone, lFilterPhoneSearch) && matchesTenant(termNorm, termPhone, termPhoneSearch);
        }

        if (lFilter) return matchesLandlord(lFilterNorm, lFilterPhone, lFilterPhoneSearch);
        if (term) return matchesTenant(termNorm, termPhone, termPhoneSearch) || (termPhoneSearch && matchesLandlord(termNorm, termPhone, termPhoneSearch));

        return false;
      });

      // Combine cloud + local results, avoiding duplicates by id
      const combinedMap = new Map();
      cloudResults.forEach(r => combinedMap.set(r.id, r));
      localResults.forEach(r => combinedMap.set(r.id, r));

      setSearchResults(Array.from(combinedMap.values()));
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };
  
  const mergeTenants = (loaded: Tenant[]) => {
    return loaded.map(t => {
      const initial = INITIAL_TENANTS.find(it => it.id === t.id);
      if (initial) {
        return {
          ...initial,
          ...t,
          fixedRent: (t.fixedRent !== undefined && t.fixedRent !== null) ? t.fixedRent : initial.fixedRent,
          fixedWifi: (t.fixedWifi !== undefined && t.fixedWifi !== null) ? t.fixedWifi : initial.fixedWifi,
        };
      }
      return t;
    });
  };

  const getStoredTenants = (): Tenant[] => {
    try {
      const stored = localStorage.getItem('rentmaster_tenants');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error("Failed to read stored tenants:", e);
    }
    return INITIAL_TENANTS;
  };

  const [tenants, setTenants] = useState<Tenant[]>(getStoredTenants);

  useEffect(() => {
    let unsubT: (() => void) | null = null;
    let unsubR: (() => void) | null = null;
    let hasAttemptedSeed = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      // Cleanup previous sub-listeners if they exist
      if (unsubT) { unsubT(); unsubT = null; }
      if (unsubR) { unsubR(); unsubR = null; }

      setUser(u);
      if (u) {
        // Sync landlord info for authenticated user
        const cloudLandlord = await getLandlordInfo(u.uid);
        if (cloudLandlord) {
          setLandlord({
            ...LANDLORD_DEFAULT,
            ...cloudLandlord,
            defaultGasBill: cloudLandlord.defaultGasBill !== undefined ? cloudLandlord.defaultGasBill : 1080,
            defaultGarbageBill: cloudLandlord.defaultGarbageBill !== undefined ? cloudLandlord.defaultGarbageBill : 50,
            defaultWaterBill: cloudLandlord.defaultWaterBill !== undefined ? cloudLandlord.defaultWaterBill : 0,
          });
        } else {
          // New Gmail account: set a clean blank profile (do NOT auto-save defaults to Firebase)
          setLandlord({
            houseName: '',
            houseNo: '',
            name: u.displayName || '',
            mobile: u.phoneNumber || '',
            address: '',
            defaultGasBill: 1080,
            defaultGarbageBill: 50,
            defaultWaterBill: 0,
          });
        }

        // Subscribe to tenants strictly for this authenticated landlord
        unsubT = subscribeTenants(u.uid, (cloudTenants) => {
          if (cloudTenants.length > 0) {
            hasAttemptedSeed = true;
            setTenants(mergeTenants(cloudTenants));
          } else if (!hasAttemptedSeed) {
            // Seed initial tenants only once on first login if DB is empty
            hasAttemptedSeed = true;
            INITIAL_TENANTS.forEach(t => saveTenant(u.uid, t));
            setTenants(INITIAL_TENANTS);
          } else {
            // User intentionally deleted all tenants
            setTenants([]);
          }
        });

        // Subscribe to receipts for this authenticated landlord
        setIsLoadingReceipts(true);
        unsubR = subscribeReceipts(u.uid, (cloudReceipts) => {
          const unique = Array.from(new Map(cloudReceipts.map(item => [item.id, item])).values());
          setReceipts(unique.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || (a.createdAt instanceof Date ? a.createdAt : new Date(0));
            const dateB = b.createdAt?.toDate?.() || (b.createdAt instanceof Date ? b.createdAt : new Date(0));
            return dateB.getTime() - dateA.getTime();
          }));
          setIsLoadingReceipts(false);
        });
      } else {
        // Unauthenticated mode: reset landlord to empty profile
        setLandlord(LANDLORD_DEFAULT);
        setTenants(getStoredTenants());
        try {
          const storedReceipts = localStorage.getItem('rentmaster_guest_receipts');
          if (storedReceipts) {
            setReceipts(JSON.parse(storedReceipts));
          } else {
            setReceipts([]);
          }
        } catch (e) {
          setReceipts([]);
        }
        setIsLoadingReceipts(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubT) unsubT();
      if (unsubR) unsubR();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('rentmaster_tenants', JSON.stringify(tenants));
    }
  }, [tenants, user]);

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const initialFormData: BillData = {
    tenantId: '',
    tenantName: '',
    flatNo: '',
    rentMonth: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
    paymentDate: new Date().toISOString().split('T')[0],
    houseRent: 0,
    gasBill: 0,
    electricityBill: 0,
    waterBill: 0,
    wifiBill: 0,
    garbageBill: 0,
    previousDue: 0,
    paidAmount: 0,
  };

  const [formData, setFormData] = useState<BillData>(initialFormData);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptRecord | null>(null);

  const handleInputChange = (id: keyof BillData, value: string | number) => {
    if (id === 'tenantId') {
      if (!value) {
        setFormData(prev => ({ ...prev, tenantId: '', tenantName: '', flatNo: '' }));
        return;
      }
      
      const tenant = tenants.find(t => t.id === Number(value));
      
      // Auto-calculate previous due from history
      let autoPreviousDue = 0;
      if (receipts.length > 0) {
        const tenantHistory = receipts
          .filter(r => Number(r.tenantId) === Number(value) && r.id !== editingReceiptId)
          .sort((a, b) => {
             const dateA = a.createdAt?.toDate?.() || (a.createdAt instanceof Date ? a.createdAt : new Date(a.paymentDate || 0));
             const dateB = b.createdAt?.toDate?.() || (b.createdAt instanceof Date ? b.createdAt : new Date(b.paymentDate || 0));
             return dateB.getTime() - dateA.getTime();
          });
        
        if (tenantHistory.length > 0) {
          autoPreviousDue = tenantHistory[0].remainingDue || 0;
        }
      }

      setFormData(prev => ({
        ...prev,
        tenantId: value,
        tenantName: tenant ? tenant.name : '',
        flatNo: tenant ? tenant.flatNo : '',
        houseRent: tenant ? (tenant.fixedRent || 0) : 0,
        gasBill: tenant ? (landlord.defaultGasBill !== undefined && landlord.defaultGasBill !== null ? Number(landlord.defaultGasBill) : 0) : 0,
        waterBill: tenant ? (landlord.defaultWaterBill !== undefined && landlord.defaultWaterBill !== null ? Number(landlord.defaultWaterBill) : 0) : 0,
        wifiBill: tenant ? (tenant.fixedWifi || 0) : 0,
        garbageBill: tenant ? (landlord.defaultGarbageBill !== undefined && landlord.defaultGarbageBill !== null ? Number(landlord.defaultGarbageBill) : 0) : 0,
        previousDue: autoPreviousDue,
        electricityBill: 0,           // Fix: Reset variable fields
        paidAmount: 0,                // Fix: Reset variable fields
        paymentDate: new Date().toISOString().split('T')[0],
      }));
      setResult(null); // Fix: Clear previous result
    } else {
      setFormData(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleReset = () => {
    setFormData(initialFormData);
    setResult(null);
    setEditingReceiptId(null);
  };

  const confirmDeleteReceipt = async () => {
    if (!receiptToDelete) return;
    const id = receiptToDelete.id;
    try {
      if (user) {
        await removeReceipt(user.uid, id);
      } else {
        setReceipts(prev => prev.filter(r => r.id !== id));
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
    setReceiptToDelete(null);
  };

  const confirmDeleteTenant = async () => {
    if (!tenantToDelete) return;
    const id = tenantToDelete.id;
    setTenants(prev => {
      const next = prev.filter(t => t.id !== id);
      if (!user) {
        localStorage.setItem('rentmaster_tenants', JSON.stringify(next));
      }
      return next;
    });
    if (user) {
      try {
        await removeTenant(user.uid, id);
      } catch (err) {
        console.error("Failed to delete tenant from cloud:", err);
      }
    }
    if (Number(formData.tenantId) === id) handleReset();
    setTenantToDelete(null);
  };

  const groupedReceipts = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    receipts.forEach(rec => {
      // Group by the Billing Month (e.g., "May 2024")
      const monthYear = rec.rentMonth;
      if (!groups[monthYear]) groups[monthYear] = [];
      
      // Fallback for flatNo in history for missing fields in old records
      const flatNo = rec.flatNo || tenants.find(t => Number(t.id) === Number(rec.tenantId))?.flatNo || '??';
      
      groups[monthYear].push({ ...rec, flatNo });
    });
    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      return dateB.getTime() - dateA.getTime();
    });
  }, [receipts, tenants]);

  const handleUpdateTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = ((fd.get('name') as string) || '').trim();
    const flatNo = ((fd.get('flatNo') as string) || '').trim();
    const phone = ((fd.get('phone') as string) || '').trim();
    const address = ((fd.get('address') as string) || '').trim();
    const fixedRent = parseFloat(fd.get('fixedRent') as string) || 0;
    const fixedWifi = parseFloat(fd.get('fixedWifi') as string) || 0;

    if (!name || !flatNo) {
      alert("Flat Number and Name are required!");
      return;
    }

    const tenantId = editingTenant ? editingTenant.id : Date.now();
    const updated: Tenant = {
      id: tenantId,
      name,
      phone: phone || 'N/A',
      address: address || 'N/A',
      flatNo,
      fixedRent,
      fixedWifi,
    };

    // Update local state immediately so UI updates instantly
    setTenants(prev => {
      const exists = prev.some(t => t.id === tenantId);
      const next = exists
        ? prev.map(t => t.id === tenantId ? updated : t)
        : [...prev, updated];
      if (!user) {
        localStorage.setItem('rentmaster_tenants', JSON.stringify(next));
      }
      return next;
    });

    if (user) {
      try {
        await saveTenant(user.uid, updated);
      } catch (err) {
        console.error("Failed to save tenant to cloud:", err);
      }
    }

    setEditingTenant(null);
    setIsAdding(false);
  };

  const liveTotalBill = useMemo(() => {
    const rent = Number(formData.houseRent) || 0;
    const gas = Number(formData.gasBill) || 0;
    const electricity = Number(formData.electricityBill) || 0;
    const water = Number(formData.waterBill) || 0;
    const wifi = Number(formData.wifiBill) || 0;
    const garbage = Number(formData.garbageBill) || 0;
    const prevDue = Number(formData.previousDue) || 0;
    return rent + gas + electricity + water + wifi + garbage + prevDue;
  }, [formData]);

  const handleUpdateLandlord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const updated: LandlordInfo = {
      houseName: ((fd.get('houseName') as string) || '').trim(),
      houseNo: ((fd.get('houseNo') as string) || '').trim(),
      name: ((fd.get('name') as string) || '').trim(),
      mobile: ((fd.get('mobile') as string) || '').trim(),
      address: ((fd.get('address') as string) || '').trim(),
      defaultGasBill: parseFloat(fd.get('defaultGasBill') as string) || 0,
      defaultGarbageBill: parseFloat(fd.get('defaultGarbageBill') as string) || 0,
      defaultWaterBill: parseFloat(fd.get('defaultWaterBill') as string) || 0,
    };

    if (!updated.houseName || !updated.name || !updated.mobile) {
      alert("বাসার নাম, মালিকের নাম এবং মোবাইল নম্বর দেওয়া বাধ্যতামূলক!");
      return;
    }

    setLandlord(updated);
    if (user) {
      setIsSavingLandlord(true);
      try {
        await saveLandlordInfo(user.uid, updated);
        alert("বিল্ডিং প্রোফাইল সফলভাবে ফায়ারবেসে সেভ এবং আপডেট হয়েছে!");
      } catch (err) {
        console.error("Failed to save landlord info:", err);
        alert("ফায়ারবেসে সেভ করতে সমস্যা হয়েছে। অনুগ্রহ করে ইন্টারনেট চেক করুন।");
      } finally {
        setIsSavingLandlord(false);
      }
    } else {
      alert("গেস্ট মোডে সেভ হয়েছে। ক্লাউডে ফায়ারবেসে স্থায়ীভাবে রাখতে গুগল দিয়ে সাইন-ইন করুন।");
    }
  };

  const calculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tenantId) {
      alert("Please select a tenant first!");
      return;
    }
    
    const paid = Number(formData.paidAmount) || 0;
    const total = liveTotalBill;
    const due = total - paid;

    const selectedTenantObj = tenants.find(t => Number(t.id) === Number(formData.tenantId));

    // Ensure all numeric fields are numbers before saving and include flatNo & tenantPhone
    const finalData = {
      ...formData,
      flatNo: formData.flatNo || selectedTenantObj?.flatNo || '',
      tenantPhone: selectedTenantObj?.phone || '',
      houseRent: Number(formData.houseRent) || 0,
      gasBill: Number(formData.gasBill) || 0,
      electricityBill: Number(formData.electricityBill) || 0,
      waterBill: Number(formData.waterBill) || 0,
      wifiBill: Number(formData.wifiBill) || 0,
      garbageBill: Number(formData.garbageBill) || 0,
      previousDue: Number(formData.previousDue) || 0,
      paidAmount: paid,
    };

    const calcResult: CalculationResult = {
      ...finalData,
      totalBill: total,
      remainingDue: due
    };

    // Check if a receipt for the same tenant & rent month already exists
    const existingReceipt = receipts.find(r => {
      const sameTenant = (Number(r.tenantId) === Number(formData.tenantId)) ||
                         (r.flatNo && formData.flatNo && r.flatNo.trim().toLowerCase() === formData.flatNo.trim().toLowerCase());
      const sameMonth = (r.rentMonth || '').trim().toLowerCase() === (formData.rentMonth || '').trim().toLowerCase();
      return sameTenant && sameMonth;
    });

    const targetReceiptId = editingReceiptId || (existingReceipt ? existingReceipt.id : null);

    const guestReceiptId = targetReceiptId || `guest_${Date.now()}`;
    const guestReceipt = {
      ...calcResult,
      id: guestReceiptId,
      landlordInfo: landlord,
      createdAt: existingReceipt?.createdAt || new Date()
    };

    setResult(calcResult);
    setEditingReceiptId(null); 

    if (user) {
      const receiptData = {
        ...calcResult,
        landlordInfo: landlord
      };
      if (targetReceiptId) {
        await updateReceipt(user.uid, targetReceiptId, receiptData);
      } else {
        await saveReceipt(user.uid, calcResult, landlord);
      }
    } else {
      // In guest mode, persist in local receipts state & localStorage
      setReceipts(prev => {
        const exists = prev.some(r => r.id === guestReceiptId);
        const next = exists 
          ? prev.map(r => r.id === guestReceiptId ? guestReceipt : r)
          : [guestReceipt, ...prev];
        localStorage.setItem('rentmaster_guest_receipts', JSON.stringify(next));
        return next;
      });
    }
    
    setTimeout(() => {
      document.getElementById('receipt-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(val).replace('BDT', '৳');
  };

  const selectedTenant = tenants.find(t => t.id === Number(formData.tenantId));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sticky Modern Header */}
      <header className="no-print sticky top-0 z-50 w-full">
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-slate-200/60" />
        <div className="relative max-w-6xl mx-auto px-3 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="bg-indigo-600 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 ring-1 ring-white/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-black text-slate-900 tracking-tight leading-none">RentMaster</h1>
              <p className="text-[8px] sm:text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-0.5 truncate max-w-[110px] sm:max-w-none">{landlord.houseName}</p>
            </div>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/70 p-1 rounded-2xl border border-slate-200/50">
            {(['search', 'calculator', 'history', 'tenants', 'landlord'] as const).map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 flex items-center gap-1 ${
                  activeTab === tab 
                  ? 'text-indigo-600' 
                  : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {activeTab === tab && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white shadow-sm border border-slate-200/50 rounded-xl"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  {tab === 'search' ? '🔍 Search' :
                   tab === 'calculator' ? 'Calculator' :
                   tab === 'history' ? `History ${!user ? '🔒' : ''}` :
                   tab === 'tenants' ? `Tenants ${!user ? '🔒' : ''}` :
                   `Profile ${!user ? '🔒' : ''}`}
                </span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-2 pr-1">
                <div className="hidden md:block text-right">
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight leading-none">{user.displayName?.split(' ')[0]}</p>
                  <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Admin</p>
                </div>
                <button onClick={() => setShowLogoutConfirm(true)} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-xl transition-all group" title="Sign Out">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 group-hover:border-indigo-300" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-200 border border-slate-200" />
                  )}
                </button>
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="hidden sm:block bg-slate-900 text-white px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl font-bold text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest hover:bg-black transition-all"
              >
                Landlord Sign In
              </button>
            )}

            {/* 3-Bar Hamburger Menu Button (Mobile Only) */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex md:hidden items-center justify-center p-2 sm:p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all text-slate-700 focus:outline-none"
              aria-label="Toggle Menu"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* 3-Bar Hamburger Dropdown Drawer (Mobile Only) */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden relative z-40 bg-white/95 backdrop-blur-2xl border-b border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="max-w-6xl mx-auto px-4 py-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'search', label: 'Search Memo (ভাড়া খুঁজুন)', desc: 'Look up rent receipt by Flat No or Name', icon: '🔍', requiresAdmin: false },
                    { id: 'calculator', label: 'Billing Desk (Calculator)', desc: 'Generate & preview month memos', icon: '🧮', requiresAdmin: false },
                    { id: 'history', label: 'Billing History', desc: 'View, print & delete past memos', icon: '📜', requiresAdmin: true },
                    { id: 'tenants', label: 'Tenant Directory', desc: 'Private resident management (Saved in Cloud)', icon: '👥', requiresAdmin: true },
                    { id: 'landlord', label: 'Building Profile', desc: 'Configure property & owner info', icon: '👤', requiresAdmin: true },
                  ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id as any);
                          setIsMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-100'
                        }`}
                      >
                        <span className="text-xl shrink-0 p-2 rounded-xl bg-white/20">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-xs sm:text-sm tracking-tight leading-snug flex items-center gap-1.5">
                            <span>{item.label}</span>
                            {item.requiresAdmin && !user && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">
                                Admin
                              </span>
                            )}
                          </p>
                          <p className={`text-[10px] font-medium leading-tight truncate ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                            {item.desc}
                          </p>
                        </div>
                        {isActive && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white text-indigo-600 shrink-0">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {user ? (
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Sign Out ({user.displayName || user.email})</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 sm:hidden border-t border-slate-100">
                    <button
                      onClick={() => {
                        signInWithGoogle();
                        setIsMenuOpen(false);
                      }}
                      className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2"
                    >
                      <span>Sign In with Google</span>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {user && (!landlord.houseName || !landlord.name || !landlord.mobile) && activeTab !== 'landlord' && (
          <div className="mb-6 p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-sm">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="text-xs sm:text-sm font-black text-amber-950">আপনার নতুন একাউন্টের বিল্ডিং প্রোফাইল সেট করা নেই!</p>
                <p className="text-xs text-amber-800 mt-0.5">ফায়ারবেসে আপনার বাসার নাম, মালিকের নাম ও মোবাইল সেভ করতে Building Profile সেটআপ করুন।</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('landlord')}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all shrink-0 w-full sm:w-auto text-center"
            >
              প্রোফাইল সেট করুন &rarr;
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
        {/* Search View */}
        {activeTab === 'search' && (
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 md:p-10 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6 sm:space-y-8">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">
                <span>🔍 Tenant Memo Search / ভাড়ার রশিদ অনুসন্ধান</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                ফ্ল্যাট নম্বর দিয়ে ভাড়ার মেমো খুঁজুন
              </h2>
              <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">
                আপনার ফ্ল্যাট নম্বর (যেমন: 2A, 1B, 3C) অথবা আপনার নাম দিয়ে সহজেই সব মাসের পরিশোধিত ভাড়ার ক্যাশ মেমো ও রশিদ দেখুন ও প্রিন্ট করুন।
              </p>
            </div>

            {/* Search Form */}
            <form onSubmit={(e) => handleSearch(e)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block ml-1">
                  আপনার ফ্ল্যাট নম্বর, নাম বা ফোন নম্বর লিখুন <span className="text-indigo-600 font-bold">(যেমন: 2A, 1B, 017...)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ফ্ল্যাট নম্বর বা ভাড়াটিয়ার নাম (e.g. 2A, 1B, Jamal, 01712...)"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-32 py-3.5 text-sm sm:text-base font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:bg-white transition-all shadow-inner"
                  />
                  <svg className="w-5 h-5 text-indigo-500 absolute left-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="hidden sm:flex absolute right-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-200 items-center gap-2"
                  >
                    {isSearching ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>মেমো খুঁজুন</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Optional Landlord filter in case there are multiple landlords */}
              <div className="pt-1">
                <details className="group">
                  <summary className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 cursor-pointer inline-flex items-center gap-1 select-none">
                    <span>⚙️ বাড়ির মালিক বা মোবাইল ফিল্টার (ঐচ্ছিক)</span>
                    <span className="text-[9px] group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-2 pt-1">
                    <input
                      type="text"
                      value={landlordSearchFilter}
                      onChange={(e) => setLandlordSearchFilter(e.target.value)}
                      placeholder="মালিকের মোবাইল বা বাসার নাম (যেমন: 01712345678, Khan Mansion)..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-600"
                    />
                  </div>
                </details>
              </div>

              {/* Mobile Search Button */}
              <button
                type="submit"
                disabled={isSearching}
                className="sm:hidden w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
              >
                {isSearching ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>মেমো খোঁজা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>ভাড়ার মেমো খুঁজুন</span>
                  </>
                )}
              </button>

              {/* Security & Instruction Banner */}
              <div className="flex items-center gap-2.5 bg-indigo-50/80 p-3.5 rounded-2xl border border-indigo-200/60 text-indigo-950">
                <span className="text-lg shrink-0">💡</span>
                <p className="text-xs font-semibold leading-relaxed">
                  <strong>টিপস:</strong> আপনার ফ্ল্যাট নম্বর (যেমন <strong>2A</strong>, <strong>3B</strong>, <strong>1B</strong>) লিখে সার্চ করলে আপনার সব মাসের পরিশোধিত ভাড়ার ক্যাশ মেমো একসাথে পেয়ে যাবেন।
                </p>
              </div>

              {/* Flat Quick Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">দ্রুত খুঁজুন (Quick Flat):</span>
                {Array.from(new Set([...tenants.map(t => t.flatNo).filter(Boolean), '1A', '1B', '2A', '2B', '3A', '3B', '4A'])).slice(0, 10).map((flat) => (
                  <button
                    key={flat}
                    type="button"
                    onClick={() => {
                      setSearchQuery(flat);
                      handleSearch(undefined, flat, landlordSearchFilter);
                    }}
                    className="px-3 py-1 bg-slate-100 hover:bg-indigo-600 hover:text-white border border-slate-200/80 rounded-lg text-xs font-extrabold text-slate-700 transition-all"
                  >
                    Flat {flat}
                  </button>
                ))}
              </div>
            </form>

            {/* Results Display */}
            {isSearching ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Searching verified receipts in Firebase...</p>
              </div>
            ) : hasSearched && searchResults.length === 0 ? (
              <div className="bg-slate-50 rounded-2xl p-6 sm:p-8 text-center border border-slate-200/80 space-y-3">
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-xl">
                  🔍
                </div>
                <div>
                  <p className="text-base font-black text-slate-800">কোন মেমো পাওয়া যায়নি / No Receipts Found</p>
                  <p className="text-xs text-slate-500 font-medium max-w-md mx-auto mt-1">
                    বাড়ির মালিককে (Admin) প্রথমে Google Sign In করে Calculator থেকে ভাড়া ক্যালকুলেট ও Save করতে হবে। তবেই ভাড়াটিয়া এখানে সার্চ করে রশিদ পেয়ে যাবে।
                  </p>
                </div>
                {!user && (
                  <button
                    onClick={signInWithGoogle}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-md shadow-indigo-100 transition-all"
                  >
                    Landlord Sign In (মেমো সেভ করতে লগইন করুন)
                  </button>
                )}
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Found {searchResults.length} Verified Receipt{searchResults.length > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {searchResults.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-slate-50 hover:bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-5 transition-all shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 sm:w-12 sm:h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 shadow-md shadow-indigo-100">
                            {rec.flatNo || 'UNIT'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[180px] sm:max-w-none">
                                🏠 {rec.landlordInfo?.houseName || 'Building'}
                              </span>
                              {rec.landlordInfo?.mobile && (
                                <span className="text-[9px] sm:text-[10px] font-bold text-slate-500">
                                  📱 {rec.landlordInfo.mobile}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm sm:text-base font-black text-slate-900 leading-snug truncate">{rec.tenantName}</h4>
                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 mt-0.5">
                              <span>{rec.rentMonth}</span>
                              <span className="text-slate-300">&bull;</span>
                              <span className="text-[10px] text-slate-400 font-medium">{rec.paymentDate}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-200/60">
                        <div className="flex items-center justify-between sm:justify-start gap-4 bg-white sm:bg-transparent p-2 sm:p-0 rounded-xl border sm:border-0 border-slate-100">
                          <div>
                            <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-wider">Total Bill</p>
                            <p className="text-xs sm:text-sm font-black text-slate-900">{formatCurrency(rec.totalBill)}</p>
                          </div>

                          <div>
                            <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-wider">Status</p>
                            <span className={`inline-block px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${
                              rec.remainingDue <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {rec.remainingDue <= 0 ? 'Paid' : `Due: ${formatCurrency(rec.remainingDue)}`}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setViewingReceipt(rec)}
                          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
                        >
                          <span>View Memo</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100 text-center space-y-2">
                <p className="text-xs font-bold text-indigo-900">💡 Quick Guide for Building Residents</p>
                <p className="text-xs text-indigo-600/80 max-w-md mx-auto">
                  Type your flat number (e.g. 2A, 3B, 5C) or tenant name in the search box above to search and print your rent memo.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Landlord View */}
        {activeTab === 'landlord' && (
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 md:p-10 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            {!user ? (
              <div className="py-12 sm:py-16 text-center space-y-6 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 4a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200/60">Admin Restricted</span>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">Building Settings</h3>
                  <p className="text-slate-500 font-medium text-xs sm:text-sm mt-2">
                    Please sign in with your Google Landlord account to configure property details & contact info.
                  </p>
                </div>
                <button
                  onClick={signInWithGoogle}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all inline-flex items-center gap-2"
                >
                  Sign In as Landlord
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6 sm:mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Building Profile (বিল্ডিং সেটিং)</h2>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-[9px] sm:text-[10px]">
                      {user ? `Signed in as: ${user.email}` : "Configure property details"}
                    </p>
                  </div>
                  {user && (
                    <button
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="self-start sm:self-auto bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm"
                    >
                      <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>লগআউট (Sign Out)</span>
                    </button>
                  )}
                </div>

                {(!landlord.houseName || !landlord.name || !landlord.mobile) && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 shadow-sm">
                    <span className="text-xl shrink-0">⚠️</span>
                    <div className="text-xs sm:text-sm">
                      <p className="font-extrabold text-amber-950">আপনার নতুন একাউন্টের বিল্ডিং প্রোফাইল সেভ করা হয়নি!</p>
                      <p className="mt-1 text-amber-800 leading-relaxed font-medium">
                        নিচের ঘরগুলোতে আপনার <strong>বাসার নাম</strong>, <strong>মালিকের নাম</strong> এবং <strong>মোবাইল নম্বর</strong> পূরণ করুন এবং <strong>"Save Changes (ফায়ারবেসে সেভ করুন)"</strong> বাটনে ক্লিক করে তথ্যগুলো ফায়ারবেসে সংরক্ষণ করুন।
                      </p>
                    </div>
                  </div>
                )}
                
                <form key={user ? user.uid : 'guest'} onSubmit={handleUpdateLandlord} className="space-y-6 sm:space-y-8">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {[
                      { label: 'House Name (বাসার নাম)', id: 'houseName', value: landlord.houseName, icon: '🏠', placeholder: 'যেমন: হাজী ভিলা / রশীদ মঞ্জিল' },
                      { label: 'House Number (বাসার নম্বর)', id: 'houseNo', value: landlord.houseNo, icon: '📍', placeholder: 'যেমন: ৬১৯' },
                      { label: 'Proprietor / Owner (মালিকের নাম)', id: 'name', value: landlord.name, icon: '👤', placeholder: 'যেমন: মোঃ নজরুল ইসলাম' },
                      { label: 'Contact Mobile (মোবাইল নম্বর)', id: 'mobile', value: landlord.mobile, icon: '📱', placeholder: 'যেমন: ০১৭১২০০০০০' },
                      { label: 'Full Location (ঠিকানা)', id: 'address', value: landlord.address, icon: '🌎', placeholder: 'যেমন: রূপপুর, শাহজাদপুর, সিরাজগঞ্জ' },
                    ].map((item, i) => (
                      <div key={i} className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center gap-2 ml-1">
                          <span className="text-base sm:text-lg opacity-80">{item.icon}</span>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{item.label}</label>
                        </div>
                        <input 
                          name={item.id}
                          value={item.value || ''} 
                          onChange={(e) => setLandlord(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder={item.placeholder}
                          required={item.id !== 'houseNo' && item.id !== 'address'}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm placeholder:text-slate-300"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Fixed Default Utility Bills Section */}
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚙️</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">ডিফল্ট ফিক্সড মেমো বিলসমূহ (Fixed Default Charges)</h3>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                          ভাড়াটিয়া সিলেক্ট করলে এই ফিক্সড টাকাগুলো মেমোতে স্বয়ংক্রিয়ভাবে বসে যাবে। প্রয়োজন অনুযায়ী এখান থেকে পরিবর্তন করতে পারবেন।
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block ml-1">
                          🔥 গ্যাস বিল (Gas Bill ৳)
                        </label>
                        <input
                          type="number"
                          name="defaultGasBill"
                          value={landlord.defaultGasBill !== undefined ? landlord.defaultGasBill : 1080}
                          onChange={(e) => setLandlord(prev => ({ ...prev, defaultGasBill: parseFloat(e.target.value) || 0 }))}
                          placeholder="1080"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-indigo-600 shadow-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block ml-1">
                          🗑️ ময়লা বিল (Garbage Bill ৳)
                        </label>
                        <input
                          type="number"
                          name="defaultGarbageBill"
                          value={landlord.defaultGarbageBill !== undefined ? landlord.defaultGarbageBill : 50}
                          onChange={(e) => setLandlord(prev => ({ ...prev, defaultGarbageBill: parseFloat(e.target.value) || 0 }))}
                          placeholder="50"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-indigo-600 shadow-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block ml-1">
                          💧 পানি / সার্ভিস বিল (Water Bill ৳)
                        </label>
                        <input
                          type="number"
                          name="defaultWaterBill"
                          value={landlord.defaultWaterBill !== undefined ? landlord.defaultWaterBill : 0}
                          onChange={(e) => setLandlord(prev => ({ ...prev, defaultWaterBill: parseFloat(e.target.value) || 0 }))}
                          placeholder="0"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-indigo-600 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 sm:pt-4">
                    <button 
                      type="submit" 
                      disabled={isSavingLandlord}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg shadow-indigo-100 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {isSavingLandlord ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Firebase-এ সেভ হচ্ছে...</span>
                        </>
                      ) : (
                        <span>Save Changes (ফায়ারবেসে সেভ করুন)</span>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* History View */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-8 md:p-10 border-b border-slate-100 flex justify-between items-end bg-slate-50/30">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Billing History</h2>
                <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  {user ? (isLoadingReceipts ? "Synchronizing Cloud Data..." : `${receipts.length} total digital records`) : "Guest Mode - Local Storage"}
                </p>
              </div>
            </div>
            
            {!user ? (
               <div className="p-8 sm:p-20 text-center space-y-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 transform rotate-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 4a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14z" />
                    </svg>
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight uppercase text-[10px] tracking-[0.2em]">Cloud Sync Required</h3>
                  <p className="text-slate-500 font-medium max-w-xs mx-auto text-xs sm:text-sm">Please sign in with Google to enable permanent cloud archiving and billing analytics.</p>
                  <button onClick={signInWithGoogle} className="bg-indigo-600 text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Enable Sync</button>
               </div>
            ) : isLoadingReceipts && receipts.length === 0 ? (
               <div className="p-12 sm:p-20 text-center space-y-4">
                 <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                 <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Gathering cloud records...</p>
               </div>
            ) : receipts.length === 0 ? (
               <div className="p-16 sm:p-24 text-center">
                 <p className="font-black text-slate-300 uppercase tracking-[0.4em] text-xs">Zero records found</p>
               </div>
            ) : (
                <div className="p-3 sm:p-8 md:p-10 space-y-6 sm:space-y-12">
                  {groupedReceipts.map(([monthYear, records]) => (
                    <div key={monthYear} className="space-y-3 sm:space-y-6">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <span className="text-[9px] sm:text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] bg-indigo-50 px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg border border-indigo-100/50">
                          {monthYear}
                        </span>
                        <div className="h-px flex-1 bg-slate-100"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
                        {records.map(rec => (
                          <div key={rec.id} className="group bg-white rounded-2xl border border-slate-100 p-3.5 sm:px-6 sm:py-5 hover:border-indigo-200 transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6">
                            <div className="flex items-center gap-3 sm:gap-5 w-full sm:w-auto justify-between sm:justify-start">
                              <div className="flex items-center gap-3 sm:gap-5">
                                <div className="bg-slate-50 w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all font-black text-xs sm:text-sm border border-slate-100 shrink-0">
                                  {rec.flatNo}
                                </div>
                                <div>
                                  <h4 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">{rec.tenantName}</h4>
                                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rec.paymentDate}</p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <div className="text-left sm:text-right">
                                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Total</p>
                                <p className="text-[10px] sm:text-[11px] font-black text-slate-400 tracking-tighter italic">{formatCurrency(rec.totalBill)}</p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Paid</p>
                                <p className="text-[11px] sm:text-xs font-black text-slate-900 tracking-tighter italic">{formatCurrency(rec.paidAmount)}</p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5">Due</p>
                                <p className={`text-[11px] sm:text-xs font-black tracking-tighter italic ${rec.remainingDue > 0 ? 'text-rose-500' : rec.remainingDue < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                                  {rec.remainingDue > 0 ? `+${formatCurrency(rec.remainingDue)}` : formatCurrency(rec.remainingDue)}
                                </p>
                              </div>
                              
                              <div className="flex gap-1 shrink-0 ml-auto sm:ml-0">
                                <button 
                                  onClick={() => setViewingReceipt(rec)}
                                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
                                  title="View Receipt"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button 
                                  onClick={() => {
                                    setFormData(rec);
                                    setResult(rec);
                                    setEditingReceiptId(rec.id);
                                    setActiveTab('calculator');
                                    setTimeout(() => document.getElementById('receipt-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
                                  }}
                                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                                  title="Edit"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button 
                                  onClick={() => setReceiptToDelete(rec)}
                                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
                                  title="Delete"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        )}

        {/* Tenants View */}
        {activeTab === 'tenants' && (
          <div className="bg-white rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            {!user ? (
              <div className="p-8 sm:p-16 text-center space-y-6 max-w-xl mx-auto">
                <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200/60">Private Directory</span>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mt-3">Tenant Directory Restricted</h3>
                  <p className="text-slate-500 font-medium text-xs sm:text-sm mt-2">
                    Resident details are private to the property owner. Please sign in with your Google Landlord account to access or manage residents.
                  </p>
                </div>
                <button
                  onClick={signInWithGoogle}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all inline-flex items-center gap-2"
                >
                  Sign In as Landlord
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 sm:p-8 md:p-10 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 bg-slate-50/30">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Tenant Directory</h2>
                    <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Active Residents: {tenants.length}</p>
                  </div>
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    New Resident
                  </button>
                </div>

            {tenants.length === 0 ? (
              <div className="p-8 sm:p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-slate-800">No Residents Listed</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">Click "New Resident" above to add tenant details to your directory.</p>
              </div>
            ) : (
              <>
                {/* Mobile View: Clean Responsive Cards for Phone Mode */}
                <div className="block sm:hidden divide-y divide-slate-100">
                  {tenants.map(tenant => (
                    <div key={tenant.id} className="p-4 space-y-3 hover:bg-indigo-50/20 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center justify-center min-w-[2.75rem] h-11 px-2.5 rounded-xl bg-indigo-50 text-indigo-600 font-black text-sm sm:text-base shadow-sm border border-indigo-100/50">
                            {tenant.flatNo}
                          </span>
                          <div>
                            <h4 className="text-slate-900 font-extrabold text-sm tracking-tight">{tenant.name}</h4>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">{tenant.address || 'Address N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setEditingTenant(tenant)} className="w-8 h-8 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200/60 transition-all flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => setTenantToDelete(tenant)} className="w-8 h-8 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-slate-200/60 transition-all flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-50 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Contact:</span>
                          {tenant.phone && tenant.phone !== 'N/A' ? (
                            <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50/80 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-100 text-xs">
                              <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {tenant.phone}
                            </a>
                          ) : (
                            <span className="text-slate-400 font-medium text-xs">N/A</span>
                          )}
                        </div>

                        {(!!tenant.fixedRent || !!tenant.fixedWifi) && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                            {!!tenant.fixedRent && <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Rent: ৳{tenant.fixedRent}</span>}
                            {!!tenant.fixedWifi && <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">WiFi: ৳{tenant.fixedWifi}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop & Tablet View: Full Table */}
                <div className="hidden sm:block overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/80 text-slate-400 uppercase text-[9px] font-black tracking-widest">
                      <tr>
                        <th className="px-6 py-5">Unit</th>
                        <th className="px-6 py-5">Resident</th>
                        <th className="px-6 py-5">Contact</th>
                        <th className="px-6 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tenants.map(tenant => (
                        <tr key={tenant.id} className="hover:bg-indigo-50/20 transition-all group">
                          <td className="px-6 py-5">
                            <span className="inline-flex items-center justify-center min-w-[3rem] h-12 px-3 rounded-xl bg-indigo-50 text-indigo-600 font-black text-lg shadow-sm border border-indigo-100/50 group-hover:scale-105 transition-transform">
                              {tenant.flatNo}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col">
                              <span className="text-slate-900 font-extrabold text-base tracking-tight">{tenant.name}</span>
                              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">{tenant.address}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            {tenant.phone && tenant.phone !== 'N/A' ? (
                              <a href={`tel:${tenant.phone}`} className="inline-flex items-center gap-1.5 text-slate-700 font-bold text-sm bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200/50 transition-colors">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {tenant.phone}
                              </a>
                            ) : (
                              <span className="text-slate-400 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/50">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingTenant(tenant)} className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200 hover:shadow-sm transition-all flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button onClick={() => setTenantToDelete(tenant)} className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white hover:text-red-600 border border-transparent hover:border-slate-200 hover:shadow-sm transition-all flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Editor Modal */}
            {(editingTenant || isAdding) && (
              <div 
                className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center min-h-screen"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setEditingTenant(null);
                    setIsAdding(false);
                  }
                }}
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white w-full max-w-lg my-auto rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden"
                >
                  <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 shrink-0 sticky top-0 z-10">
                    <div>
                      <h3 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight uppercase tracking-wider">{editingTenant ? 'ট্যানেন্ট তথ্য এডিট (Modify Profile)' : 'নতুন ট্যানেন্ট যোগ করুন (New Resident)'}</h3>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">Flat: {editingTenant?.flatNo || 'New'}</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {setEditingTenant(null); setIsAdding(false);}} 
                      className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 rounded-xl transition-all p-2 flex items-center gap-1 font-extrabold text-xs"
                      title="বন্ধ করুন (Close)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="hidden sm:inline">বন্ধ (Close)</span>
                    </button>
                  </div>
                  <form 
                    key={editingTenant ? `edit-${editingTenant.id}` : 'new-tenant'}
                    onSubmit={handleUpdateTenant} 
                    className="p-4 sm:p-8 space-y-3 sm:space-y-5 overflow-y-auto"
                  >
                    <div className="grid grid-cols-2 gap-3 sm:gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Flat / Unit *</label>
                        <input name="flatNo" defaultValue={editingTenant?.flatNo || ''} placeholder="e.g. 5C" required className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mobile No.</label>
                        <input name="phone" defaultValue={editingTenant?.phone || ''} placeholder="01XXX-XXXXXX" className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fixed Rent (৳)</label>
                        <input name="fixedRent" type="number" defaultValue={editingTenant?.fixedRent || ''} placeholder="5500" className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fixed WiFi (৳)</label>
                        <input name="fixedWifi" type="number" defaultValue={editingTenant?.fixedWifi || ''} placeholder="160" className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tenant Full Name *</label>
                      <input name="name" defaultValue={editingTenant?.name || ''} placeholder="Legal Name" required className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Permanent Address</label>
                      <input name="address" defaultValue={editingTenant?.address || ''} placeholder="Address Details (Optional)" className="w-full px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all text-sm" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button 
                        type="button" 
                        onClick={() => {setEditingTenant(null); setIsAdding(false);}} 
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-all text-xs"
                      >
                        বাতিল (Cancel)
                      </button>
                      <button type="submit" className="flex-[2] bg-slate-900 text-white font-black py-3.5 rounded-xl shadow-xl shadow-slate-100 hover:bg-black transition-all text-xs uppercase tracking-wider">
                        {editingTenant ? 'সেভ করুন (Save Changes)' : 'যোগ করুন (Add Resident)'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* Calculator View */}
        {activeTab === 'calculator' && (
          <div className="space-y-6 sm:space-y-12">
            <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden no-print">
              <form onSubmit={calculate} className="p-4 sm:p-8 md:p-12">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-12 gap-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Billing Desk</h2>
                    <p className="text-[9px] sm:text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-0.5">Generate Verified Paper Memo</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleReset}
                    className="group bg-slate-50 text-slate-400 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-[8px] sm:text-[9px] uppercase tracking-widest transition-all hover:bg-rose-50 hover:text-rose-500 flex items-center gap-2"
                  >
                    Clear Desk
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
                  {/* General Info */}
                  <div className="space-y-6 sm:space-y-8">
                    <div className="bg-slate-50/50 p-4 sm:p-8 rounded-2xl sm:rounded-[2rem] border border-slate-100 space-y-4 sm:space-y-6">
                      <h3 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Resident Profile</h3>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Occupant</label>
                        <div className="relative">
                          <select 
                            className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl border-2 border-white focus:border-indigo-600 outline-none transition-all appearance-none bg-white font-bold text-slate-900 tracking-tight cursor-pointer shadow-sm text-sm"
                            value={formData.tenantId}
                            onChange={(e) => handleInputChange('tenantId', e.target.value)}
                            required
                          >
                            <option value="">Choose resident...</option>
                            {tenants.map(t => (
                              <option key={t.id} value={t.id}>[{t.flatNo}] {t.name}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-focus-within:text-indigo-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 pt-1">
                        <InputGroup label="Billing Month" id="rentMonth" type="select" value={formData.rentMonth} options={MONTHS.map(m => `${m} ${new Date().getFullYear()}`)} onChange={(e) => handleInputChange('rentMonth', e.target.value)} />
                        <InputGroup label="Payment Date" id="paymentDate" type="date" value={formData.paymentDate} onChange={(e) => handleInputChange('paymentDate', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Financial Info */}
                  <div className="space-y-6 sm:space-y-8">
                    <div className="bg-slate-900 p-4 sm:p-8 rounded-2xl sm:rounded-[2rem] shadow-2xl space-y-4 sm:space-y-6">
                      <h3 className="text-xs sm:text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Financial Settlement</h3>
                      <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                        <InputGroup label="Rent" id="houseRent" value={formData.houseRent} onChange={(e) => handleInputChange('houseRent', e.target.value)} />
                        <InputGroup label="Gas" id="gasBill" value={formData.gasBill} onChange={(e) => handleInputChange('gasBill', e.target.value)} />
                        <InputGroup label="Electric" id="electricityBill" value={formData.electricityBill} onChange={(e) => handleInputChange('electricityBill', e.target.value)} />
                        <InputGroup label="Water" id="waterBill" value={formData.waterBill || 0} onChange={(e) => handleInputChange('waterBill', e.target.value)} />
                        <InputGroup label="WiFi" id="wifiBill" value={formData.wifiBill} onChange={(e) => handleInputChange('wifiBill', e.target.value)} />
                        <InputGroup label="Garbage" id="garbageBill" value={formData.garbageBill} onChange={(e) => handleInputChange('garbageBill', e.target.value)} />
                        <InputGroup label="Arrears" id="previousDue" value={formData.previousDue} onChange={(e) => handleInputChange('previousDue', e.target.value)} />
                      </div>

                      <div className="pt-4 sm:pt-6 border-t border-slate-800 flex justify-between items-center">
                        <span className="text-[8px] sm:text-[9px] font-black text-slate-500 uppercase tracking-widest">Gross Inventory Total</span>
                        <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tighter italic">{formatCurrency(liveTotalBill)}</span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <label className="text-[9px] sm:text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Received Payment (BDT)</label>
                        <input
                          type="number"
                          value={formData.paidAmount}
                          onChange={(e) => handleInputChange('paidAmount', e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-800/50 border-2 border-slate-800 rounded-xl px-4 sm:px-6 py-3 sm:py-4 text-emerald-400 font-black placeholder:text-slate-700 outline-none focus:border-emerald-600 transition-all text-lg sm:text-xl tracking-tighter"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-6 sm:mt-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-xl shadow-indigo-100 transition-all transform hover:scale-[1.01] active:scale-[0.98] text-[10px] sm:text-[11px] uppercase tracking-[0.2em] sm:tracking-[0.3em]"
                >
                  {editingReceiptId ? 'Update Record' : 'Generate Memo'}
                </button>
              </form>
            </div>

            {/* Results */}
            {result && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pb-12 sm:pb-20"
                id="receipt-section"
              >
                <div className="text-center mb-6 sm:mb-10 no-print flex flex-col items-center gap-2">
                  <div className="h-1 w-12 bg-indigo-200 rounded-full"></div>
                  <h3 className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Verified Preview</h3>
                </div>
                <ReceiptCard 
                  data={result} 
                  landlord={landlord} 
                  flatNo={result.flatNo || selectedTenant?.flatNo || 'UNIT'}
                />
              </motion.div>
            )}
          </div>
        )}
          </motion.div>
        </AnimatePresence>

        {/* Global Receipt Modal Overlay */}
        {viewingReceipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-6 bg-slate-900/60 backdrop-blur-md no-print overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm sm:max-w-lg my-auto max-h-[92vh] rounded-2xl sm:rounded-[2.5rem] shadow-2xl overflow-y-auto no-scrollbar relative"
            >
              <div className="sticky top-0 right-0 p-3 sm:p-6 flex justify-end z-[110] no-print bg-gradient-to-b from-white via-white/80 to-transparent">
                <button 
                  onClick={() => setViewingReceipt(null)}
                  className="bg-slate-100 p-2 sm:p-3 rounded-xl text-slate-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                  title="Close Memo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-2 sm:p-6 md:p-10 -mt-8 sm:-mt-16">
                <ReceiptCard 
                  data={viewingReceipt} 
                  landlord={viewingReceipt.landlordInfo || landlord} 
                  flatNo={viewingReceipt.flatNo || tenants.find(t => t.id === Number(viewingReceipt.tenantId))?.flatNo || 'UNIT'}
                />
              </div>
            </motion.div>
          </div>
        )}
        {/* Delete Confirmation Modal for Tenant */}
        {tenantToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-sm rounded-2xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4"
            >
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Delete Tenant?</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1 leading-relaxed">
                  Are you sure you want to remove <span className="font-extrabold text-slate-900">Flat {tenantToDelete.flatNo} ({tenantToDelete.name})</span> from your tenant directory?
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTenantToDelete(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTenant}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-rose-100 transition-all"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal for Receipt */}
        {receiptToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-sm rounded-2xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4"
            >
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Delete Billing Record?</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1 leading-relaxed">
                  Are you sure you want to delete the record for <span className="font-extrabold text-slate-900">{receiptToDelete.tenantName} ({receiptToDelete.rentMonth})</span>?
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceiptToDelete(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteReceipt}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-rose-100 transition-all"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-sm rounded-2xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4"
            >
              <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">লগআউট নিশ্চিতকরণ</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1.5 leading-relaxed">
                  আপনি কি আপনার একাউন্ট <span className="font-extrabold text-slate-900">{user?.email || 'Admin'}</span> থেকে লগআউট করতে চান?
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs transition-all"
                >
                  বাতিল (Cancel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    logout();
                  }}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-rose-100 transition-all"
                >
                  হ্যাঁ, লগআউট
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      <footer className="mt-12 sm:mt-20 pb-12 sm:pb-20 text-center no-print px-4 sm:px-6">
        <div className="max-w-6xl mx-auto border-t border-slate-200 pt-6 sm:pt-10 flex flex-col items-center gap-3 sm:gap-4">
          <p className="text-slate-400 text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em]">
            Digital Property Asset Management &bull; Enterprise Edition
          </p>
          <div className="flex items-center gap-3">
             <div className="h-px w-8 bg-slate-200"></div>
             <p className="text-slate-800 text-sm font-black tracking-tighter">
              Developed by <span className="text-indigo-600">Md. Ruhul Amin</span>
            </p>
            <div className="h-px w-8 bg-slate-200"></div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
