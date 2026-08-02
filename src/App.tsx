import { useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppProvider } from '@/context/AppContext';
import { Layout, type Page } from '@/components/Layout';
import { ToastContainer } from '@/components/ui/Toast';
import { Dashboard } from '@/pages/Dashboard';
import { Customers } from '@/pages/Customers';
import { Rates } from '@/pages/Rates';
import { Collections } from '@/pages/Collections';
import { Bills } from '@/pages/Bills';
import { Payments } from '@/pages/Payments';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <AppProvider>
      <Layout current={page} onNavigate={setPage}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'customers' && <Customers />}
        {page === 'rates' && <Rates />}
        {page === 'collections' && <Collections />}
        {page === 'bills' && <Bills />}
        {page === 'payments' && <Payments />}
        {page === 'reports' && <Reports />}
        {page === 'settings' && <Settings />}
      </Layout>
      <ToastContainer />
      <SpeedInsights />
    </AppProvider>
  );
}

export default App;
