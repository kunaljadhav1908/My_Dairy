export type MilkType = 'Cow' | 'Buffalo' | 'Mixed';
export type CustomerType = 'Supplier' | 'Buyer' | 'All';
export type CustomerCategory = 'Supplier' | 'Buyer' | 'Both';
export type RateType = 'Fixed' | 'FatBased' | 'FatSnfBased' | 'CustomerSpecific' | 'Manual';
export type Shift = 'Morning' | 'Evening';
export type PaymentStatus = 'Pending' | 'Partial' | 'Paid';
export type PaymentMode = 'Cash' | 'UPI' | 'Bank';
export type PaymentType = 'Full' | 'Partial' | 'Advance';

export interface Settings {
  id: number;
  dairy_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  gst: string | null;
  upi_id: string | null;
  upi_qr_url: string | null;
  receipt_footer: string | null;
  terms_and_conditions: string | null;
  currency: string;
  currency_symbol: string;
  dark_mode: boolean;
  updated_at: string;
}

export interface Customer {
  id: string;
  customer_id: string;
  name: string;
  mobile: string | null;
  address: string | null;
  village: string | null;
  joining_date: string;
  aadhaar: string | null;
  category: CustomerCategory;
  custom_rate: number | null;
  default_milk_type: MilkType | null;
  payment_cycle: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilkRate {
  id: string;
  rule_name: string;
  milk_type: MilkType | 'All';
  customer_type: CustomerType;
  rate_type: RateType;
  base_rate: number;
  fat_min: number | null;
  fat_max: number | null;
  fat_bonus_per_unit: number | null;
  snf_min: number | null;
  snf_max: number | null;
  snf_bonus_per_unit: number | null;
  customer_id: string | null;
  shift: Shift | 'Both' | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateHistory {
  id: string;
  rate_id: string | null;
  rule_name: string;
  milk_type: string | null;
  customer_type: string | null;
  rate_type: string | null;
  base_rate: number | null;
  fat_min: number | null;
  fat_max: number | null;
  snf_min: number | null;
  snf_max: number | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean | null;
  action: 'Created' | 'Updated' | 'Deleted' | 'Activated' | 'Deactivated';
  changed_by: string;
  snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface MilkCollection {
  id: string;
  collection_date: string;
  shift: Shift;
  customer_id: string;
  customer_name: string;
  milk_type: MilkType;
  quantity: number;
  fat: number | null;
  snf: number | null;
  rate_rule_id: string | null;
  rate_rule_name: string | null;
  applied_rate: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppliedRateSnapshot {
  rule_name: string;
  rate_type: RateType;
  base_rate: number;
  applied_rate: number;
  quantity: number;
  amount: number;
}

export interface Bill {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  bill_month: number;
  bill_year: number;
  morning_quantity: number;
  evening_quantity: number;
  total_quantity: number;
  average_fat: number;
  average_snf: number;
  applied_rates: AppliedRateSnapshot[];
  gross_amount: number;
  bonus: number;
  deduction: number;
  advance_payment: number;
  net_payable: number;
  payment_status: PaymentStatus;
  status: 'Draft' | 'Generated' | 'Sent' | 'Cancelled';
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  customer_id: string;
  customer_name: string;
  bill_id: string | null;
  invoice_number: string | null;
  amount: number;
  payment_type: PaymentType;
  payment_mode: PaymentMode;
  payment_date: string;
  reference_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerWithStats extends Customer {
  total_collections?: number;
  total_quantity?: number;
  total_amount?: number;
  pending_amount?: number;
}
