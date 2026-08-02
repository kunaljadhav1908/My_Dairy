import { useEffect, useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Eye,
  Printer,
  Share2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { Bill, Customer, Payment, AppliedRateSnapshot } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatCurrency,
  monthName,
  currentMonth,
  currentYear,
  toCSV,
  downloadFile,
  classNames,
} from '@/lib/utils';

const PAGE_SIZE = 10;

export function Bills() {
  const { notify, settings } = useApp();
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [genModalOpen, setGenModalOpen] = useState(false);
  const [viewBill, setViewBill] = useState<Bill | null>(null);
  const [genMonth, setGenMonth] = useState(currentMonth());
  const [genYear, setGenYear] = useState(currentYear());
  const [generating, setGenerating] = useState(false);

  const symbol = settings?.currency_symbol ?? '₹';

  const load = async () => {
    setLoading(true);
    const [billsRes, custRes, payRes] = await Promise.all([
      supabase.from('bills').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('name'),
      supabase.from('payments').select('*'),
    ]);
    if (billsRes.error) {
      notify('Failed to load bills', 'error');
    } else {
      setBills(billsRes.data as Bill[]);
    }
    if (custRes.data) setCustomers(custRes.data as Customer[]);
    if (payRes.data) setPayments(payRes.data as Payment[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = bills;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.customer_name.toLowerCase().includes(q) ||
          b.invoice_number.toLowerCase().includes(q) ||
          b.customer_code.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'All') {
      list = list.filter((b) => b.payment_status === statusFilter);
    }
    return list;
  }, [bills, search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Get all collections for the selected month
      const startDate = `${genYear}-${String(genMonth).padStart(2, '0')}-01`;
      const endMonth = genMonth === 12 ? 1 : genMonth + 1;
      const endYear = genMonth === 12 ? genYear + 1 : genYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      const { data: collections } = await supabase
        .from('milk_collections')
        .select('*')
        .gte('collection_date', startDate)
        .lt('collection_date', endDate);

      if (!collections || collections.length === 0) {
        notify('No collections found for this month', 'error');
        setGenerating(false);
        return;
      }

      // Group by customer
      const byCustomer = new Map<string, typeof collections>();
      collections.forEach((c) => {
        const arr = byCustomer.get(c.customer_id) ?? [];
        arr.push(c);
        byCustomer.set(c.customer_id, arr);
      });

      // Delete existing bills for this month/year (regenerate)
      await supabase
        .from('bills')
        .delete()
        .eq('bill_month', genMonth)
        .eq('bill_year', genYear);

      let count = 0;
      for (const [customerId, colls] of byCustomer) {
        const customer = customers.find((c) => c.id === customerId);
        if (!customer) continue;

        const morningQty = colls.filter((c) => c.shift === 'Morning').reduce((s, c) => s + Number(c.quantity), 0);
        const eveningQty = colls.filter((c) => c.shift === 'Evening').reduce((s, c) => s + Number(c.quantity), 0);
        const totalQty = morningQty + eveningQty;
        const avgFat = colls.reduce((s, c) => s + Number(c.fat ?? 0), 0) / colls.length;
        const avgSnf = colls.reduce((s, c) => s + Number(c.snf ?? 0), 0) / colls.length;
        const grossAmount = colls.reduce((s, c) => s + Number(c.total_amount), 0);

        // Build applied rates snapshot
        const rateMap = new Map<string, AppliedRateSnapshot>();
        colls.forEach((c) => {
          const key = c.rate_rule_name ?? 'Manual';
          const existing = rateMap.get(key);
          if (existing) {
            existing.quantity += Number(c.quantity);
            existing.amount += Number(c.total_amount);
          } else {
            rateMap.set(key, {
              rule_name: key,
              rate_type: 'Fixed',
              base_rate: Number(c.applied_rate),
              applied_rate: Number(c.applied_rate),
              quantity: Number(c.quantity),
              amount: Number(c.total_amount),
            });
          }
        });
        const appliedRates = Array.from(rateMap.values()).map((r) => ({
          ...r,
          quantity: Math.round(r.quantity * 1000) / 1000,
          amount: Math.round(r.amount * 100) / 100,
        }));

        // Calculate advance payments for this customer
        const advancePayments = payments
          .filter((p) => p.customer_id === customerId && p.payment_type === 'Advance')
          .reduce((s, p) => s + Number(p.amount), 0);

        const netPayable = grossAmount - advancePayments;

        const { error } = await supabase.from('bills').insert({
          customer_id: customerId,
          customer_name: customer.name,
          customer_code: customer.customer_id,
          bill_month: genMonth,
          bill_year: genYear,
          morning_quantity: morningQty,
          evening_quantity: eveningQty,
          total_quantity: totalQty,
          average_fat: Math.round(avgFat * 100) / 100,
          average_snf: Math.round(avgSnf * 100) / 100,
          applied_rates: appliedRates,
          gross_amount: grossAmount,
          bonus: 0,
          deduction: 0,
          advance_payment: advancePayments,
          net_payable: netPayable,
          payment_status: netPayable <= 0 ? 'Paid' : 'Pending',
          status: 'Generated',
        });

        if (!error) count++;
      }

      notify(`Generated ${count} bills for ${monthName(genMonth)} ${genYear}`);
      setGenModalOpen(false);
      load();
    } catch {
      notify('Failed to generate bills', 'error');
    }
    setGenerating(false);
  };

  const handlePrint = (bill: Bill) => {
    setViewBill(bill);
    setTimeout(() => window.print(), 300);
  };

  const handleShare = async (bill: Bill) => {
    const text = `Bill ${bill.invoice_number}\n${bill.customer_name}\n${monthName(bill.bill_month)} ${bill.bill_year}\nTotal: ${formatCurrency(bill.net_payable, symbol)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bill ${bill.invoice_number}`, text });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(text);
      notify('Bill details copied to clipboard');
    }
  };

  const handleExport = () => {
    const rows = filtered.map((b) => ({
      'Invoice': b.invoice_number,
      'Customer': b.customer_name,
      'Customer ID': b.customer_code,
      'Month': `${monthName(b.bill_month)} ${b.bill_year}`,
      'Total Qty': b.total_quantity,
      'Avg Fat': b.average_fat,
      'Avg SNF': b.average_snf,
      'Gross': b.gross_amount,
      'Advance': b.advance_payment,
      'Net Payable': b.net_payable,
      'Status': b.payment_status,
    }));
    downloadFile(toCSV(rows), 'bills.csv', 'text/csv');
    notify('Bills exported');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input pl-10"
              placeholder="Search invoice, customer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input sm:max-w-[180px]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setGenModalOpen(true)}>
            <Sparkles size={18} /> Generate Bills
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        ) : paged.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="No bills generated yet"
            description="Generate monthly bills from milk collections. Each bill locks in the applied rates permanently."
            action={
              <button className="btn-primary" onClick={() => setGenModalOpen(true)}>
                <Sparkles size={18} /> Generate Bills
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="table-header">Invoice #</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Month</th>
                  <th className="table-header">Total Qty</th>
                  <th className="table-header">Avg Fat</th>
                  <th className="table-header">Avg SNF</th>
                  <th className="table-header">Gross</th>
                  <th className="table-header">Advance</th>
                  <th className="table-header">Net Payable</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="table-cell font-mono text-xs text-slate-500">{b.invoice_number}</td>
                    <td className="table-cell font-medium">{b.customer_name}</td>
                    <td className="table-cell text-slate-500">{monthName(b.bill_month)} {b.bill_year}</td>
                    <td className="table-cell">{Number(b.total_quantity).toFixed(2)} L</td>
                    <td className="table-cell text-slate-500">{b.average_fat}</td>
                    <td className="table-cell text-slate-500">{b.average_snf}</td>
                    <td className="table-cell">{formatCurrency(b.gross_amount, symbol)}</td>
                    <td className="table-cell text-slate-500">{formatCurrency(b.advance_payment, symbol)}</td>
                    <td className="table-cell font-semibold">{formatCurrency(b.net_payable, symbol)}</td>
                    <td className="table-cell">
                      <span
                        className={classNames(
                          'badge',
                          b.payment_status === 'Paid' ? 'badge-success' : b.payment_status === 'Partial' ? 'badge-warning' : 'badge-danger',
                        )}
                      >
                        {b.payment_status}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button className="btn-ghost p-2" onClick={() => setViewBill(b)} title="View">
                          <Eye size={16} />
                        </button>
                        <button className="btn-ghost p-2" onClick={() => handlePrint(b)} title="Print">
                          <Printer size={16} />
                        </button>
                        <button className="btn-ghost p-2" onClick={() => handleShare(b)} title="Share">
                          <Share2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && paged.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={filtered.length}
            pageSize={PAGE_SIZE}
          />
        )}
      </div>

      {/* Generate Modal */}
      <Modal
        open={genModalOpen}
        onClose={() => setGenModalOpen(false)}
        title="Generate Monthly Bills"
        size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setGenModalOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Select the month and year to generate bills. Bills are created from milk collections
            and lock in the applied rates permanently. Existing bills for the selected month will be replaced.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Month</label>
              <select
                className="input"
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{monthName(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select
                className="input"
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, i) => currentYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bill View Modal */}
      <Modal
        open={!!viewBill}
        onClose={() => setViewBill(null)}
        title="Bill Preview"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setViewBill(null)}>Close</button>
            <button className="btn-primary" onClick={() => viewBill && handlePrint(viewBill)}>
              <Printer size={16} /> Print / PDF
            </button>
          </>
        }
      >
        {viewBill && <BillPreview bill={viewBill} settings={settings} symbol={symbol} />}
      </Modal>
    </div>
  );
}

