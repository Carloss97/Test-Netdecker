import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../services/stores', () => ({
  createStore: vi.fn(),
  updateStore: vi.fn(),
}));

import StoreForm from './StoreForm';
import { createStore, updateStore } from '../services/stores';

describe('StoreForm', () => {
  it('validates required fields and shows errors', async () => {
    render(<StoreForm />);

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    expect(await screen.findByText('Slug is required (min 2 chars)')).toBeTruthy();
    expect(await screen.findByText('Name is required (min 2 chars)')).toBeTruthy();
  });

  it('calls createStore with valid payload', async () => {
    (createStore as any).mockResolvedValue({ id: 's1', slug: 's1', name: 'Store 1' });
    render(<StoreForm onSaved={() => {}} />);

    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Store 1' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });

    const saveBtn = screen.getByText('Save');
    fireEvent.click(saveBtn);

    // wait for async
    await new Promise((r) => setTimeout(r, 10));
    expect(createStore).toHaveBeenCalled();
  });
});
