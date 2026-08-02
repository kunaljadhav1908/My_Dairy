import { useEffect, useState } from 'react';
import { Save, Building2, Receipt, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { Settings as SettingsType } from '@/types';

export function Settings() {
  const { settings, refreshSettings, notify, darkMode, toggleDarkMode } = useApp();
  const [form, setForm] = useState<Partial<SettingsType>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .update({
        dairy_name: form.dairy_name,
        logo_url: form.logo_url,
        address: form.address,
        phone: form.phone,
        gst: form.gst,
        upi_id: form.upi_id,
        upi_qr_url: form.upi_qr_url,
        receipt_footer: form.receipt_footer,
        terms_and_conditions: form.terms_and_conditions,
        currency_symbol: form.currency_symbol,
        dark_mode: darkMode,
      })
      .eq('id', 1);

    if (error) {
      notify('Failed to save settings', 'error');
    } else {
      notify('Settings saved');
      refreshSettings();
    }
    setSaving(false);
  };

  if (!settings) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Dairy Profile */}
      <div className="card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <Building2 size={22} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Dairy Profile</h3>
            <p className="text-sm text-slate-500">Your dairy business details shown on bills and receipts</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Dairy Name</label>
            <input
              className="input"
              value={form.dairy_name ?? ''}
              onChange={(e) => setForm({ ...form, dairy_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="9876543210"
            />
          </div>
          <div>
            <label className="label">GST Number</label>
            <input
              className="input"
              value={form.gst ?? ''}
              onChange={(e) => setForm({ ...form, gst: e.target.value })}
              placeholder="27AAAAA0000A1Z5"
            />
          </div>
          <div>
            <label className="label">Currency Symbol</label>
            <input
              className="input"
              value={form.currency_symbol ?? '₹'}
              onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              maxLength={3}
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
            <label className="label">Logo URL</label>
            <input
              className="input"
              value={form.logo_url ?? ''}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="label">UPI ID</label>
            <input
              className="input"
              value={form.upi_id ?? ''}
              onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
              placeholder="dairy@upi"
            />
          </div>
          <div>
            <label className="label">UPI QR Code URL</label>
            <input
              className="input"
              value={form.upi_qr_url ?? ''}
              onChange={(e) => setForm({ ...form, upi_qr_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      </div>

      {/* Receipt Settings */}
      <div className="card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
            <Receipt size={22} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Receipt Settings</h3>
            <p className="text-sm text-slate-500">Customize the footer and terms on bills</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Receipt Footer</label>
            <textarea
              className="input"
              rows={2}
              value={form.receipt_footer ?? ''}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              placeholder="Thank you for your business!"
            />
          </div>
          <div>
            <label className="label">Terms & Conditions</label>
            <textarea
              className="input"
              rows={4}
              value={form.terms_and_conditions ?? ''}
              onChange={(e) => setForm({ ...form, terms_and_conditions: e.target.value })}
              placeholder="Payment due within 15 days of bill generation..."
            />
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="card p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
            <FileText size={22} />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Appearance</h3>
            <p className="text-sm text-slate-500">Customize how the dashboard looks</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <p className="font-medium text-slate-700 dark:text-slate-200">Dark Mode</p>
            <p className="text-sm text-slate-500">Switch between light and dark theme</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative h-7 w-12 rounded-full transition ${darkMode ? 'bg-brand-600' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${darkMode ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
