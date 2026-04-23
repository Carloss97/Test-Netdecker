declare global {
  namespace Express {
    interface Request {
      /** Minimal store object attached by tenantResolver */
      store?: {
        id: string;
        slug: string;
        name: string;
      };

      /** Minimal admin user attached by requireAdmin middleware */
      adminUser?: {
        id: string;
        email: string;
        role: 'ADMIN' | 'MANAGER' | 'STAFF';
        storeId?: string | null;
      };
    }
  }
}

export {};
