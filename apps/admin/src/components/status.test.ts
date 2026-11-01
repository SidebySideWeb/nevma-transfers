import { describe, expect, it } from 'vitest';
import { BOOKING_STATUSES, renderStatusBadge, statusClass, statusWord } from './status';

describe('StatusBadge', () => {
  it('renders the word for every status', () => {
    for (const status of BOOKING_STATUSES) {
      const html = renderStatusBadge(status);
      expect(html).toContain(`>${statusWord(status)}<`);
      expect(html).toContain(`class="badge ${statusClass(status)}"`);
    }
  });
});
