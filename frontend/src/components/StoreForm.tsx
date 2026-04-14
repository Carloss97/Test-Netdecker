import React, { useEffect, useState } from 'react';
import type { Store } from '../types';
import { createStore, updateStore } from '../services/stores';

interface Props {
  initialData?: Store | null;
  onSaved?: (store: Store) => void;
  onCancel?: () => void;
}

const StoreForm: React.FC<Props> = ({ initialData, onSaved, onCancel }) => {
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [currency, setCurrency] = useState(initialData?.currency || '');
  const [taxRate, setTaxRate] = useState<number | ''>(initialData?.taxRate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setSlug(initialData?.slug || '');
    setName(initialData?.name || '');
    setDescription(initialData?.description || '');
    setCurrency(initialData?.currency || '');
    setTaxRate(initialData?.taxRate ?? '');
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setValidationErrors({});

    const errors: Record<string, string> = {};
    if (!slug || slug.trim().length < 2) errors.slug = 'Slug is required (min 2 chars)';
    if (!name || name.trim().length < 2) errors.name = 'Name is required (min 2 chars)';
    if (currency && currency.length !== 3) errors.currency = 'Currency should be a 3-letter code';
    if (taxRate !== '' && (Number.isNaN(Number(taxRate)) || Number(taxRate) < 0)) errors.taxRate = 'Tax rate must be a non-negative number';

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setSaving(false);
      return;
    }

    try {
      const payload: any = { slug: slug.trim(), name: name.trim(), description, currency };
      if (taxRate !== '') payload.taxRate = Number(taxRate);

      const res = initialData?.id ? await updateStore(initialData.id, payload) : await createStore(payload);
      if (onSaved) onSaved(res);
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        <label htmlFor="slug">Slug</label>
        <input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!initialData?.id} />
        {validationErrors.slug && <div style={{ color: 'red' }}>{validationErrors.slug}</div>}
      </div>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        {validationErrors.name && <div style={{ color: 'red' }}>{validationErrors.name}</div>}
      </div>
      <div>
        <label htmlFor="description">Description</label>
        <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label htmlFor="currency">Currency</label>
        <input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        {validationErrors.currency && <div style={{ color: 'red' }}>{validationErrors.currency}</div>}
      </div>
      <div>
        <label htmlFor="taxRate">Tax Rate</label>
        <input
          id="taxRate"
          type="number"
          value={taxRate as any}
          onChange={(e) => setTaxRate(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {validationErrors.taxRate && <div style={{ color: 'red' }}>{validationErrors.taxRate}</div>}
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ marginLeft: 8 }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default StoreForm;
