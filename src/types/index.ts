
export interface LandlordInfo {
  houseName: string;
  houseNo: string;
  name: string;
  mobile: string;
  address: string;
  defaultGasBill?: number;
  defaultGarbageBill?: number;
  defaultWaterBill?: number;
}

export interface Tenant {
  id: number;
  name: string;
  address: string;
  phone: string;
  flatNo: string;
  fixedRent?: number;
  fixedWifi?: number;
}

export interface BillData {
  tenantId: number | string;
  tenantName: string;
  flatNo: string;
  rentMonth: string;
  paymentDate: string;
  houseRent: number;
  gasBill: number;
  electricityBill: number;
  waterBill?: number;
  wifiBill: number;
  garbageBill: number;
  previousDue: number;
  paidAmount: number;
}

export interface CalculationResult extends BillData {
  totalBill: number;
  remainingDue: number;
}

export interface ReceiptRecord extends CalculationResult {
  id: string;
  ownerId?: string;
  landlordInfo?: LandlordInfo;
  tenantPhone?: string;
  phone?: string;
  createdAt?: any;
  updatedAt?: any;
  flatNoNorm?: string;
  tenantNameNorm?: string;
  tenantPhoneNorm?: string;
  houseNameNorm?: string;
  houseNoNorm?: string;
  landlordNameNorm?: string;
  landlordMobileNorm?: string;
}
