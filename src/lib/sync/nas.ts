// Pedidos autenticados ao servidor do NAS (código de sincronização como "Bearer").

export class HttpError extends Error {
  /** 0 = sem ligação. */
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export type NasIo = { baseUrl?: string; fetchFn?: typeof fetch };

/** Lança HttpError se não houver ligação ou a resposta não for 2xx. */
export async function nasRequest(code: string, method: string, path: string, body?: unknown, io: NasIo = {}): Promise<Response> {
  const { baseUrl = "", fetchFn = (...args) => fetch(...args) } = io;
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${code}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new HttpError(0);
  }
  if (!res.ok) throw new HttpError(res.status);
  return res;
}
