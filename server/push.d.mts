export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Result = { status: number; body: Record<string, unknown> };

export class PushService {
  constructor(opts: {
    dataDir: string;
    subject: string;
    publicKey?: string;
    privateKey?: string;
    readDoseLogs: () => Promise<{ id: string; status: string }[]>;
    send?: (sub: Subscription, payload: string, options: object) => Promise<unknown>;
  });
  publicKey(): Promise<string>;
  subscribe(body: unknown): Promise<Result>;
  unsubscribe(body: unknown): Promise<Result>;
  setJobs(body: unknown): Promise<Result>;
  sendTest(body: unknown): Promise<Result>;
  status(): Promise<{ subscriptions: number; pendingJobs: number; nextAt: string | null }>;
  tick(now?: number): Promise<{ sent: number; skipped: number; due: number }>;
}
