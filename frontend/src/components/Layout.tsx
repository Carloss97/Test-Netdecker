export function Header() {
  return (
    <header className="app-header" style={{ padding: '20px', borderBottom: '1px solid #ddd' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <span className="badge" style={{ marginBottom: 10 }}>Trading Card Operations</span>
        <h1 style={{ fontSize: '2rem', letterSpacing: '-0.04em' }}>TCG Singles Platform</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Catalog automation, pricing sync, and inventory control in one operational workspace.
        </p>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="app-footer" style={{ padding: '20px', textAlign: 'center', marginTop: '40px' }}>
      <p>&copy; 2026 TCG Singles Platform. Operational prototype.</p>
    </footer>
  );
}
