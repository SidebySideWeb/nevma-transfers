import 'server-only';

export type CreateOrderInput = {
  amountCents: number;
  reference: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  paymentTimeoutSeconds: number;
};

export type CreateOrderResult = {
  orderCode: string;
  checkoutUrl: string;
};

export type TransactionResult = {
  transactionId: string;
  orderCode: string;
  amountCents: number;
  succeeded: boolean;
};

export type RefundInput = {
  orderCode: string;
  amountCents: number;
  idempotencyKey: string;
};

export interface PaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  getTransaction(transactionId: string): Promise<TransactionResult>;
  refund(input: RefundInput): Promise<{ refundedCents: number }>;
}

export class FakePaymentProvider implements PaymentProvider {
  orders: CreateOrderResult[] = [];
  refunds: RefundInput[] = [];
  failNextOrder = false;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (this.failNextOrder) {
      this.failNextOrder = false;
      throw new Error('payment_failed');
    }
    const orderCode = String(1000000000000000 + this.orders.length);
    const result = {
      orderCode,
      checkoutUrl: `https://demo.vivapayments.com/web/checkout?ref=${orderCode}`,
    };
    this.orders.push(result);
    void input;
    return result;
  }

  async getTransaction(transactionId: string): Promise<TransactionResult> {
    return {
      transactionId,
      orderCode: this.orders[0]?.orderCode ?? '0',
      amountCents: 0,
      succeeded: true,
    };
  }

  async refund(input: RefundInput): Promise<{ refundedCents: number }> {
    this.refunds.push(input);
    return { refundedCents: input.amountCents };
  }
}

let provider: PaymentProvider = new FakePaymentProvider();

export function getPaymentProvider(): PaymentProvider {
  return provider;
}

export function setPaymentProvider(next: PaymentProvider): void {
  provider = next;
}

export function resetPaymentProvider(): FakePaymentProvider {
  const fake = new FakePaymentProvider();
  provider = fake;
  return fake;
}
