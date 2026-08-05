
import React from 'react';
import { CalculationResult, LandlordInfo } from '../types';

interface ReceiptCardProps {
  data: CalculationResult;
  landlord: LandlordInfo;
  flatNo: string;
}

declare global {
  interface Window {
    html2canvas: any;
  }
}

export const ReceiptCard: React.FC<ReceiptCardProps> = ({ data, landlord, flatNo }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(val).replace('BDT', '৳');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
  };

  const handleSaveImage = async () => {
    const element = document.getElementById('receipt-section');
    if (!element) return;

    try {
      const canvas = await window.html2canvas(element, {
        scale: 2, // Better resolution
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      
      const link = document.createElement('a');
      link.download = `Rent_Memo_${data.tenantName.replace(/\s+/g, '_')}_${data.rentMonth}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
    }
  };

  const rows = [
    { label: 'Basic House Rent', value: data.houseRent },
    { label: 'Gas Utility Bill', value: data.gasBill },
    { label: 'Electricity Bill', value: data.electricityBill },
    { label: 'Water / Service Bill', value: data.waterBill || 0 },
    { label: 'WiFi / Internet Service', value: data.wifiBill },
    { label: 'Waste Management (Garbage)', value: data.garbageBill },
    { label: 'Previous Arrears / Due', value: data.previousDue },
  ];

  const isPaid = data.paidAmount > 0;

  return (
    <div className="receipt-container space-y-4 sm:space-y-6">
      <div id="receipt-section" className="receipt-paper mx-auto w-full max-w-sm bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-2xl border border-slate-100 overflow-hidden relative">
        {/* Paid Stamp - Conditional (Middle watermark style) */}
        {isPaid && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 opacity-[0.05] transform -rotate-12">
            <div className="border-[6px] border-emerald-600 rounded-[2rem] p-4 sm:p-6 flex flex-col items-center">
              <span className="text-4xl sm:text-6xl font-black text-emerald-600 uppercase tracking-tighter leading-none italic">PAID</span>
              <span className="text-[10px] sm:text-xs font-black text-emerald-600 uppercase tracking-[0.6em] mt-1 sm:mt-2">Verified</span>
            </div>
          </div>
        )}

        <div className="p-3.5 sm:p-8">
          <div className="flex flex-row justify-between items-start border-b-2 border-slate-900 pb-3 sm:pb-4 mb-4 sm:mb-6 gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="bg-slate-900 text-white px-2 py-0.5 rounded inline-block text-[8px] font-black uppercase tracking-[0.3em] mb-1">
                Memo
              </div>
              <div>
                <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tighter leading-tight mb-0.5 truncate">{landlord.houseName}</h2>
                <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{landlord.address}</p>
              </div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest space-y-0.5 pt-0.5">
                <p className="truncate">Proprietor: <span className="text-slate-700 font-black">{landlord.name}</span></p>
                <p className="truncate">Contact: <span className="text-slate-700 font-black">{landlord.mobile}</span></p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 sm:p-3 text-right shrink-0">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">SN#</p>
              <p className="text-sm sm:text-lg font-black text-slate-900 tracking-tighter font-mono italic">#{((data as any).id || Date.now()).toString().slice(-6)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-100 min-w-0">
              <h4 className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Tenant</h4>
              <p className="text-xs sm:text-base font-black text-slate-900 tracking-tight leading-tight truncate">{data.tenantName}</p>
              <div className="w-full h-px bg-slate-200 my-1"></div>
              <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Flat: {flatNo}</p>
            </div>
            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-100 text-right min-w-0">
              <h4 className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Period</h4>
              <p className="text-xs sm:text-base font-black text-slate-900 tracking-tight leading-tight truncate">{data.rentMonth}</p>
              <div className="w-full h-px bg-slate-200 my-1"></div>
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest">{formatDate(data.paymentDate)}</p>
            </div>
          </div>

          <table className="w-full mb-4 sm:mb-6">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1.5 text-[8px] font-black text-slate-900 uppercase tracking-[0.15em]">Description</th>
                <th className="text-right py-1.5 text-[8px] font-black text-slate-900 uppercase tracking-[0.15em]">Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={idx} className="group">
                  <td className="py-2 text-[10px] sm:text-[11px] font-bold text-slate-500 group-hover:text-slate-900 transition-colors uppercase tracking-tight">{row.label}</td>
                  <td className="py-2 text-right font-mono font-black text-slate-900 text-[11px] sm:text-[12px] tracking-tighter">
                    {formatCurrency(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-900">
              <tr className="bg-slate-50/80">
                <td className="py-2 px-2.5 sm:py-3 sm:px-3 text-[8px] sm:text-[9px] font-black text-slate-900 uppercase tracking-widest">Sub Total</td>
                <td className="py-2 px-2.5 sm:py-3 sm:px-3 text-right font-mono text-xs sm:text-[15px] font-black text-slate-900 tracking-tighter">{formatCurrency(data.totalBill)}</td>
              </tr>
              <tr className="text-emerald-600">
                <td className="py-1.5 px-2.5 sm:px-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Paid (-)</td>
                <td className="py-1.5 px-2.5 sm:px-3 text-right font-mono text-xs sm:text-[13px] font-black tracking-tighter italic">{formatCurrency(data.paidAmount)}</td>
              </tr>
              <tr className="bg-indigo-600 text-white relative">
                <td className="py-2.5 px-3 sm:py-4 sm:px-5 text-xs sm:text-sm font-black uppercase tracking-wider relative z-10">Balance Due</td>
                <td className="py-2.5 px-3 sm:py-4 sm:px-5 text-right font-mono text-base sm:text-2xl font-black relative z-10 tracking-tighter">{formatCurrency(data.remainingDue)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-4 sm:mt-8 text-center text-[7px] font-black text-slate-300 uppercase tracking-[0.4em] pt-3 sm:pt-4 border-t border-slate-50">
            Digital Memo &bull; Generated Online
          </div>
        </div>
      </div>

      <div className="flex justify-center items-center no-print pb-4 sm:pb-10">
        <button 
          onClick={handleSaveImage}
          className="w-full sm:w-auto flex items-center justify-center gap-2 sm:gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider sm:tracking-widest transition-all shadow-xl shadow-indigo-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Save Memo as JPG Image
        </button>
      </div>
    </div>
  );
};
