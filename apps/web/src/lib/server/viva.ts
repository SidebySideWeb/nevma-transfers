import 'server-only';
import { BookingError } from '../booking/types';
import type {
  CreateOrderInput,
  CreateOrderResult,
  PaymentProvider,
  RefundInput,
  TransactionResult,
} from './payments';

type Hosts = {
  accounts: string;
  api: string;
  basic: string;
  checkout: string;
};

function hosts(env: 'demo' | 'live'): Hosts {
  if (env === 'live') {
    return {
      accounts: 'https://accounts.vivapayments.com',
      api: 'https://api.vivapayments.com',
      basic: 'https://www.vivapayments.com',
      checkout: 'https://www.vivapayments.com',
    };
  }
  return {
    accounts: 'https://demo-accounts.vivapayments.com',
    api: 'https://demo-api.vivapayments.com',
    basic: 'https://demo.vivapayments.com',
    checkout: 'https://demo.vivapayments.com',
  };
}

/** Major-unit amount (e.g. 30.00) → integer cents. */
export function majorToCents(amount: number | string): number {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) {
    throw new BookingError('payment_failed', {
      stringKey: 'error.payment_failed',
      message: 'bad_amount',
    });
  }
  return Math.round(n * 100);
}

/**
 * Read a large integer JSON field as a decimal string.
 * Viva order codes can exceed Number.MAX_SAFE_INTEGER; JSON.parse would corrupt them.
 */
