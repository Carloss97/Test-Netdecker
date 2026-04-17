import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../services/stores', () => ({
  getStores: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
}));

import StoresList from './StoresList';
import { getStores, createStore } from '../../services/stores';

describe('StoresList page', () => {
  it('renders list from getStores and allows creating a store', async () => {
    (getStores as any)
      .mockResolvedValueOnce([]) // initial
      .mockResolvedValueOnce([{ id: 's1', slug: 's1', name: 'Store 1', currency: 'USD', taxRate: 0 }]); // after create

    (createStore as any).mockResolvedValue({ id: 's1', slug: 's1', name: 'Store 1' });

    render(<StoresList />);

    // New Store button
    fireEvent.click(await screen.findByText('New Store'));

    // Fill form
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Store 1' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(createStore).toHaveBeenCalled());

    // After save, list is refreshed and shows the store
    expect(await screen.findByText('Store 1')).toBeTruthy();
  });
});
