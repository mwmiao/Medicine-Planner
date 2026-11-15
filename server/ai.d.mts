export type Result = { status: number; body: Record<string, any> };

export const SECTIONS: readonly string[];
export const LEAFLET_SYSTEM: string;

export function createAi(opts?: {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  hourlyLimit?: number;
  now?: () => number;
}): {
  enabled: boolean;
  leaflet(body: unknown): Promise<Result>;
  box(body: unknown): Promise<Result>;
};
