import { useEffect, useState } from 'react';
import {
  Milk,
  Wallet,
  TrendingUp,
  Users,
  FileWarning,
  FileCheck,
  Droplets,
  Gauge,
  ArrowUpRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { Bill, MilkCollection, Payment } from '@/types';
import { StatCard } from '@/components/ui/StatCard';
import { DonutChart, LineChart } from '@/components/ui/Charts';
import { formatCurrency, todayISO, currentMonth, currentYear, monthName } from '@/lib/utils';

interface DashboardData {
  todayQuantity: number;
  todayIncome: number;
  monthlyIncome: number;
  totalCustomers: number;
  pendingBills: number;
  paidBills: number;
  todayAvgFat: number;
  todayAvgSnf: number;
  topSuppliers: { name: string; quantity: number; amount: number }[];
  recentPayments: { customer_name: string; amount: number; payment_mode: string; payment_date: string }[];
  last7Days: { label: string; value: number }[];
  milkTypeSplit: { label: string; value: number; color: string }[];
}

export function Dashboard() {
  const { settings } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    const today = todayISO();
    const month = currentMonth();
    const year = currentYear();
    const symbol = settings?.currency_symbol ?? '₹';

    // Today's collections
    const { data: todayColl } = (await (supabase
      .from('milk_collections')
      .select('quantity, fat, snf, total_amount, milk_type')
      .eq('collection_date', today) as unknown)) as { data: MilkCollection[] | null; error: unknown };
 
    const todayQuantity = todayColl?.reduce((s, c) => s + Number(c.quantity), 0) ?? 0;
    const todayIncome = todayColl?.reduce((s, c) => s + Number(c.total_amount), 0) ?? 0;
    const todayAvgFat = todayColl && todayColl.length > 0
      ? todayColl.reduce((s, c) => s + Number(c.fat ?? 0), 0) / todayColl.length
      : 0;
    const todayAvgSnf = todayColl && todayColl.length > 0
      ? todayColl.reduce((s, c) => s + Number(c.snf ?? 0), 0) / todayColl.length
      : 0;

    // Milk type split
    const milkTypes = ['Cow', 'Buffalo', 'Mixed'] as const;
    const milkTypeSplit = milkTypes.map((type, i) => {
      const value = todayColl?.filter((c) => c.milk_type === type).reduce((s, c) => s + Number(c.quantity), 0) ?? 0;
      return {
        label: type,
        value: Math.round(value * 100) / 100,
        color: ['#16a34a', '#f59e0b', '#3b82f6'][i],
      };
    }).filter((d) => d.value > 0);

    // Monthly income
    const { data: monthColl } = (await (supabase
      .from('milk_collections')
      .select('total_amount')
      .gte('collection_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('collection_date', `${year}-${String(month + 1).padStart(2, '0')}-01`) as unknown)) as { data: MilkCollection[] | null; error: unknown };
 
    const monthlyIncome = monthColl?.reduce((s, c) => s + Number(c.total_amount), 0) ?? 0;

    // Total customers
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
 
    // Bills
    const { data: bills } = (await (supabase
      .from('bills')
      .select('payment_status') as unknown)) as { data: Bill[] | null; error: unknown };

    const pendingBills = bills?.filter((b) => b.payment_status === 'Pending').length ?? 0;
    const paidBills = bills?.filter((b) => b.payment_status === 'Paid').length ?? 0;

    // Top suppliers (by quantity this month)
    const { data: topColl } = (await (supabase
      .from('milk_collections')
      .select('customer_name, quantity, total_amount')
      .gte('collection_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lt('collection_date', `${year}-${String(month + 1).padStart(2, '0')}-01`) as unknown)) as { data: MilkCollection[] | null; error: unknown };

    const supplierMap = new Map<string, { quantity: number; amount: number }>();
    topColl?.forEach((c) => {
      const existing = supplierMap.get(c.customer_name) ?? { quantity: 0, amount: 0 };
      existing.quantity += Number(c.quantity);
      existing.amount += Number(c.total_amount);
      supplierMap.set(c.customer_name, existing);
    });
    const topSuppliers = Array.from(supplierMap.entries())
      .map(([name, v]) => ({ name, quantity: Math.round(v.quantity * 100) / 100, amount: v.amount }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Recent payments
    const { data: recentPayments } = (await (supabase
      .from('payments')
      .select('customer_name, amount, payment_mode, payment_date')
      .order('created_at', { ascending: false })
      .limit(5) as unknown)) as { data: Payment[] | null; error: unknown };

    // Last 7 days
    const last7Days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayColl = todayColl && todayColl.length > 0 ? null : null;
      void dayColl;
      const { data: dayData } = (await (supabase
        .from('milk_collections')
        .select('total_amount')
        .eq('collection_date', dateStr) as unknown)) as { data: MilkCollection[] | null; error: unknown };
      const total = dayData?.reduce((s, c) => s + Number(c.total_amount), 0) ?? 0;
      last7Days.push({
        label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        value: Math.round(total),
      });
    }

    setData({
      todayQuantity: Math.round(todayQuantity * 100) / 100,
      todayIncome,
      monthlyIncome,
      totalCustomers: totalCustomers ?? 0,
      pendingBills,
      paidBills,
      todayAvgFat: Math.round(todayAvgFat * 100) / 100,
      todayAvgSnf: Math.round(todayAvgSnf * 100) / 100,
      topSuppliers,
      recentPayments: recentPayments ?? [],
      last7Days,
      milkTypeSplit,
    });
    setLoading(false);
    void symbol;
  };

  if (loading || !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  const symbol = settings?.currency_symbol ?? '₹';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's Collection"
          value={`${data.todayQuantity} L`}
          icon={<Milk size={22} />}
          color="brand"
        />
        <StatCard
          label="Today's Income"
          value={formatCurrency(data.todayIncome, symbol)}
          icon={<Wallet size={22} />}
          color="accent"
        />
        <StatCard
          label="Monthly Income"
          value={formatCurrency(data.monthlyIncome, symbol)}
          icon={<TrendingUp size={22} />}
          color="blue"
        />
        <StatCard
          label="Total Customers"
          value={data.totalCustomers}
          icon={<Users size={22} />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending Bills"
          value={data.pendingBills}
          icon={<FileWarning size={22} />}
          color="red"
        />
        <StatCard
          label="Paid Bills"
          value={data.paidBills}
          icon={<FileCheck size={22} />}
          color="brand"
        />
        <StatCard
          label="Today's Avg Fat"
          value={data.todayAvgFat}
          icon={<Droplets size={22} />}
          color="accent"
        />
        <StatCard
          label="Today's Avg SNF"
          value={data.todayAvgSnf}
          icon={<Gauge size={22} />}
          color="blue"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Income — Last 7 Days
            </h3>
          </div>
          <LineChart data={data.last7Days} />
        </div>
        <div className="card p-6">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            Today's Milk Split
          </h3>
          <DonutChart data={data.milkTypeSplit} />
        </div>
      </div>

      {/* Top suppliers + Recent payments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            Top Suppliers — {monthName(currentMonth())} {currentYear()}
          </h3>
          {data.topSuppliers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No collections this month yet</p>
          ) : (
            <div className="space-y-3">
              {data.topSuppliers.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {i + 1}
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 dark:text-white">{s.quantity} L</p>
                    <p className="text-xs text-slate-500">{formatCurrency(s.amount, symbol)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            Recent Payments
          </h3>
          {data.recentPayments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No payments recorded yet</p>
          ) : (
            <div className="space-y-3">
              {data.recentPayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{p.customer_name}</p>
                    <p className="text-xs text-slate-500">{p.payment_mode} · {p.payment_date}</p>
                  </div>
                  <div className="flex items-center gap-1 text-brand-600 dark:text-brand-400">
                    <ArrowUpRight size={16} />
                    <span className="font-semibold">{formatCurrency(p.amount, symbol)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
