import { useEffect, useState, useMemo } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Trash2,
  Banknote,
  Smartphone,
  Building2,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { Payment, Customer, Bill, PaymentMode, PaymentType } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, todayISO, toCSV, downloadFile, classNames } from '@/lib/utils';

const PAGE_SIZE = 10;

const modeIcons: Record<PaymentMode, React.ReactNode> = {
  Cash: <Banknote size={16} />,
  UPI: <Smartphone size={16} />,
  Bank: <Building2 size={16} />,
};

export function Payments() {
  const { notify, settings } = useApp();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const symbol = settings?.currency_symbol ?? '₹';

  const load = async () => {
    setLoading(true);
    const [payRes, custRes, billRes] = await Promise.all([
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('bills').select('*'),
    ]);
    if (payRes.error) {
      notify('Failed to load payments', 'error');
    } else {
      setPayments(payRes.data as Payment[]);
    }
    if (custRes.data) setCustomers(custRes.data as Customer[]);
    if (billRes.data) setBills(billRes.data as Bill[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = payments;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.customer_name.toLowerCase().includes(q) ||
          p.payment_number.toLowerCase().includes(q) ||
          p.invoice_number?.toLowerCase().includes(q),
      );
    }
    if (modeFilter !== 'All') {
      list = list.filter((p) => p.payment_mode === modeFilter);
    }
    return list;
  }, [payments, search, modeFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, p) => s + Number(p.amount), 0);
    const byMode = {
      Cash: filtered.filter((p) => p.payment_mode === 'Cash').reduce((s, p) => s + Number(p.amount), 0),
      UPI: filtered.filter((p) => p.payment_mode === 'UPI').reduce((s, p) => s + Number(p.amount), 0),
      Bank: filtered.filter((p) => p.payment_mode === 'Bank').reduce((s, p) => s + Number(p.amount), 0),
    };
    return { total, byMode };
  }, [filtered]);

  const handleSave = async (form: Partial<Payment>) => {
    const customer = customers.find((c) => c.id === form.customer_id);
    if (!customer) {
      notify('Please select a customer', 'error');
      return;
    }

    const bill = form.bill_id ? bills.find((b) => b.id === form.bill_id) : null;

    const { error } = await supabase.from('payments').insert({
      customer_id: form.customer_id,
      customer_name: customer.name,
      bill_id: form.bill_id ?? null,
      invoice_number: bill?.invoice_number ?? null,
      amount: Number(form.amount),
      payment_type: form.payment_type ?? 'Full',
      payment_mode: form.payment_mode ?? 'Cash',
      payment_date: form.payment_date ?? todayISO(),
      reference_note: form.reference_note ?? null,
      notes: form.notes ?? null,
    });

    if (error) {
      notify('Failed to record payment', 'error');
      return;
    }

    // Update bill payment status if linked
    if (bill) {
      const billPayments = payments.filter((p) => p.bill_id === bill.id).reduce((s, p) => s + Number(p.amount), 0);
      const totalPaid = billPayments + Number(form.amount);
      let status: 'Pending' | 'Partial' | 'Paid' = 'Pending';
      if (totalPaid >= bill.net_payable) status = 'Paid';
      else if (totalPaid > 0) status = 'Partial';
      await supabase.from('bills').update({ payment_status: status }).eq('id', bill.id);
    }

    notify('Payment recorded');
    load();
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('payments').delete().eq('id', deleteTarget.id);
    if (error) {
      notify('Failed to delete payment', 'error');
    } else {
      notify('Payment deleted');
      load();
    }
  };

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      'Payment #': p.payment_number,
      'Date': p.payment_date,
      'Customer': p.customer_name,
      'Invoice': p.invoice_number ?? '',
      'Amount': p.amount,
      'Type': p.payment_type,
      'Mode': p.payment_mode,
      'Reference': p.reference_note ?? '',
    }));
    downloadFile(toCSV(rows), 'payments.csv', 'text/csv');
    notify('Payments exported');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Payments</p>
          <p className="mt-1 font-display text-xl font-bold text-brand-600 dark:text-brand-400">
            {formatCurrency(summary.total, symbol)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Cash</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(summary.byMode.Cash, symbol)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">UPI</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(summary.byMode.UPI, symbol)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Bank</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(summary.byMode.Bank, symbol)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input pl-10"
              placeholder="Search customer, payment #..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input sm:max-w-[150px]"
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Modes</option>
            <option value="Cash">Cash</option>
            <option value="UPI">UPI</option>
            <option value="Bank">Bank</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={18} /> Record Payment
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
            icon={<Wallet size={40} />}
            title="No payments recorded"
            description="Record payments from customers — full, partial, or advance. Link payments to bills to track outstanding amounts."
            action={
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <Plus size={18} /> Record Payment
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="table-header">Payment #</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Mode</th>
                  <th className="table-header">Reference</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="table-cell font-mono text-xs text-slate-500">{p.payment_number}</td>
                    <td className="table-cell text-slate-500">{formatDate(p.payment_date)}</td>
                    <td className="table-cell font-medium">{p.customer_name}</td>
                    <td className="table-cell text-slate-500">{p.invoice_number ?? '-'}</td>
                    <td className="table-cell font-semibold text-brand-600 dark:text-brand-400">
                      {formatCurrency(p.amount, symbol)}
                    </td>
                    <td className="table-cell">
                      <span
                        className={classNames(
                          'badge',
                          p.payment_type === 'Full' ? 'badge-success' : p.payment_type === 'Partial' ? 'badge-warning' : 'badge-neutral',
                        )}
                      >
                        {p.payment_type}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        {modeIcons[p.payment_mode]}
                        {p.payment_mode}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-slate-500">{p.reference_note ?? '-'}</td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 size={16} />
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

      {/* Form Modal */}
      <PaymentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        customers={customers}
        bills={bills}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Payment"
        message="Delete this payment record? This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

function PaymentFormModal({
  open,
  onClose,
  customers,
  bills,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  bills: Bill[];
  onSave: (form: Partial<Payment>) => void;
}) {
  const [form, setForm] = useState<Partial<Payment>>({});
  const [customerBills, setCustomerBills] = useState<Bill[]>([]);

  useEffect(() => {
    if (open) {
      setForm({
        customer_id: '',
        bill_id: null,
        amount: 0,
        payment_type: 'Full',
        payment_mode: 'Cash',
        payment_date: todayISO(),
        reference_note: '',
        notes: '',
      });
      setCustomerBills([]);
    }
  }, [open]);

  useEffect(() => {
    if (form.customer_id) {
      setCustomerBills(bills.filter((b) => b.customer_id === form.customer_id && b.payment_status !== 'Paid'));
    } else {
      setCustomerBills([]);
    }
  }, [form.customer_id, bills]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id || !form.amount) return;
    onSave(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!form.customer_id || !form.amount}>
            Record Payment
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Customer *</label>
          <select
            className="input"
            value={form.customer_id ?? ''}
            onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
            required
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.customer_id})</option>
            ))}
          </select>
        </div>

        {customerBills.length > 0 && (
          <div>
            <label className="label">Link to Bill (Optional)</label>
            <select
              className="input"
              value={form.bill_id ?? ''}
              onChange={(e) => setForm({ ...form, bill_id: e.target.value || null })}
            >
              <option value="">No specific bill (Advance)</option>
              {customerBills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.invoice_number} — {monthName(b.bill_month)} {b.bill_year} — Net: ₹{b.net_payable}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.amount ?? ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              required
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={form.payment_date ?? todayISO()}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Payment Type</label>
            <select
              className="input"
              value={form.payment_type ?? 'Full'}
              onChange={(e) => setForm({ ...form, payment_type: e.target.value as PaymentType })}
            >
              <option value="Full">Full Payment</option>
              <option value="Partial">Partial Payment</option>
              <option value="Advance">Advance Payment</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Mode</label>
            <select
              className="input"
              value={form.payment_mode ?? 'Cash'}
              onChange={(e) => setForm({ ...form, payment_mode: e.target.value as PaymentMode })}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Reference (UTR / Cheque No.)</label>
          <input
            className="input"
            value={form.reference_note ?? ''}
            onChange={(e) => setForm({ ...form, reference_note: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </form>
    </Modal>
  );
}

function monthName(month: number): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return names[month - 1] ?? '';
}
