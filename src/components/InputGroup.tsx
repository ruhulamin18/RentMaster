
import React from 'react';

interface InputGroupProps {
  label: string;
  id: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export const InputGroup: React.FC<InputGroupProps> = ({
  label,
  id,
  type = "number",
  value,
  onChange,
  placeholder,
  options,
  required = true
}) => {
  const isPreviousDue = id === 'previousDue';
  const displayValue = value;
  
  const minVal = isPreviousDue ? -9999999 : 0;

  // Use a dark theme if inside a dark container (like the financial breakdown)
  const isFinancial = ['houseRent', 'gasBill', 'electricityBill', 'waterBill', 'wifiBill', 'garbageBill', 'previousDue'].includes(id);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label htmlFor={id} className={`text-[10px] font-black uppercase tracking-widest ml-1 ${isFinancial ? 'text-slate-500' : 'text-slate-400'}`}>
        {label}
      </label>
      <div className="relative group">
        {type === "select" ? (
          <div className="relative">
            <select
              id={id}
              value={value}
              onChange={onChange}
              className={`w-full px-5 py-3.5 rounded-xl border-2 outline-none transition-all font-bold tracking-tight appearance-none cursor-pointer shadow-sm ${
                isFinancial 
                ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500' 
                : 'bg-slate-50 border-slate-100 focus:bg-white focus:border-indigo-600 text-slate-900'
              }`}
              required={required}
            >
              <option value="">Choose...</option>
              {options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${isFinancial ? 'text-slate-600' : 'text-slate-300'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        ) : (
          <input
            id={id}
            type={type}
            value={displayValue}
            onChange={onChange}
            placeholder={placeholder || "0"}
            className={`w-full px-5 py-3.5 rounded-xl border-2 outline-none transition-all font-bold tracking-tight shadow-sm ${
              isFinancial 
              ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-700 focus:border-indigo-500' 
              : 'bg-slate-50 border-slate-100 focus:bg-white focus:border-indigo-600 text-slate-900 placeholder:text-slate-300'
            }`}
            required={required}
            min={type === "number" ? minVal : undefined}
            step="any"
            onFocus={(e) => {
              if (type === "number") {
                e.target.select();
              }
            }}
          />
        )}
      </div>
    </div>
  );
};