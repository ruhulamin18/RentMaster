
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BillData, CalculationResult, LandlordInfo, Tenant } from './types';
import { InputGroup } from './components/InputGroup';
import { ReceiptCard } from './components/ReceiptCard';
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
  saveLandlordInfo 
} from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const INITIAL_TENANTS: Tenant[] = [
  { id: 1, name: "Md. Rasedul Islam", address: "Ruppur, Shahzadpur", phone: "01718-876029", flatNo: "2A", fixedRent: 5500, fixedWifi: 160 },
  { id: 2, name: "Habib", address: "Ruppur, Shahzadpur", phone: "01700000000", flatNo: "2B", fixedRent: 4500, fixedWifi: 0 },
  { id: 3, name: "Faruk", address: "Ruppur, Shahzadpur", phone: "01100000000", flatNo: "2C", fixedRent: 2500, fixedWifi: 160 },
  { id: 4, name: "Jamal", address: "Ruppur, Shahzadpur", phone: "01714-511730", flatNo: "3A", fixedRent: 5500, fixedWifi: 160 },
  { id: 5, name: "Abu Sayed", address: "Ruppur, Shahzadpur", phone: "0180000000", flatNo: "3B", fixedRent: 4500, fixedWifi: 160 },
  { id: 6, name: "Towfik", address: "Ruppur, Shahzadpur", phone: "01800000000", flatNo: "3C", fixedRent: 2500, fixedWifi: 160 },
  { id: 7, name: "Amina", address: "Ruppur, Shahzadpur", phone: "01300000000", flatNo: "4A", fixedRent: 2500, fixedWifi: 130 },
  { id: 8, name: "Liton", address: "Ruppur, Shahzadpur", phone: "01819000000", flatNo: "1B", fixedRent: 4300, fixedWifi: 0 },
];

const LANDLORD_DEFAULT: LandlordInfo = {
  houseName: "Hazi Vila",
  houseNo: "619",
  address: "Ruppur, Shahzadpur, Sirajganj",
  name: "Md. Nazrul Islam",
  mobile: "01712011254"
};

