import { describe, it, expect, vi } from 'vitest';
import * as svc from './adminThresholds';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { success: true, thresholds: [{ id: 't1', thresholdPercent: 12 }] } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true, threshold: { id: 't2' } } })),
    patch: vi.fn(() => Promise.resolve({ data: { success: true, threshold: { id: 't1', thresholdPercent: 15 } } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
  }
}));

describe('adminThresholds service', () => {
  it('fetches thresholds', async () => {
    const res: any = await svc.getThresholds();
    expect(res.success).toBe(true);
    expect(Array.isArray(res.thresholds)).toBe(true);
  });

  it('creates, updates and deletes threshold', async () => {
    const createRes: any = await svc.createThreshold({ thresholdPercent: 10 });
    expect(createRes.success).toBe(true);

    const updRes: any = await svc.updateThreshold('t1', { thresholdPercent: 15 });
    expect(updRes.success).toBe(true);

    const delRes: any = await svc.deleteThreshold('t1');
    expect(delRes.success).toBe(true);
  });
});
