import { describe, expect, it } from 'vitest';
import { extractJsonIntegerString } from './viva';

describe('extractJsonIntegerString', () => {
  it('keeps Viva order codes above Number.MAX_SAFE_INTEGER intact', () => {
    const unsafe = '9917455773672608';
    expect(Number.isSafeInteger(Number(unsafe))).toBe(false);
    const raw = JSON.stringify({ orderCode: Number(unsafe) });
    // JSON.stringify already lost precision — prove we read digits from a precise raw payload
    const precise = `{"orderCode":${unsafe},"statusId":"F"}`;
    expect(extractJsonIntegerString(precise, ['orderCode', 'OrderCode'])).toBe(unsafe);
    // Corrupted parse must not be used as source of truth
    expect(String(JSON.parse(precise).orderCode)).not.toBe(unsafe);
    void raw;
  });

  it('reads OrderCode PascalCase from webhook-shaped bodies', () => {
    const code = '1501733845572603';
    const raw = `{"EventTypeId":1796,"EventData":{"TransactionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","OrderCode":${code}}}`;
    expect(extractJsonIntegerString(raw, ['OrderCode', 'orderCode'])).toBe(code);
  });
});
