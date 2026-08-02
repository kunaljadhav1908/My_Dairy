import type {
  MilkRate,
  MilkType,
  Customer,
  Shift,
  RateType,
} from '@/types';

export interface RateCalculation {
  appliedRate: number;
  ruleId: string | null;
  ruleName: string | null;
  rateType: RateType;
  baseRate: number;
}

/**
 * Calculate the applied rate for a milk collection.
 * Priority order:
 *   1. Customer-specific rate (rate_type = 'CustomerSpecific') matching this customer
 *   2. Customer's custom_rate override (from customer record)
 *   3. Fat+SNF based rule
 *   4. Fat based rule
 *   5. Fixed rate
 *   6. Manual rate (returns base_rate as starting point, owner can override)
 *
 * Only considers rules that are active and whose effective date range covers the collection date.
 */
export function calculateRate(
  rates: MilkRate[],
  customer: Pick<Customer, 'id' | 'custom_rate' | 'category' | 'default_milk_type'>,
  params: {
    milkType: MilkType;
    shift: Shift;
    fat?: number | null;
    snf?: number | null;
    collectionDate: string; // ISO date yyyy-mm-dd
  },
): RateCalculation {
  const { milkType, shift, fat, snf, collectionDate } = params;
  const date = collectionDate.slice(0, 10);

  const eligible = rates.filter((r) => {
    if (!r.is_active) return false;
    if (r.effective_from && date < r.effective_from) return false;
    if (r.effective_to && date > r.effective_to) return false;
    // milk type match
    if (r.milk_type !== 'All' && r.milk_type !== milkType) return false;
    // shift match
    if (r.shift && r.shift !== 'Both' && r.shift !== shift) return false;
    // customer type match
    const catMatch =
      r.customer_type === 'All' ||
      (r.customer_type === 'Supplier' && (customer.category === 'Supplier' || customer.category === 'Both')) ||
      (r.customer_type === 'Buyer' && (customer.category === 'Buyer' || customer.category === 'Both'));
    if (!catMatch) return false;
    return true;
  });

  // 1. Customer-specific rule
  const customerSpecific = eligible.find(
    (r) => r.rate_type === 'CustomerSpecific' && r.customer_id === customer.id,
  );
  if (customerSpecific) {
    return finalize(customerSpecific, fat, snf);
  }

  // 2. Customer custom_rate override (if set, use as fixed price)
  if (customer.custom_rate != null && customer.custom_rate > 0) {
    return {
      appliedRate: customer.custom_rate,
      ruleId: null,
      ruleName: 'Customer Custom Rate',
      rateType: 'CustomerSpecific',
      baseRate: customer.custom_rate,
    };
  }

  // 3. Fat+SNF based
  const fatSnf = eligible.find((r) => r.rate_type === 'FatSnfBased');
  if (fatSnf) return finalize(fatSnf, fat, snf);

  // 4. Fat based
  const fatBased = eligible.find((r) => r.rate_type === 'FatBased');
  if (fatBased) return finalize(fatBased, fat, snf);

  // 5. Fixed
  const fixed = eligible.find((r) => r.rate_type === 'Fixed');
  if (fixed) return finalize(fixed, fat, snf);

  // 6. Manual
  const manual = eligible.find((r) => r.rate_type === 'Manual');
  if (manual) return finalize(manual, fat, snf);

  // Fallback: no rule matched
  return {
    appliedRate: 0,
    ruleId: null,
    ruleName: null,
    rateType: 'Manual',
    baseRate: 0,
  };
}

function finalize(
  rule: MilkRate,
  fat: number | null | undefined,
  snf: number | null | undefined,
): RateCalculation {
  let rate = rule.base_rate;

  if (rule.rate_type === 'FatBased' && fat != null) {
    // base_rate covers fat_min; bonus per 0.1% fat above fat_min
    const fatMin = rule.fat_min ?? 0;
    const bonusPer = rule.fat_bonus_per_unit ?? 0;
    if (fat > fatMin) {
      const diff = fat - fatMin;
      rate += (diff / 0.1) * bonusPer;
    }
  } else if (rule.rate_type === 'FatSnfBased') {
    let extra = 0;
    if (fat != null) {
      const fatMin = rule.fat_min ?? 0;
      const fatBonus = rule.fat_bonus_per_unit ?? 0;
      if (fat > fatMin) {
        extra += ((fat - fatMin) / 0.1) * fatBonus;
      }
    }
    if (snf != null) {
      const snfMin = rule.snf_min ?? 0;
      const snfBonus = rule.snf_bonus_per_unit ?? 0;
      if (snf > snfMin) {
        extra += ((snf - snfMin) / 0.1) * snfBonus;
      }
    }
    rate = rule.base_rate + extra;
  }

  return {
    appliedRate: Math.round(rate * 100) / 100,
    ruleId: rule.id,
    ruleName: rule.rule_name,
    rateType: rule.rate_type,
    baseRate: rule.base_rate,
  };
}

export function calculateAmount(quantity: number, appliedRate: number): number {
  return Math.round(quantity * appliedRate * 100) / 100;
}
