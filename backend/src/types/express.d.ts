declare global {
  namespace Express {
    interface Request {
      /** Minimal store object attached by tenantResolver */
      store?: {
        id: string;
        slug: string;
        name: string;
      };
    }
  }
}

export {};
