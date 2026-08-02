import { useEffect, useState, useMemo } from 'react';
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  Search,
  History,
  Power,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { MilkRate, RateHistory, RateType, MilkType, CustomerType, Shift, Customer } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { classNames, formatDate, todayISO, toCSV, downloadFile } from '@/lib/utils';

const PAGE_SIZE = 8;

const rateTypeLabels: Record<RateType, string> = {
  Fixed: 'Fixed Price / Liter',
  FatBased: 'Fat Based',
  FatSnfBased: 'Fat + SNF Based',
  CustomerSpecific: 'Customer Specific',
  Manual: 'Manual Rate',
};

export function Rates() {
  const { notify } = useApp();
  const [rates, setRates] = useState<MilkRate[]>([]);
  const [history, setHistory] = useState<RateHistory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'rules' | 'history'>('rules');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MilkRate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MilkRate | null>(null);
  const [historyFor, setHistoryFor] = useState<MilkRate | null>(null);

  const load = async () => {
    setLoading(true);
    const [ratesRes, historyRes, custRes] = await Promise.all([
      supabase.from('milk_rates').select('*').order('created_at', { ascending: false }),
      supabase.from('rate_history').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('customers').select('id, name, customer_id').order('name'),
    ]);
    if (ratesRes.error) {
      notify('Failed to load rates', 'error');
    } else {
      setRates(ratesRes.data as MilkRate[]);
    }
    if (historyRes.data) setHistory(historyRes.data as RateHistory[]);
    if (custRes.data) setCustomers(custRes.data as Customer[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return rates;
    const q = search.toLowerCase();
    return rates.filter(
      (r) =>
        r.rule_name.toLowerCase().includes(q) ||
        r.milk_type.toLowerCase().includes(q) ||
        r.rate_type.toLowerCase().includes(q),
    );
  }, [rates, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const recordHistory = async (rate: MilkRate, action: RateHistory['action']) => {
    await supabase.from('rate_history').insert({
      rate_id: rate.id,
      rule_name: rate.rule_name,
      milk_type: rate.milk_type,
      customer_type: rate.customer_type,
      rate_type: rate.rate_type,
      base_rate: rate.base_rate,
      fat_min: rate.fat_min,
      fat_max: rate.fat_max,
      snf_min: rate.snf_min,
      snf_max: rate.snf_max,
      effective_from: rate.effective_from,
      effective_to: rate.effective_to,
      is_active: rate.is_active,
      action,
      changed_by: 'Owner',
      snapshot: rate as unknown as Record<string, unknown>,
    });
  };

  const handleSave = async (form: Partial<MilkRate>) => {
    const payload = {
      rule_name: form.rule_name,
      milk_type: form.milk_type ?? 'All',
      customer_type: form.customer_type ?? 'All',
      rate_type: form.rate_type ?? 'Fixed',
      base_rate: form.base_rate ?? 0,
      fat_min: form.fat_min ?? null,
      fat_max: form.fat_max ?? null,
      fat_bonus_per_unit: form.fat_bonus_per_unit ?? 0,
      snf_min: form.snf_min ?? null,
      snf_max: form.snf_max ?? null,
      snf_bonus_per_unit: form.snf_bonus_per_unit ?? 0,
      customer_id: form.customer_id ?? null,
      shift: form.shift ?? 'Both',
      effective_from: form.effective_from ?? todayISO(),
      effective_to: form.effective_to ?? null,
      is_active: form.is_active ?? true,
      notes: form.notes ?? null,
    };

    if (editing) {
      const { data, error } = await supabase
        .from('milk_rates')
        .update(payload)
        .eq('id', editing.id)
        .select()
        .single();
      if (error) {
        notify('Failed to update rate', 'error');
      } else {
        await recordHistory(data as MilkRate, 'Updated');
        notify('Rate updated — future collections will use the new rate');
        load();
      }
    } else {
      const { data, error } = await supabase
        .from('milk_rates')
        .insert(payload)
        .select()
        .single();
      if (error) {
        notify('Failed to create rate', 'error');
      } else {
        await recordHistory(data as MilkRate, 'Created');
        notify('Rate rule created');
        load();
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggleActive = async (rate: MilkRate) => {
    const newActive = !rate.is_active;
    const { error } = await supabase
      .from('milk_rates')
      .update({ is_active: newActive })
      .eq('id', rate.id);
    if (error) {
      notify('Failed to toggle rate', 'error');
    } else {
      await recordHistory({ ...rate, is_active: newActive }, newActive ? 'Activated' : 'Deactivated');
      notify(newActive ? 'Rate activated' : 'Rate deactivated');
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await recordHistory(deleteTarget, 'Deleted');
    const { error } = await supabase.from('milk_rates').delete().eq('id', deleteTarget.id);
    if (error) {
      notify('Failed to delete rate', 'error');
    } else {
      notify('Rate deleted');
      load();
    }
  };

  const handleExport = () => {
    const rows = filtered.map((r) => ({
      'Rule Name': r.rule_name,
      'Milk Type': r.milk_type,
      'Customer Type': r.customer_type,
      'Rate Type': rateTypeLabels[r.rate_type],
      'Base Rate': r.base_rate,
      'Fat Min': r.fat_min ?? '',
      'Fat Max': r.fat_max ?? '',
      'SNF Min': r.snf_min ?? '',
      'SNF Max': r.snf_max ?? '',
      'Effective From': r.effective_from,
      'Effective To': r.effective_to ?? '',
      Active: r.is_active ? 'Yes' : 'No',
    }));
    downloadFile(toCSV(rows), 'milk_rates.csv', 'text/csv');
    notify('Rates exported');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 w-fit">
        <button
          className={classNames(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            tab === 'rules' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500',
          )}
          onClick={() => setTab('rules')}
        >
          <Tags size={16} className="mr-2 inline" /> Rate Rules
        </button>
        <button
          className={classNames(
            'rounded-lg px-4 py-2 text-sm font-medium transition',
            tab === 'history' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500',
          )}
          onClick={() => setTab('history')}
        >
          <History size={16} className="mr-2 inline" /> Rate History
        </button>
      </div>

      {tab === 'rules' ? (
        <>
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="input pl-10"
                placeholder="Search rate rules..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={handleExport}>
                Export CSV
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus size={18} /> Add Rate Rule
              </button>
            </div>
          </div>

          {/* Rate cards */}
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
            </div>
          ) : paged.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Tags size={40} />}
                title="No rate rules yet"
                description="Create pricing rules for different milk types, customers, and fat/SNF levels. The owner can change rates anytime without affecting past collections."
                action={
                  <button className="btn-primary" onClick={() => setModalOpen(true)}>
                    <Plus size={18} /> Add Rate Rule
                  </button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {paged.map((r) => (
                <div
                  key={r.id}
                  className={classNames(
                    'card p-5 transition hover:shadow-md',
                    !r.is_active && 'opacity-60',
                  )}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                        {r.rule_name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">{rateTypeLabels[r.rate_type]}</p>
                    </div>
                    <span
                      className={classNames(
                        'badge',
                        r.is_active ? 'badge-success' : 'badge-neutral',
                      )}
                    >
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-400">Base Rate</p>
                      <p className="font-semibold text-slate-900 dark:text-white">₹{r.base_rate}/L</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-400">Milk Type</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{r.milk_type}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-400">Customer Type</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{r.customer_type}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                      <p className="text-xs text-slate-400">Shift</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{r.shift ?? 'Both'}</p>
                    </div>
                  </div>

                  {(r.fat_min != null || r.fat_max != null) && (
                    <p className="mt-2 text-xs text-slate-500">
                      Fat: {r.fat_min ?? '—'} to {r.fat_max ?? '—'}
                      {r.fat_bonus_per_unit ? ` (+₹${r.fat_bonus_per_unit}/0.1%)` : ''}
                    </p>
                  )}
                  {(r.snf_min != null || r.snf_max != null) && (
                    <p className="mt-1 text-xs text-slate-500">
                      SNF: {r.snf_min ?? '—'} to {r.snf_max ?? '—'}
                      {r.snf_bonus_per_unit ? ` (+₹${r.snf_bonus_per_unit}/0.1%)` : ''}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Calendar size={14} />
                    {formatDate(r.effective_from)}
                    {r.effective_to && ` → ${formatDate(r.effective_to)}`}
                  </div>

                  <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      className="btn-ghost p-2"
                      onClick={() => handleToggleActive(r)}
                      title={r.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <Power size={16} className={r.is_active ? 'text-brand-600' : 'text-slate-400'} />
                    </button>
                    <button
                      className="btn-ghost p-2"
                      onClick={() => setHistoryFor(r)}
                      title="View History"
                    >
                      <History size={16} />
                    </button>
                    <button
                      className="btn-ghost p-2"
                      onClick={() => {
                        setEditing(r);
                        setModalOpen(true);
                      }}
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteTarget(r)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
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
        </>
      ) : (
        <RateHistoryView history={history} />
      )}

      {/* Form Modal */}
      <RateFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        rate={editing}
        customers={customers}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Rate Rule"
        message={`Delete "${deleteTarget?.rule_name}"? Existing collections keep their saved rates. Only future collections are affected.`}
        confirmLabel="Delete"
      />

      {/* Per-rule history modal */}
      <Modal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={`History — ${historyFor?.rule_name ?? ''}`}
        size="lg"
      >
        {historyFor && <RateHistoryView history={history.filter((h) => h.rate_id === historyFor.id)} />}
      </Modal>
    </div>
  );
}

function RateHistoryView({ history }: { history: RateHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<History size={40} />}
          title="No rate history yet"
          description="Every rate change — create, edit, activate, deactivate, delete — is recorded here permanently."
        />
      </div>
    );
  }

  const actionColors: Record<RateHistory['action'], string> = {
    Created: 'badge-success',
    Updated: 'badge-warning',
    Deleted: 'badge-danger',
    Activated: 'badge-success',
    Deactivated: 'badge-neutral',
  };

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Rule</th>
              <th className="table-header">Action</th>
              <th className="table-header">Rate Type</th>
              <th className="table-header">Base Rate</th>
              <th className="table-header">Milk Type</th>
              <th className="table-header">Effective</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell text-slate-500">{formatDate(h.created_at)}</td>
                <td className="table-cell font-medium">{h.rule_name}</td>
                <td className="table-cell">
                  <span className={actionColors[h.action]}>{h.action}</span>
                </td>
                <td className="table-cell text-slate-500">{h.rate_type ?? '-'}</td>
                <td className="table-cell font-semibold">₹{h.base_rate ?? '-'}</td>
                <td className="table-cell text-slate-500">{h.milk_type ?? '-'}</td>
                <td className="table-cell text-slate-500">
                  {h.effective_from ? formatDate(h.effective_from) : '-'}
                  {h.effective_to ? ` → ${formatDate(h.effective_to)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateFormModal({
  open,
  onClose,
  rate,
  customers,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  rate: MilkRate | null;
  customers: Customer[];
  onSave: (form: Partial<MilkRate>) => void;
}) {
  const [form, setForm] = useState<Partial<MilkRate>>({});

  useEffect(() => {
    if (rate) {
      setForm(rate);
    } else {
      setForm({
        rule_name: '',
        milk_type: 'All',
        customer_type: 'All',
        rate_type: 'Fixed',
        base_rate: 0,
        fat_min: null,
        fat_max: null,
        fat_bonus_per_unit: 0,
        snf_min: null,
        snf_max: null,
        snf_bonus_per_unit: 0,
        customer_id: null,
        shift: 'Both',
        effective_from: todayISO(),
        effective_to: null,
        is_active: true,
        notes: '',
      });
    }
  }, [rate, open]);

  const showFatFields = form.rate_type === 'FatBased' || form.rate_type === 'FatSnfBased';
  const showSnfFields = form.rate_type === 'FatSnfBased';
  const showCustomerField = form.rate_type === 'CustomerSpecific';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rule_name?.trim()) return;
    onSave(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rate ? 'Edit Rate Rule' : 'Add Rate Rule'}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!form.rule_name?.trim()}>
            {rate ? 'Save Changes' : 'Create Rule'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Rule Name *</label>
            <input
              className="input"
              value={form.rule_name ?? ''}
              onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
              placeholder="e.g. Cow Milk Standard Rate"
              required
            />
          </div>
          <div>
            <label className="label">Rate Type</label>
            <select
              className="input"
              value={form.rate_type ?? 'Fixed'}
              onChange={(e) => setForm({ ...form, rate_type: e.target.value as RateType })}
            >
              <option value="Fixed">Fixed Price Per Liter</option>
              <option value="FatBased">Fat Based</option>
              <option value="FatSnfBased">Fat + SNF Based</option>
              <option value="CustomerSpecific">Customer Specific Rate</option>
              <option value="Manual">Manual Rate</option>
            </select>
          </div>
          <div>
            <label className="label">Milk Type</label>
            <select
              className="input"
              value={form.milk_type ?? 'All'}
              onChange={(e) => setForm({ ...form, milk_type: e.target.value as MilkType | 'All' })}
            >
              <option value="All">All Types</option>
              <option value="Cow">Cow</option>
              <option value="Buffalo">Buffalo</option>
              <option value="Mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="label">Customer Type</label>
            <select
              className="input"
              value={form.customer_type ?? 'All'}
              onChange={(e) => setForm({ ...form, customer_type: e.target.value as CustomerType })}
            >
              <option value="All">All Customers</option>
              <option value="Supplier">Supplier</option>
              <option value="Buyer">Buyer</option>
            </select>
          </div>
          <div>
            <label className="label">Shift</label>
            <select
              className="input"
              value={form.shift ?? 'Both'}
              onChange={(e) => setForm({ ...form, shift: e.target.value as Shift | 'Both' })}
            >
              <option value="Both">Both Shifts</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </div>
          <div>
            <label className="label">Base Rate (₹/Liter) *</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.base_rate ?? 0}
              onChange={(e) => setForm({ ...form, base_rate: Number(e.target.value) })}
              required
            />
          </div>
        </div>

        {showFatFields && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Fat Parameters</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Fat Min (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.fat_min ?? ''}
                  onChange={(e) => setForm({ ...form, fat_min: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Fat Max (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.fat_max ?? ''}
                  onChange={(e) => setForm({ ...form, fat_max: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Bonus per 0.1% (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.fat_bonus_per_unit ?? 0}
                  onChange={(e) => setForm({ ...form, fat_bonus_per_unit: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}

        {showSnfFields && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">SNF Parameters</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label">SNF Min (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.snf_min ?? ''}
                  onChange={(e) => setForm({ ...form, snf_min: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">SNF Max (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.snf_max ?? ''}
                  onChange={(e) => setForm({ ...form, snf_max: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div>
                <label className="label">Bonus per 0.1% (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.snf_bonus_per_unit ?? 0}
                  onChange={(e) => setForm({ ...form, snf_bonus_per_unit: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}

        {showCustomerField && (
          <div>
            <label className="label">Select Customer</label>
            <select
              className="input"
              value={form.customer_id ?? ''}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value || null })}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.customer_id})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Effective From *</label>
            <input
              type="date"
              className="input"
              value={form.effective_from ?? todayISO()}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Effective To (Optional)</label>
            <input
              type="date"
              className="input"
              value={form.effective_to ?? ''}
              onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={form.is_active ?? true}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</span>
          </label>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="e.g. Festival season rate, VIP customer discount..."
          />
        </div>

        <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          Once a milk collection is saved, its applied rate is stored permanently. Changing this rate
          only affects future collections — existing records stay unchanged.
        </div>
      </form>
    </Modal>
  );
}