export function extractJsonIntegerString(raw: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(`"${key}"\\s*:\\s*(\\d+)`, 'i');
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

type FetchLike = typeof fetch;

export type VivaConfig = {
  clientId: string;
  clientSecret: string;
  sourceCode: string;
  merchantId: string;
  apiKey: string;
  env: 'demo' | 'live';
  fetch?: FetchLike;
};

export class VivaPaymentProvider implements PaymentProvider {
  private token: { value: string; expiresAt: number } | null = null;
  private webhookKey: { value: string; expiresAt: number } | null = null;
  private readonly fetchFn: FetchLike;
  private readonly h: Hosts;

  constructor(private readonly cfg: VivaConfig) {
    this.fetchFn = cfg.fetch ?? fetch;
    this.h = hosts(cfg.env);
  }

  private async request(
    url: string,
    init: RequestInit,
    auth: 'bearer' | 'basic',
  ): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
    const headers = new Headers(init.headers);
    if (auth === 'bearer') {
      headers.set('Authorization', `Bearer ${await this.accessToken()}`);
    } else {
      const raw = Buffer.from(`${this.cfg.merchantId}:${this.cfg.apiKey}`).toString('base64');
      headers.set('Authorization', `Basic ${raw}`);
    }
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const run = async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const res = await this.fetchFn(url, { ...init, headers, signal: ctrl.signal });
        const text = await res.text();
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        return { ok: res.ok, status: res.status, json, text };
      } finally {
        clearTimeout(t);
      }
    };

    try {
      return await run();
    } catch (e) {
      // One retry on network errors only.
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('fetch'))) {
        try {
          return await run();
        } catch (e2) {
          console.error(
            JSON.stringify({
              level: 'error',
              code: 'viva_network',
              err: e2 instanceof Error ? e2.name : 'unknown',
            }),
          );
          throw new BookingError('payment_failed', {
            stringKey: 'error.payment_failed',
            message: 'viva_network',
          });
        }
      }
      throw e;
    }
  }

  private failViva(code: unknown): never {
    console.error(JSON.stringify({ level: 'error', code: 'viva_api', vivaCode: code ?? null }));
    throw new BookingError('payment_failed', {
      stringKey: 'error.payment_failed',
      message: 'payment_failed',
    });
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) {
      return this.token.value;
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
    });
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.h.accounts}/connect/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: ctrl.signal,
      });
    } catch {
      this.failViva('token_network');
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) this.failViva(res.status);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) this.failViva('no_token');
    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const customerTrns = input.customerTrns ?? `Booking ${input.reference}`;
    const { ok, json, text } = await this.request(
      `${this.h.api}/checkout/v2/orders`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: input.amountCents,
          sourceCode: this.cfg.sourceCode,
          merchantTrns: input.reference,
          customerTrns,
          paymentTimeout: input.paymentTimeoutSeconds,
          customer: {
            email: input.customerEmail,
            fullName: input.customerName,
            phone: input.customerPhone,
            requestLang: 'en-GB',
          },
        }),
      },
      'bearer',
    );
    const orderCode = extractJsonIntegerString(text, ['orderCode', 'OrderCode']) ?? '';
    if (!ok || !orderCode) {
      this.failViva((json as { ErrorCode?: unknown } | null)?.ErrorCode);
    }
    return {
      orderCode,
      checkoutUrl: `${this.h.checkout}/web/checkout?ref=${orderCode}`,
    };
  }

  async getTransaction(transactionId: string): Promise<TransactionResult> {
    const { ok, json, text } = await this.request(
      `${this.h.api}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`,
      { method: 'GET' },
      'bearer',
    );
    if (!ok || !json || typeof json !== 'object') this.failViva('txn');
    const t = json as {
      amount?: number | string;
      statusId?: string;
    };
    const amountCents = majorToCents(t.amount ?? NaN);
    const orderCode = extractJsonIntegerString(text, ['orderCode', 'OrderCode']) ?? '';
    return {
      transactionId,
      orderCode,
      amountCents,
      succeeded: t.statusId === 'F',
    };
  }

  async refund(input: RefundInput): Promise<{ refundedCents: number }> {
    const q = new URLSearchParams({
      amount: String(input.amountCents),
      currencyCode: '978',
      sourceCode: this.cfg.sourceCode,
    });
    const { ok, json } = await this.request(
      `${this.h.basic}/api/transactions/${encodeURIComponent(input.transactionId)}?${q}`,
      { method: 'DELETE' },
      'basic',
    );
    const statusId = (json as { StatusId?: string; statusId?: string } | null)?.StatusId
      ?? (json as { statusId?: string } | null)?.statusId;
    if (!ok || statusId !== 'F') {
      this.failViva((json as { ErrorCode?: unknown } | null)?.ErrorCode);
    }
    return { refundedCents: input.amountCents };
  }

  async getWebhookKey(): Promise<string> {
    if (this.webhookKey && Date.now() < this.webhookKey.expiresAt) {
      return this.webhookKey.value;
    }
    const { ok, json } = await this.request(
      `${this.h.basic}/api/messages/config/token`,
      { method: 'GET' },
      'basic',
    );
    const key = (json as { Key?: string } | null)?.Key;
    if (!ok || !key) this.failViva('webhook_key');
    this.webhookKey = { value: key, expiresAt: Date.now() + 60 * 60_000 };
    return key;
  }
}

export function createVivaFromEnv(): VivaPaymentProvider | null {
  const env = (import.meta.env.VIVA_ENV || process.env.VIVA_ENV) as string | undefined;
  if (env !== 'demo' && env !== 'live') return null;
  const clientId = import.meta.env.VIVA_CLIENT_ID || process.env.VIVA_CLIENT_ID;
  const clientSecret = import.meta.env.VIVA_CLIENT_SECRET || process.env.VIVA_CLIENT_SECRET;
  const sourceCode = import.meta.env.VIVA_SOURCE_CODE || process.env.VIVA_SOURCE_CODE;
  const merchantId = import.meta.env.VIVA_MERCHANT_ID || process.env.VIVA_MERCHANT_ID;
  const apiKey = import.meta.env.VIVA_API_KEY || process.env.VIVA_API_KEY;
  if (!clientId || !clientSecret || !sourceCode || !merchantId || !apiKey) return null;
  return new VivaPaymentProvider({
    clientId,
    clientSecret,
    sourceCode,
    merchantId,
    apiKey,
    env,
  });
}
