
export interface LandlordInfo {
  houseName: string;
  houseNo: string;
  name: string;
  mobile: string;
  address: string;
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
  wifiBill: number;
  garbageBill: number;
  previousDue: number;
  paidAmount: number;
}

export interface CalculationResult extends BillData {
  totalBill: number;
  remainingDue: number;
}