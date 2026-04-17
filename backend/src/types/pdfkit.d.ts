declare module 'pdfkit' {
  // Minimal ambient typing used in our services to avoid adding a heavy dependency.
  class PDFDocument {
    constructor(options?: any);
    on(event: string, cb: (...args: any[]) => void): this;
    fontSize(size: number): this;
    text(text: any, ...args: any[]): this;
    moveDown(amount?: number): this;
    end(): void;
    x: number;
    y: number;
  }

  export default PDFDocument;
}