type Tab = 'landlord' | 'tenants' | 'calculator' | 'history';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('calculator');
  const [landlord, setLandlord] = useState<LandlordInfo>(LANDLORD_DEFAULT);
  const [user, setUser] = useState<User | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  
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

  const [tenants, setTenants] = useState<Tenant[]>(() => {
    const saved = localStorage.getItem('rentmaster_tenants');
    if (!saved) return INITIAL_TENANTS;
    
    try {
      const parsed = JSON.parse(saved) as Tenant[];
      return mergeTenants(parsed);
    } catch (e) {
      return INITIAL_TENANTS;
    }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync landlord info
        const cloudLandlord = await getLandlordInfo(u.uid);
        if (cloudLandlord) {
          setLandlord(cloudLandlord);
        } else {
          // If first time login, upload local/default landlord info
          saveLandlordInfo(u.uid, landlord);
        }

        // Subscribe to tenants
        const unsubTenants = subscribeTenants(u.uid, (cloudTenants) => {
          if (cloudTenants.length > 0) {
            setTenants(mergeTenants(cloudTenants));
          }
        });

        // Subscribe to receipts
        setIsLoadingReceipts(true);
        const unsubReceipts = subscribeReceipts(u.uid, (cloudReceipts) => {
          // Deduplicate by ID just in case
          const unique = Array.from(new Map(cloudReceipts.map(item => [item.id, item])).values());
          setReceipts(unique.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || (a.createdAt instanceof Date ? a.createdAt : new Date(0));
            const dateB = b.createdAt?.toDate?.() || (b.createdAt instanceof Date ? b.createdAt : new Date(0));
            return dateB.getTime() - dateA.getTime();
          }));
          setIsLoadingReceipts(false);
        });

        return () => {
          unsubTenants();
          unsubReceipts();
        };
      } else {
        setReceipts([]);
        setIsLoadingReceipts(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      localStorage.setItem('rentmaster_tenants', JSON.stringify(tenants));
    }
  }, [tenants, user]);

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);

  const initialFormData: BillData = {
    tenantId: '',
    tenantName: '',
    flatNo: '',
    rentMonth: `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
    paymentDate: new Date().toISOString().split('T')[0],
    houseRent: 0,
    gasBill: 0,
    electricityBill: 0,
    wifiBill: 0,
    garbageBill: 0,
    previousDue: 0,
    paidAmount: 0,
  };

  const [formData, setFormData] = useState<BillData>(initialFormData);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<any | null>(null);

  const handleInputChange = (id: keyof BillData, value: string | number) => {
    if (id === 'tenantId') {
      const tenant = tenants.find(t => t.id === Number(value));
      
      // Auto-calculate previous due from history
      let autoPreviousDue = 0;
      if (user && receipts.length > 0) {
        const tenantHistory = receipts
          .filter(r => Number(r.tenantId) === Number(value))
          .sort((a, b) => {
             const dateA = a.createdAt?.toDate?.() || (a.createdAt instanceof Date ? a.createdAt : new Date(0));
             const dateB = b.createdAt?.toDate?.() || (b.createdAt instanceof Date ? b.createdAt : new Date(0));
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
        houseRent: tenant?.fixedRent || 0,
        gasBill: tenant ? 1080 : 0,
        wifiBill: tenant?.fixedWifi || 0,
        garbageBill: tenant ? 50 : 0,
        previousDue: autoPreviousDue, // Auto-fill the arrears
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

  const handleDeleteReceipt = async (id: string) => {
    if (confirm("Are you sure you want to delete this billing record?")) {
      if (user) {
        await removeReceipt(user.uid, id);
      }
    }
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

  const handleDeleteTenant = async (id: number) => {
    if (confirm("Are you sure you want to remove this tenant?")) {
      if (user) {
        await removeTenant(user.uid, id);
      } else {
        setTenants(prev => prev.filter(t => t.id !== id));
      }
      if (formData.tenantId === id) handleReset();
    }
  };

  const handleUpdateTenant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const updated: Tenant = {
      id: editingTenant?.id || Date.now(),
      name: fd.get('name') as string,
      phone: fd.get('phone') as string,
      address: fd.get('address') as string,
      flatNo: fd.get('flatNo') as string,
      fixedRent: parseFloat(fd.get('fixedRent') as string) || 0,
      fixedWifi: parseFloat(fd.get('fixedWifi') as string) || 0,
    };

    if (user) {
      await saveTenant(user.uid, updated);
    } else {
      if (editingTenant) {
        setTenants(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        setTenants(prev => [...prev, updated]);
      }
    }
    setEditingTenant(null);
    setIsAdding(false);
  };

  const liveTotalBill = useMemo(() => {
    const rent = Number(formData.houseRent) || 0;
    const gas = Number(formData.gasBill) || 0;
    const electricity = Number(formData.electricityBill) || 0;
    const wifi = Number(formData.wifiBill) || 0;
    const garbage = Number(formData.garbageBill) || 0;
    const prevDue = Number(formData.previousDue) || 0;
    return rent + gas + electricity + wifi + garbage + prevDue;
  }, [formData]);

  const handleUpdateLandlord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const updated: LandlordInfo = {
      houseName: fd.get('houseName') as string,
      houseNo: fd.get('houseNo') as string,
      name: fd.get('name') as string,
      mobile: fd.get('mobile') as string,
      address: fd.get('address') as string,
    };
    setLandlord(updated);
    if (user) {
      await saveLandlordInfo(user.uid, updated);
      alert("Property settings updated!");
    } else {
      alert("Settings saved locally. Sign in to sync with cloud!");
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

    // Ensure all numeric fields are numbers before saving and include flatNo
    const finalData = {
      ...formData,
      flatNo: formData.flatNo || tenants.find(t => Number(t.id) === Number(formData.tenantId))?.flatNo || '',
      houseRent: Number(formData.houseRent) || 0,
      gasBill: Number(formData.gasBill) || 0,
      electricityBill: Number(formData.electricityBill) || 0,
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

    setResult(calcResult);
    setEditingReceiptId(null); 

    if (user) {
      if (editingReceiptId) {
        await updateReceipt(user.uid, editingReceiptId, calcResult);
      } else {
        await saveReceipt(user.uid, calcResult);
      }
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
        <div className="absolute inset-0 bg-white/70 backdrop-blur-xl border-b border-slate-200/60" />
        <div className="relative max-w-6xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 ring-1 ring-white/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">RentMaster</h1>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-0.5">{landlord.houseName}</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl border border-slate-200/50">
            {(['calculator', 'history', 'tenants', 'landlord'] as const).map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
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
                <span className="relative z-10">{tab === 'landlord' ? 'Settings' : tab}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2 pr-1">
                <div className="hidden md:block text-right">
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight leading-none">{user.displayName?.split(' ')[0]}</p>
                </div>
                <button onClick={logout} className="p-2 hover:bg-slate-100 rounded-xl transition-all group" title="Logout">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-slate-200 group-hover:border-indigo-300" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-200" />
                  )}
                </button>
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-black transition-all"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
        {/* Landlord View */}
        {activeTab === 'landlord' && (
          <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="mb-10">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Building Profile</h2>
              <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-widest text-[10px]">Configure your property information</p>
            </div>
            
            <form onSubmit={handleUpdateLandlord} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                { label: 'House Name', id: 'houseName', value: landlord.houseName, icon: '🏠' },
                { label: 'House Number', id: 'houseNo', value: landlord.houseNo, icon: '📍' },
                { label: 'Proprietor', id: 'name', value: landlord.name, icon: '👤' },
                { label: 'Contact Mobile', id: 'mobile', value: landlord.mobile, icon: '📱' },
                { label: 'Full Location', id: 'address', value: landlord.address, icon: '🌎' },
              ].map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <span className="text-lg opacity-80">{item.icon}</span>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{item.label}</label>
                  </div>
                  <input 
                    name={item.id}
                    defaultValue={item.value} 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-lg font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>
              ))}
              <div className="md:col-span-2 pt-4">
                <button type="submit" className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {/* History View */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden">
            <div className="p-10 border-b border-slate-100 flex justify-between items-end bg-slate-50/30">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Billing History</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  {user ? (isLoadingReceipts ? "Synchronizing Cloud Data..." : `${receipts.length} total digital records`) : "Guest Mode - Local Storage"}
                </p>
              </div>
            </div>
            
            {!user ? (
               <div className="p-20 text-center space-y-6">
                  <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11 4a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase text-[10px] tracking-[0.2em]">Cloud Sync Required</h3>
                  <p className="text-slate-500 font-medium max-w-xs mx-auto text-sm">Please sign in with Google to enable permanent cloud archiving and billing analytics.</p>
                  <button onClick={signInWithGoogle} className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Enable Sync</button>
               </div>
            ) : isLoadingReceipts && receipts.length === 0 ? (
               <div className="p-20 text-center space-y-4">
                 <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                 <p className="text-slate-400 font-black uppercase tracking-widest text-[9px]">Gathering cloud records...</p>
               </div>
            ) : receipts.length === 0 ? (
               <div className="p-24 text-center">
                 <p className="font-black text-slate-300 uppercase tracking-[0.4em] text-xs">Zero records found</p>
               </div>
            ) : (
                <div className="p-10 space-y-12">
                  {groupedReceipts.map(([monthYear, records]) => (
                    <div key={monthYear} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] bg-indigo-50 px-4 py-1.5 rounded-lg border border-indigo-100/50">
                          {monthYear}
                        </span>
                        <div className="h-px flex-1 bg-slate-100"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {records.map(rec => (
                          <div key={rec.id} className="group bg-white rounded-2xl border border-slate-100 px-6 py-5 hover:border-indigo-200 transition-all shadow-sm hover:shadow-md flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex items-center gap-5">
                              <div className="bg-slate-50 w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all font-black text-sm border border-slate-100">
                                {rec.flatNo}
                              </div>
                              <div>
                                <h4 className="text-base font-black text-slate-900 tracking-tight">{rec.tenantName}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rec.paymentDate}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-10">
                              <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status</p>
                                <div className="flex flex-col items-end">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${rec.remainingDue > 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                    {rec.remainingDue > 0 ? 'In Arrears' : 'Settled'}
                                  </span>
                                  {rec.remainingDue > 0 && (
                                    <span className="text-[10px] font-black text-rose-600 mt-1 italic tracking-tighter">
                                      {formatCurrency(rec.remainingDue)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Paid</p>
                                <p className="text-lg font-black text-slate-900 tracking-tighter italic">{formatCurrency(rec.paidAmount)}</p>
                              </div>
                              
                              <div className="flex gap-1.5">
                                <button 
                                  onClick={() => setViewingReceipt(rec)}
                                  className="w-9 h-9 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"
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
                                  className="w-9 h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                                  title="Edit"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button 
                                  onClick={() => handleDeleteReceipt(rec.id)}
                                  className="w-9 h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:bg-rose-500 hover:text-white transition-all"
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

            {/* Receipt Modal Overlay */}
            {viewingReceipt && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md no-print">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="bg-white w-full max-w-lg max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-y-auto no-scrollbar relative"
                >
                  <div className="sticky top-0 right-0 p-6 flex justify-end z-[110] no-print bg-gradient-to-b from-white via-white/80 to-transparent">
                    <button 
                      onClick={() => setViewingReceipt(null)}
                      className="bg-slate-100 p-3 rounded-xl text-slate-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4 md:p-10 -mt-16">
                    <ReceiptCard 
                      data={viewingReceipt} 
                      landlord={landlord} 
                      flatNo={viewingReceipt.flatNo || tenants.find(t => t.id === Number(viewingReceipt.tenantId))?.flatNo || '??'}
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        )}

        {/* Tenants View */}
        {activeTab === 'tenants' && (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            <div className="p-10 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Tenant Directory</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Active Residents: {tenants.length}</p>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                New Resident
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 text-slate-400 uppercase text-[9px] font-black tracking-widest">
                  <tr>
                    <th className="px-10 py-5">Unit</th>
                    <th className="px-10 py-5">Resident</th>
                    <th className="px-10 py-5">Contact</th>
                    <th className="px-10 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants.map(tenant => (
                    <tr key={tenant.id} className="hover:bg-indigo-50/20 transition-all group">
                      <td className="px-10 py-6">
                        <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 font-black text-lg shadow-sm border border-indigo-100/50 group-hover:scale-105 transition-transform">
                          {tenant.flatNo}
                        </span>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col">
                          <span className="text-slate-900 font-extrabold text-base tracking-tight">{tenant.name}</span>
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">{tenant.address}</span>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <span className="text-slate-600 font-bold text-sm bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/50">{tenant.phone}</span>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingTenant(tenant)} className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white hover:text-indigo-600 border border-transparent hover:border-slate-200 hover:shadow-sm transition-all flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteTenant(tenant.id)} className="w-10 h-10 rounded-xl text-slate-400 hover:bg-white hover:text-red-600 border border-transparent hover:border-slate-200 hover:shadow-sm transition-all flex items-center justify-center">
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

            {/* Editor Modal */}
            {(editingTenant || isAdding) && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200"
                >
                  <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase text-[10px] tracking-[0.2em]">{editingTenant ? 'Modify Profile' : 'New Resident'}</h3>
                    <button onClick={() => {setEditingTenant(null); setIsAdding(false);}} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleUpdateTenant} className="p-8 space-y-5">
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Flat / Unit</label>
                        <input name="flatNo" defaultValue={editingTenant?.flatNo} placeholder="e.g. 5C" required className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mobile No.</label>
                        <input name="phone" defaultValue={editingTenant?.phone} placeholder="01XXX-XXXXXX" required className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fixed Rent</label>
                        <input name="fixedRent" type="number" defaultValue={editingTenant?.fixedRent} placeholder="5500" className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Fixed WiFi</label>
                        <input name="fixedWifi" type="number" defaultValue={editingTenant?.fixedWifi} placeholder="160" className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tenant Full Name</label>
                      <input name="name" defaultValue={editingTenant?.name} placeholder="Legal Name" required className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Permanent Address</label>
                      <input name="address" defaultValue={editingTenant?.address} placeholder="Address Details" required className="w-full px-5 py-3.5 rounded-xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-indigo-600 outline-none font-bold text-slate-800 transition-all" />
                    </div>
                    <button type="submit" className="w-full bg-slate-900 text-white font-black py-4 rounded-xl shadow-xl shadow-slate-100 mt-4 hover:bg-black transition-all text-[10px] uppercase tracking-[0.2em]">
                      Save Resident
                    </button>
                  </form>
                </motion.div>
              </div>
            )}
          </div>
        )}

        {/* Calculator View */}
        {activeTab === 'calculator' && (
          <div className="space-y-12">
            <div className="bg-white rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 overflow-hidden no-print">
              <form onSubmit={calculate} className="p-8 md:p-12">
                <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Billing Desk</h2>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mt-1">Generate Verified Paper Memo</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleReset}
                    className="group bg-slate-50 text-slate-400 px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all hover:bg-rose-50 hover:text-rose-500 flex items-center gap-2"
                  >
                    Clear Desk
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  {/* General Info */}
                  <div className="space-y-8">
                    <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100 space-y-6">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Resident Profile</h3>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Occupant</label>
                        <div className="relative">
                          <select 
                            className="w-full px-5 py-3.5 rounded-xl border-2 border-white focus:border-indigo-600 outline-none transition-all appearance-none bg-white font-bold text-slate-900 tracking-tight cursor-pointer shadow-sm"
                            value={formData.tenantId}
                            onChange={(e) => handleInputChange('tenantId', e.target.value)}
                            required
                          >
                            <option value="">Choose resident...</option>
                            {tenants.map(t => (
                              <option key={t.id} value={t.id}>[{t.flatNo}] {t.name}</option>
                            ))}
                          </select>
                          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-focus-within:text-indigo-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                        <InputGroup label="Billing Month" id="rentMonth" type="select" value={formData.rentMonth} options={MONTHS.map(m => `${m} ${new Date().getFullYear()}`)} onChange={(e) => handleInputChange('rentMonth', e.target.value)} />
                        <InputGroup label="Payment Date" id="paymentDate" type="date" value={formData.paymentDate} onChange={(e) => handleInputChange('paymentDate', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Financial Info */}
                  <div className="space-y-8">
                    <div className="bg-slate-900 p-8 rounded-[2rem] shadow-2xl space-y-6">
                      <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Financial Settlement</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Rent" id="houseRent" value={formData.houseRent} onChange={(e) => handleInputChange('houseRent', e.target.value)} />
                        <InputGroup label="Gas" id="gasBill" value={formData.gasBill} onChange={(e) => handleInputChange('gasBill', e.target.value)} />
                        <InputGroup label="Electric" id="electricityBill" value={formData.electricityBill} onChange={(e) => handleInputChange('electricityBill', e.target.value)} />
                        <InputGroup label="WiFi" id="wifiBill" value={formData.wifiBill} onChange={(e) => handleInputChange('wifiBill', e.target.value)} />
                        <InputGroup label="Garbage" id="garbageBill" value={formData.garbageBill} onChange={(e) => handleInputChange('garbageBill', e.target.value)} />
                        <InputGroup label="Arrears" id="previousDue" value={formData.previousDue} onChange={(e) => handleInputChange('previousDue', e.target.value)} />
                      </div>

                      <div className="pt-6 border-t border-slate-800 flex justify-between items-center">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Gross Inventory Total</span>
                        <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{formatCurrency(liveTotalBill)}</span>
                      </div>

                      <div className="space-y-1.5 pt-2">
                        <label className="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Received Payment (BDT)</label>
                        <input
                          type="number"
                          value={formData.paidAmount}
                          onChange={(e) => handleInputChange('paidAmount', e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-800/50 border-2 border-slate-800 rounded-xl px-6 py-4 text-emerald-400 font-black placeholder:text-slate-700 outline-none focus:border-emerald-600 transition-all text-xl tracking-tighter"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-100 transition-all transform hover:scale-[1.01] active:scale-[0.98] text-[11px] uppercase tracking-[0.3em]"
                >
                  {editingReceiptId ? 'Update Record' : 'Generate Memo'}
                </button>
              </form>
            </div>

            {/* Results */}
            {result && selectedTenant && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pb-20"
              >
                <div className="text-center mb-10 no-print flex flex-col items-center gap-2">
                  <div className="h-1 w-12 bg-indigo-200 rounded-full"></div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Verified Preview</h3>
                </div>
                <ReceiptCard 
                  data={result} 
                  landlord={landlord} 
                  flatNo={result.flatNo || selectedTenant.flatNo}
                />
              </motion.div>
            )}
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-20 pb-20 text-center no-print px-6">
        <div className="max-w-6xl mx-auto border-t border-slate-200 pt-10 flex flex-col items-center gap-4">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">
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
