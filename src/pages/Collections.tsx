import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Milk,
  Plus,
  Search,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { MilkCollection, MilkRate, Customer, MilkType, Shift } from '@/types';
import { calculateRate, calculateAmount } from '@/lib/rateEngine';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { classNames, formatCurrency, formatDate, todayISO, toCSV, downloadFile } from '@/lib/utils';

const PAGE_SIZE = 10;

export function Collections() {
  const { notify, settings } = useApp();
  const [collections, setCollections] = useState<MilkCollection[]>([]);
  const [rates, setRates] = useState<MilkRate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MilkCollection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MilkCollection | null>(null);

  const symbol = settings?.currency_symbol ?? '₹';

  const load = async () => {
    setLoading(true);
    const [collRes, ratesRes, custRes] = await Promise.all([
      supabase.from('milk_collections').select('*').order('collection_date', { ascending: false }).order('shift', { ascending: false }),
      supabase.from('milk_rates').select('*').eq('is_active', true),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
    ]);
    if (collRes.error) {
      notify('Failed to load collections', 'error');
    } else {
      setCollections(collRes.data as MilkCollection[]);
    }
    if (ratesRes.data) setRates(ratesRes.data as MilkRate[]);
    if (custRes.data) setCustomers(custRes.data as Customer[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = collections;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.customer_name.toLowerCase().includes(q) ||
          c.milk_type.toLowerCase().includes(q) ||
          c.rate_rule_name?.toLowerCase().includes(q),
      );
    }
    if (dateFilter) {
      list = list.filter((c) => c.collection_date === dateFilter);
    }
    if (shiftFilter !== 'All') {
      list = list.filter((c) => c.shift === shiftFilter);
    }
    return list;
  }, [collections, search, dateFilter, shiftFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Summary for filtered set
  const summary = useMemo(() => {
    const totalQty = filtered.reduce((s, c) => s + Number(c.quantity), 0);
    const totalAmt = filtered.reduce((s, c) => s + Number(c.total_amount), 0);
    const morningQty = filtered.filter((c) => c.shift === 'Morning').reduce((s, c) => s + Number(c.quantity), 0);
    const eveningQty = filtered.filter((c) => c.shift === 'Evening').reduce((s, c) => s + Number(c.quantity), 0);
    return { totalQty, totalAmt, morningQty, eveningQty };
  }, [filtered]);

  const handleSave = async (form: Partial<MilkCollection>) => {
    const customer = customers.find((c) => c.id === form.customer_id);
    if (!customer) {
      notify('Please select a customer', 'error');
      return;
    }

    const calc = calculateRate(rates, customer, {
      milkType: form.milk_type as MilkType,
      shift: form.shift as Shift,
      fat: form.fat,
      snf: form.snf,
      collectionDate: form.collection_date ?? todayISO(),
    });

    // If manual rate type and no rule matched, allow manual override
    let appliedRate = calc.appliedRate;
    if (calc.rateType === 'Manual' && form.applied_rate != null && form.applied_rate > 0) {
      appliedRate = form.applied_rate;
    }

    const quantity = Number(form.quantity) || 0;
    const totalAmount = calculateAmount(quantity, appliedRate);

    const payload = {
      collection_date: form.collection_date,
      shift: form.shift,
      customer_id: form.customer_id,
      customer_name: customer.name,
      milk_type: form.milk_type,
      quantity,
      fat: form.fat ? Number(form.fat) : null,
      snf: form.snf ? Number(form.snf) : null,
      rate_rule_id: calc.ruleId,
      rate_rule_name: calc.ruleName,
      applied_rate: appliedRate,
      total_amount: totalAmount,
      notes: form.notes ?? null,
    };

    if (editing) {
      const { error } = await supabase.from('milk_collections').update(payload).eq('id', editing.id);
      if (error) {
        notify('Failed to update collection', 'error');
      } else {
        notify('Collection updated');
        load();
      }
    } else {
      const { error } = await supabase.from('milk_collections').insert(payload);
      if (error) {
        notify('Failed to save collection', 'error');
      } else {
        notify('Collection saved — rate locked permanently');
        load();
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('milk_collections').delete().eq('id', deleteTarget.id);
    if (error) {
      notify('Failed to delete collection', 'error');
    } else {
      notify('Collection deleted');
      load();
    }
  };

  const handleExport = () => {
    const rows = filtered.map((c) => ({
      Date: c.collection_date,
      Shift: c.shift,
      Customer: c.customer_name,
      'Milk Type': c.milk_type,
      'Quantity (L)': c.quantity,
      Fat: c.fat ?? '',
      SNF: c.snf ?? '',
      'Rate Rule': c.rate_rule_name ?? '',
      'Applied Rate': c.applied_rate,
      'Total Amount': c.total_amount,
    }));
    downloadFile(toCSV(rows), 'milk_collections.csv', 'text/csv');
    notify('Collections exported');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Quantity</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
            {summary.totalQty.toFixed(2)} L
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total Amount</p>
          <p className="mt-1 font-display text-xl font-bold text-brand-600 dark:text-brand-400">
            {formatCurrency(summary.totalAmt, symbol)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Morning</p>
          <p className="mt-1 font-display text-xl font-bold text-amber-600 dark:text-amber-400">
            {summary.morningQty.toFixed(2)} L
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Evening</p>
          <p className="mt-1 font-display text-xl font-bold text-blue-600 dark:text-blue-400">
            {summary.eveningQty.toFixed(2)} L
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
              placeholder="Search customer, milk type..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <input
            type="date"
            className="input sm:max-w-[180px]"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input sm:max-w-[150px]"
            value={shiftFilter}
            onChange={(e) => {
              setShiftFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Shifts</option>
            <option value="Morning">Morning</option>
            <option value="Evening">Evening</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={18} /> Add Collection
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
            icon={<Milk size={40} />}
            title="No milk collections yet"
            description="Record daily milk collections. The applied rate is saved permanently with each entry."
            action={
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <Plus size={18} /> Add Collection
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Shift</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Qty (L)</th>
                  <th className="table-header">Fat</th>
                  <th className="table-header">SNF</th>
                  <th className="table-header">Rate Rule</th>
                  <th className="table-header">Rate</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="table-cell text-slate-500">{formatDate(c.collection_date)}</td>
                    <td className="table-cell">
                      <span className="flex items-center gap-1">
                        {c.shift === 'Morning' ? (
                          <Sun size={14} className="text-amber-500" />
                        ) : (
                          <Moon size={14} className="text-blue-500" />
                        )}
                        {c.shift}
                      </span>
                    </td>
                    <td className="table-cell font-medium">{c.customer_name}</td>
                    <td className="table-cell">
                      <span
                        className={classNames(
                          'badge',
                          c.milk_type === 'Cow' ? 'badge-success' : c.milk_type === 'Buffalo' ? 'badge-warning' : 'badge-neutral',
                        )}
                      >
                        {c.milk_type}
                      </span>
                    </td>
                    <td className="table-cell font-semibold">{Number(c.quantity).toFixed(2)}</td>
                    <td className="table-cell text-slate-500">{c.fat ?? '-'}</td>
                    <td className="table-cell text-slate-500">{c.snf ?? '-'}</td>
                    <td className="table-cell text-xs text-slate-500">{c.rate_rule_name ?? 'Manual'}</td>
                    <td className="table-cell font-semibold">₹{c.applied_rate}</td>
                    <td className="table-cell font-semibold text-brand-600 dark:text-brand-400">
                      {formatCurrency(c.total_amount, symbol)}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-ghost p-2"
                          onClick={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setDeleteTarget(c)}
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
      <CollectionFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        collection={editing}
        customers={customers}
        rates={rates}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Collection"
        message="Delete this milk collection entry? This cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}

function CollectionFormModal({
  open,
  onClose,
  collection,
  customers,
  rates,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  collection: MilkCollection | null;
  customers: Customer[];
  rates: MilkRate[];
  onSave: (form: Partial<MilkCollection>) => void;
}) {
  const [form, setForm] = useState<Partial<MilkCollection>>({});
  const [previewRate, setPreviewRate] = useState<number>(0);
  const [previewAmount, setPreviewAmount] = useState<number>(0);
  const [previewRule, setPreviewRule] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    if (collection) {
      setForm(collection);
      setPreviewRate(Number(collection.applied_rate));
      setPreviewAmount(Number(collection.total_amount));
      setPreviewRule(collection.rate_rule_name);
      setIsManual(collection.rate_rule_name == null);
    } else {
      setForm({
        collection_date: todayISO(),
        shift: 'Morning',
        customer_id: '',
        milk_type: 'Cow',
        quantity: 0,
        fat: null,
        snf: null,
        notes: '',
      });
      setPreviewRate(0);
      setPreviewAmount(0);
      setPreviewRule(null);
      setIsManual(false);
    }
  }, [collection, open]);

  const recalculate = useCallback(() => {
    const customer = customers.find((c) => c.id === form.customer_id);
    if (!customer || !form.quantity) {
      setPreviewRate(0);
      setPreviewAmount(0);
      setPreviewRule(null);
      setIsManual(false);
      return;
    }
    const calc = calculateRate(rates, customer, {
      milkType: form.milk_type as MilkType,
      shift: form.shift as Shift,
      fat: form.fat ? Number(form.fat) : null,
      snf: form.snf ? Number(form.snf) : null,
      collectionDate: form.collection_date ?? todayISO(),
    });
    setPreviewRate(calc.appliedRate);
    setPreviewRule(calc.ruleName);
    setIsManual(calc.rateType === 'Manual' || calc.ruleName == null);
    const qty = Number(form.quantity) || 0;
    setPreviewAmount(calculateAmount(qty, calc.appliedRate));
  }, [form, customers, rates]);

  useEffect(() => {
    recalculate();
  }, [recalculate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id || !form.quantity) return;
    // Use manual override if applicable
    const finalForm = { ...form, applied_rate: isManual && form.applied_rate ? form.applied_rate : previewRate };
    onSave(finalForm);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={collection ? 'Edit Collection' : 'Add Milk Collection'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!form.customer_id || !form.quantity}>
            {collection ? 'Save Changes' : 'Save Collection'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Date *</label>
            <input
              type="date"
              className="input"
              value={form.collection_date ?? todayISO()}
              onChange={(e) => setForm({ ...form, collection_date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Shift *</label>
            <select
              className="input"
              value={form.shift ?? 'Morning'}
              onChange={(e) => setForm({ ...form, shift: e.target.value as Shift })}
            >
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Customer *</label>
            <select
              className="input"
              value={form.customer_id ?? ''}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              required
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.customer_id}) — {c.category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Milk Type *</label>
            <select
              className="input"
              value={form.milk_type ?? 'Cow'}
              onChange={(e) => setForm({ ...form, milk_type: e.target.value as MilkType })}
            >
              <option value="Cow">Cow</option>
              <option value="Buffalo">Buffalo</option>
              <option value="Mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="label">Quantity (Liters) *</label>
            <input
              type="number"
              step="0.001"
              className="input"
              value={form.quantity ?? ''}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              required
            />
          </div>
          <div>
            <label className="label">Fat (%)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.fat ?? ''}
              onChange={(e) => setForm({ ...form, fat: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 4.5"
            />
          </div>
          <div>
            <label className="label">SNF (%)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.snf ?? ''}
              onChange={(e) => setForm({ ...form, snf: e.target.value ? Number(e.target.value) : null })}
              placeholder="e.g. 8.5"
            />
          </div>
        </div>

        {/* Rate preview */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Applied Rate Rule</p>
              <p className="font-semibold text-slate-900 dark:text-white">{previewRule ?? 'No matching rule — Manual entry'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">Applied Rate</p>
              <p className="font-display text-lg font-bold text-brand-600 dark:text-brand-400">
                ₹{previewRate}/L
              </p>
            </div>
          </div>
          {isManual && (
            <div className="mt-3">
              <label className="label">Manual Rate Override (₹/L)</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={form.applied_rate ?? previewRate}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  setForm({ ...form, applied_rate: r });
                  setPreviewAmount(calculateAmount(Number(form.quantity) || 0, r));
                }}
              />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Total Amount</span>
            <span className="font-display text-xl font-bold text-slate-900 dark:text-white">
              ₹{previewAmount.toFixed(2)}
            </span>
          </div>
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

        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          The applied rate is saved permanently with this collection. Future rate changes
          will not affect this record.
        </div>
      </form>
    </Modal>
  );
}
