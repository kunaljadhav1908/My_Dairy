import { type ReactNode } from 'react';
import { classNames } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  color?: 'brand' | 'accent' | 'blue' | 'red' | 'purple';
}

const colorMap = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
  accent: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  purple: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
};

export function StatCard({ label, value, icon, trend, trendUp, color = 'brand' }: StatCardProps) {
  return (
    <div className="card p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
          {trend && (
            <p
              className={classNames(
                'mt-1.5 text-xs font-medium',
                trendUp ? 'text-brand-600 dark:text-brand-400' : 'text-red-500',
              )}
            >
              {trend}
            </p>
          )}
        </div>
        <div className={classNames('rounded-xl p-3', colorMap[color])}>{icon}</div>
      </div>
    </div>
  );
}