function BillPreview({
  bill,
  settings,
  symbol,
}: {
  bill: Bill;
  settings: ReturnType<typeof useApp>['settings'];
  symbol: string;
}) {
  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="logo" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FileText size={24} />
            </div>
          )}
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {settings?.dairy_name ?? 'Dairy'}
            </h2>
            {settings?.address && <p className="text-xs text-slate-500">{settings.address}</p>}
            {settings?.phone && <p className="text-xs text-slate-500">Phone: {settings.phone}</p>}
            {settings?.gst && <p className="text-xs text-slate-500">GST: {settings.gst}</p>}
          </div>
        </div>
        <div className="text-right">
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">INVOICE</h3>
          <p className="font-mono text-sm text-slate-500">{bill.invoice_number}</p>
          <p className="text-sm text-slate-500">{monthName(bill.bill_month)} {bill.bill_year}</p>
        </div>
      </div>

      {/* Customer info */}
      <div className="flex justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">BILL TO</p>
          <p className="font-semibold text-slate-900 dark:text-white">{bill.customer_name}</p>
          <p className="text-sm text-slate-500">ID: {bill.customer_code}</p>
        </div>
        <div className="text-right">
          <span
            className={classNames(
              'badge',
              bill.payment_status === 'Paid' ? 'badge-success' : bill.payment_status === 'Partial' ? 'badge-warning' : 'badge-danger',
            )}
          >
            {bill.payment_status}
          </span>
        </div>
      </div>

      {/* Collection summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400">Morning Qty</p>
          <p className="font-semibold">{Number(bill.morning_quantity).toFixed(2)} L</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400">Evening Qty</p>
          <p className="font-semibold">{Number(bill.evening_quantity).toFixed(2)} L</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400">Avg Fat</p>
          <p className="font-semibold">{bill.average_fat}%</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400">Avg SNF</p>
          <p className="font-semibold">{bill.average_snf}%</p>
        </div>
      </div>

      {/* Applied rates */}
      {bill.applied_rates.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Applied Rate(s)</p>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="table-header">Rate Rule</th>
                  <th className="table-header">Rate (₹/L)</th>
                  <th className="table-header">Quantity</th>
                  <th className="table-header text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bill.applied_rates.map((r, i) => (
                  <tr key={i}>
                    <td className="table-cell">{r.rule_name}</td>
                    <td className="table-cell">₹{r.applied_rate}</td>
                    <td className="table-cell">{r.quantity} L</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(r.amount, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="ml-auto w-full max-w-xs space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Gross Amount</span>
          <span className="font-semibold">{formatCurrency(bill.gross_amount, symbol)}</span>
        </div>
        {bill.bonus > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Bonus</span>
            <span className="font-semibold text-brand-600">+{formatCurrency(bill.bonus, symbol)}</span>
          </div>
        )}
        {bill.deduction > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Deduction</span>
            <span className="font-semibold text-red-500">-{formatCurrency(bill.deduction, symbol)}</span>
          </div>
        )}
        {bill.advance_payment > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Advance Payment</span>
            <span className="font-semibold text-red-500">-{formatCurrency(bill.advance_payment, symbol)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
          <span className="font-bold">Net Payable</span>
          <span className="font-display text-lg font-bold text-brand-600 dark:text-brand-400">
            {formatCurrency(bill.net_payable, symbol)}
          </span>
        </div>
      </div>

      {/* Footer */}
      {settings?.receipt_footer && (
        <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500 dark:border-slate-700">
          {settings.receipt_footer}
        </div>
      )}
      {settings?.terms_and_conditions && (
        <div className="text-xs text-slate-400">
          <p className="font-medium">Terms & Conditions:</p>
          <p className="mt-1">{settings.terms_and_conditions}</p>
        </div>
      )}
    </div>
  );
}
