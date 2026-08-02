import { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  Milk,
  Wallet,
  AlertCircle,
  Tags,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import type { MilkCollection, Payment, Bill, RateHistory } from '@/types';
import { BarChart, LineChart } from '@/components/ui/Charts';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  formatCurrency,
  formatDate,
  todayISO,
  monthName,
  toCSV,
  downloadFile,
  classNames,
} from '@/lib/utils';

type ReportType =
  | 'daily'
  | 'monthly'
  | 'customer'
  | 'collection'
  | 'income'
  | 'outstanding'
  | 'rateHistory';

export function Reports() {
  const { notify, settings } = useApp();
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(todayISO());
  const [collections, setCollections] = useState<MilkCollection[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [rateHistory, setRateHistory] = useState<RateHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const symbol = settings?.currency_symbol ?? '₹';

  const load = async () => {
    setLoading(true);
    const [collRes, payRes, billRes, histRes] = await Promise.all([
      supabase.from('milk_collections').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('bills').select('*'),
      supabase.from('rate_history').select('*').order('created_at', { ascending: false }),
    ]);
    if (collRes.data) setCollections(collRes.data as MilkCollection[]);
    if (payRes.data) setPayments(payRes.data as Payment[]);
    if (billRes.data) setBills(billRes.data as Bill[]);
    if (histRes.data) setRateHistory(histRes.data as RateHistory[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredCollections = useMemo(() => {
    return collections.filter(
      (c) => c.collection_date >= fromDate && c.collection_date <= toDate,
    );
  }, [collections, fromDate, toDate]);

  const filteredPayments = useMemo(() => {
    return payments.filter(
      (p) => p.payment_date >= fromDate && p.payment_date <= toDate,
    );
  }, [payments, fromDate, toDate]);

  const reportData = useMemo(() => {
    switch (reportType) {
      case 'daily': {
        const byDate = new Map<string, { quantity: number; amount: number; entries: number }>();
        filteredCollections.forEach((c) => {
          const existing = byDate.get(c.collection_date) ?? { quantity: 0, amount: 0, entries: 0 };
          existing.quantity += Number(c.quantity);
          existing.amount += Number(c.total_amount);
          existing.entries += 1;
          byDate.set(c.collection_date, existing);
        });
        return Array.from(byDate.entries())
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => b.date.localeCompare(a.date));
      }
      case 'monthly': {
        const byMonth = new Map<string, { quantity: number; amount: number; entries: number }>();
        filteredCollections.forEach((c) => {
          const key = `${c.collection_date.slice(0, 4)}-${c.collection_date.slice(5, 7)}`;
          const existing = byMonth.get(key) ?? { quantity: 0, amount: 0, entries: 0 };
          existing.quantity += Number(c.quantity);
          existing.amount += Number(c.total_amount);
          existing.entries += 1;
          byMonth.set(key, existing);
        });
        return Array.from(byMonth.entries())
          .map(([key, v]) => ({
            month: monthName(Number(key.slice(5, 7))) + ' ' + key.slice(0, 4),
            ...v,
          }))
          .sort((a, b) => b.month.localeCompare(a.month));
      }
      case 'customer': {
        const byCustomer = new Map<string, { quantity: number; amount: number; entries: number }>();
        filteredCollections.forEach((c) => {
          const existing = byCustomer.get(c.customer_name) ?? { quantity: 0, amount: 0, entries: 0 };
          existing.quantity += Number(c.quantity);
          existing.amount += Number(c.total_amount);
          existing.entries += 1;
          byCustomer.set(c.customer_name, existing);
        });
        return Array.from(byCustomer.entries())
          .map(([name, v]) => ({ customer: name, ...v }))
          .sort((a, b) => b.amount - a.amount);
      }
      case 'collection':
        return filteredCollections;
      case 'income': {
        const byDate = new Map<string, number>();
        filteredPayments.forEach((p) => {
          byDate.set(p.payment_date, (byDate.get(p.payment_date) ?? 0) + Number(p.amount));
        });
        return Array.from(byDate.entries())
          .map(([date, amount]) => ({ date, amount }))
          .sort((a, b) => b.date.localeCompare(a.date));
      }
      case 'outstanding':
        return bills.filter((b) => b.payment_status !== 'Paid');
      case 'rateHistory':
        return rateHistory;
      default:
        return [];
    }
  }, [reportType, filteredCollections, filteredPayments, bills, rateHistory]);

  const chartData = useMemo(() => {
    if (reportType === 'daily' && Array.isArray(reportData) && 'date' in (reportData[0] ?? {})) {
      return (reportData as { date: string; amount: number }[])
        .slice(0, 14)
        .reverse()
        .map((d) => ({ label: d.date.slice(5), value: d.amount }));
    }
    if (reportType === 'monthly' && Array.isArray(reportData) && 'month' in (reportData[0] ?? {})) {
      return (reportData as { month: string; amount: number }[])
        .reverse()
        .map((d) => ({ label: d.month.slice(0, 3), value: d.amount }));
    }
    if (reportType === 'customer' && Array.isArray(reportData) && 'customer' in (reportData[0] ?? {})) {
      return (reportData as { customer: string; amount: number }[])
        .slice(0, 10)
        .map((d) => ({ label: d.customer.slice(0, 8), value: d.amount }));
    }
    return [];
  }, [reportType, reportData]);

  const handleExport = (format: 'csv' | 'excel') => {
    const rows = Array.isArray(reportData) ? (reportData as Record<string, unknown>[]) : [];
    if (rows.length === 0) {
      notify('No data to export', 'error');
      return;
    }
    const csv = toCSV(rows);
    const filename = `${reportType}_report_${todayISO()}.${format === 'csv' ? 'csv' : 'xls'}`;
    const mime = format === 'csv' ? 'text/csv' : 'application/vnd.ms-excel';
    downloadFile(csv, filename, mime);
    notify(`Report exported as ${format.toUpperCase()}`);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const reportTabs: { id: ReportType; label: string; icon: React.ReactNode }[] = [
    { id: 'daily', label: 'Daily Report', icon: <Calendar size={16} /> },
    { id: 'monthly', label: 'Monthly Report', icon: <BarChart3 size={16} /> },
    { id: 'customer', label: 'Customer Report', icon: <Users size={16} /> },
    { id: 'collection', label: 'Collection Report', icon: <Milk size={16} /> },
    { id: 'income', label: 'Income Report', icon: <Wallet size={16} /> },
    { id: 'outstanding', label: 'Outstanding Report', icon: <AlertCircle size={16} /> },
    { id: 'rateHistory', label: 'Rate History Report', icon: <Tags size={16} /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            className={classNames(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
              reportType === tab.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
            onClick={() => setReportType(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date range + export */}
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between no-print">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="label">From Date</label>
            <input
              type="date"
              className="input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">To Date</label>
            <input
              type="date"
              className="input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => handleExport('csv')}>
            <FileText size={16} /> CSV
          </button>
          <button className="btn-secondary" onClick={() => handleExport('excel')}>
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button className="btn-primary" onClick={handlePrintPDF}>
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card p-6 no-print">
          <h3 className="mb-4 font-display text-base font-bold text-slate-900 dark:text-white">
            {reportTabs.find((t) => t.id === reportType)?.label}
          </h3>
          {reportType === 'daily' || reportType === 'monthly' ? (
            <LineChart data={chartData} />
          ) : (
            <BarChart data={chartData} formatValue={(v) => formatCurrency(v, symbol)} />
          )}
        </div>
      )}

      {/* Report table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          </div>
        ) : !Array.isArray(reportData) || reportData.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={40} />}
            title="No data for this period"
            description="Try adjusting the date range or select a different report type."
          />
        ) : (
          <ReportTable reportType={reportType} data={reportData} symbol={symbol} />
        )}
      </div>
    </div>
  );
}

function ReportTable({
  reportType,
  data,
  symbol,
}: {
  reportType: ReportType;
  data: unknown[];
  symbol: string;
}) {
  const rows = data as Record<string, unknown>[];

  if (reportType === 'daily') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Entries</th>
              <th className="table-header">Total Qty (L)</th>
              <th className="table-header">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell">{formatDate(r.date as string)}</td>
                <td className="table-cell">{r.entries as number}</td>
                <td className="table-cell">{(r.quantity as number).toFixed(2)}</td>
                <td className="table-cell font-semibold">{formatCurrency(r.amount as number, symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'monthly') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Month</th>
              <th className="table-header">Entries</th>
              <th className="table-header">Total Qty (L)</th>
              <th className="table-header">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell">{r.month as string}</td>
                <td className="table-cell">{r.entries as number}</td>
                <td className="table-cell">{(r.quantity as number).toFixed(2)}</td>
                <td className="table-cell font-semibold">{formatCurrency(r.amount as number, symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'customer') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Customer</th>
              <th className="table-header">Entries</th>
              <th className="table-header">Total Qty (L)</th>
              <th className="table-header">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell font-medium">{r.customer as string}</td>
                <td className="table-cell">{r.entries as number}</td>
                <td className="table-cell">{(r.quantity as number).toFixed(2)}</td>
                <td className="table-cell font-semibold">{formatCurrency(r.amount as number, symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'collection') {
    return (
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
              <th className="table-header">Rate</th>
              <th className="table-header">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell">{formatDate(r.collection_date as string)}</td>
                <td className="table-cell">{r.shift as string}</td>
                <td className="table-cell font-medium">{r.customer_name as string}</td>
                <td className="table-cell">{r.milk_type as string}</td>
                <td className="table-cell">{Number(r.quantity).toFixed(2)}</td>
                <td className="table-cell">{(r.fat as string) ?? '-'}</td>
                <td className="table-cell">{(r.snf as string) ?? '-'}</td>
                <td className="table-cell">₹{String(r.applied_rate)}</td>
                <td className="table-cell font-semibold">{formatCurrency(Number(r.total_amount), symbol)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'income') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Income</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell">{formatDate(r.date as string)}</td>
                <td className="table-cell font-semibold text-brand-600 dark:text-brand-400">
                  {formatCurrency(r.amount as number, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'outstanding') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Invoice</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Month</th>
              <th className="table-header">Net Payable</th>
              <th className="table-header">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell font-mono text-xs">{r.invoice_number as string}</td>
                <td className="table-cell font-medium">{r.customer_name as string}</td>
                <td className="table-cell">{monthName(r.bill_month as number)} {r.bill_year as number}</td>
                <td className="table-cell font-semibold">{formatCurrency(Number(r.net_payable), symbol)}</td>
                <td className="table-cell">
                  <span className={classNames('badge', r.payment_status === 'Partial' ? 'badge-warning' : 'badge-danger')}>
                    {r.payment_status as string}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportType === 'rateHistory') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Rule</th>
              <th className="table-header">Action</th>
              <th className="table-header">Base Rate</th>
              <th className="table-header">Milk Type</th>
              <th className="table-header">Effective</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="table-cell">{formatDate(r.created_at as string)}</td>
                <td className="table-cell font-medium">{r.rule_name as string}</td>
                <td className="table-cell">{r.action as string}</td>
                <td className="table-cell">₹{String(r.base_rate)}</td>
                <td className="table-cell">{r.milk_type as string ?? '-'}</td>
                <td className="table-cell">{r.effective_from ? formatDate(r.effective_from as string) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
