export {};

declare global {
  interface D1Mock {
    tables: Record<string, any[]>;
    bound?: any[];
    prepare?(sql: string): any;
  }
}
