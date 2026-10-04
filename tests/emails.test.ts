import { describe, expect, it } from 'vitest';
import { parsePeople } from '../web/src/emails';

describe('bulk invite parsing', () => {
  it('reads names and emails in any common format', () => {
    const { people, ignored } = parsePeople(
      'Asha Rao, asha@example.com\nRavi Menon <ravi@example.com>\n"Neha, K" ; neha@example.com\nnobody@example.com\nName, Email',
    );
    expect(people).toEqual([
      { name: 'Asha Rao', email: 'asha@example.com' },
      { name: 'Ravi Menon', email: 'ravi@example.com' },
      { name: 'Neha K', email: 'neha@example.com' },
      { name: 'nobody', email: 'nobody@example.com' },
    ]);
    expect(ignored).toEqual(['Name, Email']);
  });
});
