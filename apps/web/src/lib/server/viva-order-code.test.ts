import { describe, expect, it } from 'vitest';
import { extractJsonIntegerString } from './viva';

describe('extractJsonIntegerString', () => {
  it('keeps Viva order codes above Number.MAX_SAFE_INTEGER intact', () => {
    // MAX_SAFE_INTEGER + 2 is a classic case JSON.parse rounds (→ …992).
    const unsafe = '9007199254740993';
    expect(Number.isSafeInteger(Number(unsafe))).toBe(false);
    const precise = `{"orderCode":${unsafe},"statusId":"F"}`;
    expect(extractJsonIntegerString(precise, ['orderCode', 'OrderCode'])).toBe(unsafe);
    expect(String(JSON.parse(precise).orderCode)).not.toBe(unsafe);
  });

  it('reads OrderCode PascalCase from webhook-shaped bodies', () => {
    const code = '1501733845572603';
    const raw = `{"EventTypeId":1796,"EventData":{"TransactionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","OrderCode":${code}}}`;
    expect(extractJsonIntegerString(raw, ['OrderCode', 'orderCode'])).toBe(code);
  });
});
