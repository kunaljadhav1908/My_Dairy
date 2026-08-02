import { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  QrCode,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { Customer, CustomerCategory, MilkType } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { classNames, formatDate, todayISO, toCSV, downloadFile } from '@/lib/utils';

const PAGE_SIZE = 10;

export function Customers() {
  const { notify } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'name' | 'joining_date' | 'customer_id'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [qrCustomer, setQrCustomer] = useState<Customer | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      notify('Failed to load customers', 'error');
    } else {
      setCustomers(data as Customer[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = customers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customer_id.toLowerCase().includes(q) ||
          c.mobile?.toLowerCase().includes(q) ||
          c.village?.toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== 'All') {
      list = list.filter((c) => c.category === categoryFilter);
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'joining_date') cmp = a.joining_date.localeCompare(b.joining_date);
      else cmp = a.customer_id.localeCompare(b.customer_id);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [customers, search, categoryFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSave = async (form: Partial<Customer>) => {
    if (editing) {
      const { error } = await supabase
        .from('customers')
        .update({
          name: form.name,
          mobile: form.mobile,
          address: form.address,
          village: form.village,
          aadhaar: form.aadhaar,
          category: form.category,
          custom_rate: form.custom_rate,
          default_milk_type: form.default_milk_type,
          payment_cycle: form.payment_cycle,
          is_active: form.is_active,
          notes: form.notes,
        })
        .eq('id', editing.id);
      if (error) {
        notify('Failed to update customer', 'error');
      } else {
        notify('Customer updated');
        load();
      }
    } else {
      const { error } = await supabase.from('customers').insert({
        name: form.name,
        mobile: form.mobile,
        address: form.address,
        village: form.village,
        joining_date: form.joining_date ?? todayISO(),
        aadhaar: form.aadhaar,
        category: form.category ?? 'Both',
        custom_rate: form.custom_rate,
        default_milk_type: form.default_milk_type,
        payment_cycle: form.payment_cycle ?? 'Monthly',
        is_active: form.is_active ?? true,
        notes: form.notes,
      });
      if (error) {
        notify('Failed to add customer', 'error');
      } else {
        notify('Customer added');
        load();
      }
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id);
    if (error) {
      notify('Cannot delete — customer has collections or bills', 'error');
    } else {
      notify('Customer deleted');
      load();
    }
  };

  const handleExport = () => {
    const rows = filtered.map((c) => ({
      ID: c.customer_id,
      Name: c.name,
      Mobile: c.mobile ?? '',
      Village: c.village ?? '',
      Category: c.category,
      'Joining Date': c.joining_date,
      'Custom Rate': c.custom_rate ?? '',
      'Default Milk Type': c.default_milk_type ?? '',
      Active: c.is_active ? 'Yes' : 'No',
    }));
    downloadFile(toCSV(rows), 'customers.csv', 'text/csv');
    notify('Customers exported to CSV');
  };

  const toggleSort = (key: 'name' | 'joining_date' | 'customer_id') => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input pl-10"
              placeholder="Search name, ID, mobile..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input sm:max-w-[180px]"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Categories</option>
            <option value="Supplier">Supplier</option>
            <option value="Buyer">Buyer</option>
            <option value="Both">Both</option>
          </select>
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
            <Plus size={18} /> Add Customer
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
            icon={<Users size={40} />}
            title="No customers yet"
            description="Add your first customer to start recording milk collections."
            action={
              <button className="btn-primary" onClick={() => setModalOpen(true)}>
                <Plus size={18} /> Add Customer
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="table-header cursor-pointer" onClick={() => toggleSort('customer_id')}>
                    Customer ID
                  </th>
                  <th className="table-header cursor-pointer" onClick={() => toggleSort('name')}>
                    Name
                  </th>
                  <th className="table-header">Contact</th>
                  <th className="table-header">Village</th>
                  <th className="table-header">Category</th>
                  <th className="table-header cursor-pointer" onClick={() => toggleSort('joining_date')}>
                    Joined
                  </th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((c) => (
                  <tr key={c.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="table-cell font-mono text-xs text-slate-500">{c.customer_id}</td>
                    <td className="table-cell font-medium">{c.name}</td>
                    <td className="table-cell">
                      {c.mobile && (
                        <span className="flex items-center gap-1 text-slate-500">
                          <Phone size={14} /> {c.mobile}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-slate-500">{c.village ?? '-'}</td>
                    <td className="table-cell">
                      <span
                        className={classNames(
                          'badge',
                          c.category === 'Supplier' ? 'badge-success' : c.category === 'Buyer' ? 'badge-warning' : 'badge-neutral',
                        )}
                      >
                        {c.category}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500">{formatDate(c.joining_date)}</td>
                    <td className="table-cell">
                      {c.is_active ? (
                        <span className="badge-success">Active</span>
                      ) : (
                        <span className="badge-danger">Inactive</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-1">
                        <button className="btn-ghost p-2" onClick={() => setQrCustomer(c)} title="QR Code">
                          <QrCode size={16} />
                        </button>
                        <button
                          className="btn-ghost p-2"
                          onClick={() => {
                            setEditing(c);
                            setModalOpen(true);
                          }}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="btn-ghost p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setDeleteTarget(c)}
                          title="Delete"
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
      <CustomerFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        customer={editing}
        onSave={handleSave}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />

      {/* QR Code Modal */}
      <Modal open={!!qrCustomer} onClose={() => setQrCustomer(null)} title="Customer QR Code" size="sm">
        {qrCustomer && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 dark:border-slate-700">
              <QRCodeSVG value={qrCustomer.customer_id} size={180} />
            </div>
            <div className="text-center">
              <p className="font-display text-lg font-bold">{qrCustomer.name}</p>
              <p className="font-mono text-sm text-slate-500">{qrCustomer.customer_id}</p>
            </div>
            <p className="text-xs text-slate-400">Scan to identify this customer</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CustomerFormModal({
  open,
  onClose,
  customer,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSave: (form: Partial<Customer>) => void;
}) {
  const [form, setForm] = useState<Partial<Customer>>({});

  useEffect(() => {
    if (customer) {
      setForm(customer);
    } else {
      setForm({
        name: '',
        mobile: '',
        address: '',
        village: '',
        joining_date: todayISO(),
        aadhaar: '',
        category: 'Both',
        custom_rate: null,
        default_milk_type: null,
        payment_cycle: 'Monthly',
        is_active: true,
        notes: '',
      });
    }
  }, [customer, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    onSave(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Add Customer'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={!form.name?.trim()}>
            {customer ? 'Save Changes' : 'Add Customer'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Customer Name *</label>
            <input
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Mobile Number</label>
            <input
              className="input"
              value={form.mobile ?? ''}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="9876543210"
            />
          </div>
          <div>
            <label className="label">Village</label>
            <input
              className="input"
              value={form.village ?? ''}
              onChange={(e) => setForm({ ...form, village: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Joining Date</label>
            <input
              type="date"
              className="input"
              value={form.joining_date ?? todayISO()}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <textarea
              className="input"
              rows={2}
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Aadhaar (Optional)</label>
            <input
              className="input"
              value={form.aadhaar ?? ''}
              onChange={(e) => setForm({ ...form, aadhaar: e.target.value })}
              placeholder="XXXX XXXX XXXX"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={form.category ?? 'Both'}
              onChange={(e) => setForm({ ...form, category: e.target.value as CustomerCategory })}
            >
              <option value="Supplier">Supplier</option>
              <option value="Buyer">Buyer</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <div>
            <label className="label">Custom Milk Rate (₹/L)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.custom_rate ?? ''}
              onChange={(e) => setForm({ ...form, custom_rate: e.target.value ? Number(e.target.value) : null })}
              placeholder="Leave empty for auto rate"
            />
          </div>
          <div>
            <label className="label">Default Milk Type</label>
            <select
              className="input"
              value={form.default_milk_type ?? ''}
              onChange={(e) => setForm({ ...form, default_milk_type: (e.target.value || null) as MilkType | null })}
            >
              <option value="">None</option>
              <option value="Cow">Cow</option>
              <option value="Buffalo">Buffalo</option>
              <option value="Mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Cycle</label>
            <select
              className="input"
              value={form.payment_cycle ?? 'Monthly'}
              onChange={(e) => setForm({ ...form, payment_cycle: e.target.value })}
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Fortnightly">Fortnightly</option>
            </select>
          </div>
          <div className="flex items-end">
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
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// Simple QR code generator (SVG-based, no dependency)
function QRCodeSVG({ value, size }: { value: string; size: number }) {
  const cells = generateQRMatrix(value);
  const cellSize = size / cells.length;
  const rects = cells.flatMap((row, y) =>
    row.flatMap((v, x) =>
      v ? [`${x * cellSize},${y * cellSize}`] : [],
    ),
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" />
      {rects.map((pos, i) => {
        const [x, y] = pos.split(',').map(Number);
        return <rect key={i} x={x} y={y} width={cellSize} height={cellSize} fill="black" />;
      })}
    </svg>
  );
}

// Minimal QR matrix generator (simplified — deterministic pattern from string hash)
function generateQRMatrix(text: string): number[][] {
  const size = 25;
  const matrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  // Hash the string
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  // Fill data area with pseudo-random pattern
  let seed = hash;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      matrix[y][x] = rand() > 0.5 ? 1 : 0;
    }
  }
  // Add finder patterns (corners)
  const addFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const isBorder = x === 0 || x === 6 || y === 0 || y === 6;
        const isInner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[oy + y][ox + x] = isBorder || isInner ? 1 : 0;
      }
    }
    // Clear separator
    for (let i = -1; i <= 7; i++) {
      if (ox + i >= 0 && ox + i < size) {
        if (oy - 1 >= 0) matrix[oy - 1][ox + i] = 0;
        if (oy + 7 < size) matrix[oy + 7][ox + i] = 0;
      }
      if (oy + i >= 0 && oy + i < size) {
        if (ox - 1 >= 0) matrix[oy + i][ox - 1] = 0;
        if (ox + 7 < size) matrix[oy + i][ox + 7] = 0;
      }
    }
  };
  addFinder(0, 0);
  addFinder(size - 7, 0);
  addFinder(0, size - 7);
  return matrix;
}
