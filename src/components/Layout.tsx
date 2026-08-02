import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  Tags,
  Milk,
  FileText,
  Wallet,
  BarChart3,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { classNames } from '@/lib/utils';

export type Page =
  | 'dashboard'
  | 'customers'
  | 'rates'
  | 'collections'
  | 'bills'
  | 'payments'
  | 'reports'
  | 'settings';

interface NavItem {
  id: Page;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'customers', label: 'Customers', icon: <Users size={20} /> },
  { id: 'rates', label: 'Rate Management', icon: <Tags size={20} /> },
  { id: 'collections', label: 'Milk Collection', icon: <Milk size={20} /> },
  { id: 'bills', label: 'Billing', icon: <FileText size={20} /> },
  { id: 'payments', label: 'Payments', icon: <Wallet size={20} /> },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
];

interface LayoutProps {
  current: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

export function Layout({ current, onNavigate, children }: LayoutProps) {
  const { settings, darkMode, toggleDarkMode } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dairyName = settings?.dairy_name ?? 'Dairy Manager';

  const handleNav = (page: Page) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 lg:hidden no-print">
        <button onClick={() => setMobileOpen(true)} className="btn-ghost p-2">
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Milk size={18} />
          </div>
          <span className="font-display font-bold text-slate-900 dark:text-white">{dairyName}</span>
        </div>
        <button onClick={toggleDarkMode} className="btn-ghost p-2">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 shadow-xl animate-slide-up">
            <SidebarContent
              current={current}
              onNavigate={handleNav}
              dairyName={dairyName}
              logoUrl={settings?.logo_url}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-20 hidden h-full w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block no-print">
        <SidebarContent
          current={current}
          onNavigate={handleNav}
          dairyName={dairyName}
          logoUrl={settings?.logo_url}
        />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Desktop top bar */}
        <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 lg:flex no-print">
          <div>
            <h1 className="font-display text-xl font-bold capitalize text-slate-900 dark:text-white">
              {navItems.find((n) => n.id === current)?.label}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={toggleDarkMode} className="btn-ghost p-2.5">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  current,
  onNavigate,
  dairyName,
  logoUrl,
  onClose,
}: {
  current: Page;
  onNavigate: (page: Page) => void;
  dairyName: string;
  logoUrl?: string | null;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo / Brand */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Milk size={22} />
            </div>
          )}
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">{dairyName}</h2>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={classNames(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                current === item.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
        <p className="text-xs text-slate-400">Dairy Management System v1.0</p>
      </div>
    </div>
  );
}
