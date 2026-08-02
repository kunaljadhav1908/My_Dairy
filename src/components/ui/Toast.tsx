import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function ToastContainer() {
  const { notifications, dismissNotification } = useApp();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 no-print">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 animate-slide-up min-w-[280px] max-w-md"
        >
          {n.type === 'success' && <CheckCircle2 className="text-brand-500 shrink-0" size={20} />}
          {n.type === 'error' && <XCircle className="text-red-500 shrink-0" size={20} />}
          {n.type === 'info' && <Info className="text-blue-500 shrink-0" size={20} />}
          <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">{n.message}</p>
          <button
            onClick={() => dismissNotification(n.id)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
