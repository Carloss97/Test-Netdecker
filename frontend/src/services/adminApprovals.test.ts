import { describe, it, expect, vi } from 'vitest';
import * as svc from './adminApprovals';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { success: true, approvals: [{ id: 'a1', cardName: 'Test', newPrice: 120 }] } })),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
  }
}));

describe('adminApprovals service', () => {
  it('lists pending approvals', async () => {
    const res: any = await svc.listPendingApprovals(10);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.approvals)).toBe(true);
  });

  it('approves and rejects', async () => {
    const a = await svc.approveApproval('a1');
    expect(a.success).toBe(true);
    const r = await svc.rejectApproval('a1', 'no aplica');
    expect(r.success).toBe(true);
  });
});
