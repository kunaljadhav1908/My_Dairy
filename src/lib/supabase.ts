import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://'));

type TableRecord = Record<string, unknown>;

class MockBuilder {
  private table: string;
  private filters: ((item: TableRecord) => boolean)[] = [];
  private orderCol: string | null = null;
  private orderAsc: boolean = true;
  private limitCount: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private deleteQuery: boolean = false;
  private updatePayload: TableRecord | null = null;
  private insertPayload: TableRecord | TableRecord[] | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(fields?: string, options?: Record<string, unknown>) {
    void fields;
    void options;
    return this;
  }
 
  insert(payload: TableRecord | TableRecord[]) {
    this.insertPayload = payload;
    return this;
  }
 
  update(payload: TableRecord) {
    this.updatePayload = payload;
    return this;
  }

  delete() {
    this.deleteQuery = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((item) => item[column] === value);
    return this;
  }
 
  gte(column: string, value: unknown) {
    this.filters.push((item) => {
      const itemValue = item[column];
      if (typeof itemValue === 'number' && typeof value === 'number') {
        return itemValue >= value;
      }
      if (typeof itemValue === 'string' && typeof value === 'string') {
        return itemValue >= value;
      }
      return false;
    });
    return this;
  }
 
  lt(column: string, value: unknown) {
    this.filters.push((item) => {
      const itemValue = item[column];
      if (typeof itemValue === 'number' && typeof value === 'number') {
        return itemValue < value;
      }
      if (typeof itemValue === 'string' && typeof value === 'string') {
        return itemValue < value;
      }
      return false;
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async then(onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) {
    try {
      const result = await this.execute();
      return onfulfilled ? onfulfilled(result) : result;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  private async execute() {
    const key = `mock_db_${this.table}`;
    let items = JSON.parse(localStorage.getItem(key) || '[]') as TableRecord[];

    // Seed default settings row if settings is queried and empty
    if (this.table === 'settings' && items.length === 0) {
      items = [{
        id: 1,
        dairy_name: 'My Dairy',
        logo_url: '',
        address: '123 Dairy Lane, Milk City',
        phone: '9876543210',
        gst: '27AAAAA0000A1Z5',
        upi_id: 'dairy@upi',
        upi_qr_url: '',
        receipt_footer: 'Thank you for your business!',
        terms_and_conditions: 'Payment due within 15 days of bill generation.',
        currency: 'INR',
        currency_symbol: '₹',
        dark_mode: false,
        updated_at: new Date().toISOString()
      }];
      localStorage.setItem(key, JSON.stringify(items));
    }

    if (this.insertPayload) {
      const newItems = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload];
      const inserted: TableRecord[] = [];
      for (const item of newItems) {
        const fullItem: TableRecord = {
          id: item.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item
        };

        if (this.table === 'customers' && !fullItem.customer_id) {
          const count = items.length + 1;
          fullItem.customer_id = `CUST-${String(count).padStart(5, '0')}`;
        }
        if (this.table === 'bills' && !fullItem.invoice_number) {
          const count = items.length + 1;
          fullItem.invoice_number = `INV-${String(count).padStart(6, '0')}`;
        }
        if (this.table === 'payments' && !fullItem.payment_number) {
          const count = items.length + 1;
          fullItem.payment_number = `PAY-${String(count).padStart(6, '0')}`;
        }

        items.push(fullItem);
        inserted.push(fullItem);
      }
      localStorage.setItem(key, JSON.stringify(items));
      return { data: Array.isArray(this.insertPayload) ? inserted : inserted[0], error: null };
    }

    if (this.updatePayload) {
      const updatedItems = items.map((item: TableRecord) => {
        const match = this.filters.every((f) => f(item));
        if (match) {
          return {
            ...item,
            ...this.updatePayload,
            updated_at: new Date().toISOString()
          };
        }
        return item;
      });
      localStorage.setItem(key, JSON.stringify(updatedItems));
      const affected = updatedItems.filter((item: TableRecord) => this.filters.every((f) => f(item)));
      return { data: affected.length > 0 ? (this.isSingle ? affected[0] : affected) : null, error: null };
    }

    if (this.deleteQuery) {
      const remainingItems = items.filter((item: TableRecord) => !this.filters.every((f) => f(item)));
      localStorage.setItem(key, JSON.stringify(remainingItems));
      return { data: null, error: null };
    }

    // SELECT query
    let filtered = items;
    for (const f of this.filters) {
      filtered = filtered.filter(f);
    }

    if (this.orderCol) {
      const col = this.orderCol;
      const asc = this.orderAsc;
      filtered.sort((a: TableRecord, b: TableRecord) => {
        const valA = a[col];
        const valB = b[col];
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (typeof valA === 'string' && typeof valB === 'string') {
          return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA;
        }
        return 0;
      });
    }

    if (this.limitCount !== null) {
      filtered = filtered.slice(0, this.limitCount);
    }

    if (this.isSingle || this.isMaybeSingle) {
      return { data: filtered.length > 0 ? filtered[0] : null, error: null, count: filtered.length };
    }

    return { data: filtered, error: null, count: filtered.length };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : ({
      from: (table: string) => new MockBuilder(table),
    });
