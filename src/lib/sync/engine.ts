// Sincronização com o NAS (opcional). A app continua a funcionar só com os
// dados do telemóvel (IndexedDB); quando há ligação ao servidor, junta as
// alterações dos dois lados e guarda o resultado nos dois.

import type { PlannerDB } from "../db";
import { isDoseLog, isInfarmedRecord, isMedication } from "../backup";
import { emptyTombstones, mergeSyncData, type SyncData, type Tombstones } from "./merge";

export type SyncStatus = "off" | "idle" | "syncing" | "offline" | "unauthorized" | "unavailable" | "error";

export type SyncState = { status: SyncStatus; lastSyncedAt?: string };

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const K = {
  code: "mp.sync.code",
  revision: "mp.sync.revision",
  dirty: "mp.sync.dirty",
  force: "mp.sync.force",
  tombstones: "mp.sync.tombstones",
  lastSyncedAt: "mp.sync.lastSyncedAt",
} as const;

type Remote = { revision: number; updatedAt: string | null; data: unknown };

class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function isTombstoneMap(v: unknown): v is Record<string, string> {
  return isObj(v) && Object.values(v).every((x) => typeof x === "string");
}

/** Valida dados vindos do servidor; devolve null se não forem uma cópia válida. */
export function parseSyncData(v: unknown): SyncData | null {
  if (!isObj(v)) return null;
  const { medications, doseLogs, infarmedCache = [], tombstones } = v;
  if (!Array.isArray(medications) || !medications.every(isMedication)) return null;
  if (!Array.isArray(doseLogs) || !doseLogs.every(isDoseLog)) return null;
  if (!Array.isArray(infarmedCache) || !infarmedCache.every(isInfarmedRecord)) return null;
  const t = isObj(tombstones) ? tombstones : {};
  return {
    schema: 1,
    medications,
    doseLogs,
    infarmedCache,
    tombstones: {
      medications: isTombstoneMap(t.medications) ? t.medications : {},
      doseLogs: isTombstoneMap(t.doseLogs) ? t.doseLogs : {},
    },
  };
}

export class SyncEngine {
  private state: SyncState;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private applying = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hooked = false;

  constructor(
    private readonly db: PlannerDB,
    private readonly kv: KeyValue,
    private readonly baseUrl = "",
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {
    this.state = { status: kv.get(K.code) ? "idle" : "off", lastSyncedAt: kv.get(K.lastSyncedAt) ?? undefined };
  }

  // ---------- estado para a interface ----------

  getState = (): SyncState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  get connected(): boolean {
    return Boolean(this.kv.get(K.code));
  }

  // ---------- registo de alterações locais ----------

  /** Regista cada alteração local para a enviar ao NAS (e lápides quando se apaga). */
  installHooks(): void {
    if (this.hooked) return;
    this.hooked = true;
    const tables = [
      [this.db.medications, "medications"],
      [this.db.doseLogs, "doseLogs"],
      [this.db.infarmedCache, null],
    ] as const;
    for (const [table, tombKey] of tables) {
      table.hook("creating", () => this.onLocalChange());
      table.hook("updating", () => this.onLocalChange());
      table.hook("deleting", (pk) => {
        if (this.applying) return;
        if (tombKey) this.addTombstone(tombKey, String(pk));
        this.onLocalChange();
      });
    }
  }

  private onLocalChange() {
    if (this.applying) return;
    this.kv.set(K.dirty, String(Number(this.kv.get(K.dirty) ?? 0) + 1));
    if (this.connected) this.schedule(1500);
  }

  private addTombstone(key: keyof Tombstones, id: string) {
    const t = this.tombstones();
    t[key][id] = new Date().toISOString();
    this.kv.set(K.tombstones, JSON.stringify(t));
  }

  private tombstones(): Tombstones {
    try {
      const parsed: unknown = JSON.parse(this.kv.get(K.tombstones) ?? "null");
      if (isObj(parsed) && isTombstoneMap(parsed.medications) && isTombstoneMap(parsed.doseLogs)) {
        return { medications: parsed.medications, doseLogs: parsed.doseLogs };
      }
    } catch {
      // ignora valor corrompido
    }
    return emptyTombstones();
  }

  /** Depois de importar ou apagar tudo: a cópia deste telemóvel passa a ser a verdade. */
  markReplaceAll(): void {
    this.kv.set(K.force, "1");
    this.kv.set(K.tombstones, JSON.stringify(emptyTombstones()));
    if (this.connected) this.schedule(500);
  }

  // ---------- ligação ----------

  /** Testa o código e, se estiver certo, guarda-o e faz a primeira sincronização (junta tudo). */
  async connect(code: string): Promise<SyncStatus> {
    try {
      await this.request("GET", code.trim());
    } catch (e) {
      return this.errorStatus(e);
    }
    this.kv.set(K.code, code.trim());
    this.kv.remove(K.revision); // primeira vez: junta em vez de substituir
    await this.syncNow();
    return this.state.status;
  }

  disconnect(): void {
    for (const k of [K.code, K.revision, K.force, K.lastSyncedAt]) this.kv.remove(k);
    this.setState({ status: "off", lastSyncedAt: undefined });
  }

  schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), ms);
  }

  // ---------- sincronização ----------

  syncNow(): Promise<void> {
    if (!this.connected) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  private async run(): Promise<void> {
    this.setState({ status: "syncing" });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await this.attempt()) {
          const at = new Date().toISOString();
          this.kv.set(K.lastSyncedAt, at);
          this.setState({ status: "idle", lastSyncedAt: at });
          return;
        }
      }
      this.setState({ status: "error" });
    } catch (e) {
      this.setState({ status: this.errorStatus(e) });
    }
  }

  /** Uma tentativa. Devolve false se outra cópia escreveu entretanto (conflito) e é preciso repetir. */
  private async attempt(): Promise<boolean> {
    const code = this.kv.get(K.code) ?? "";
    const remote = (await this.request("GET", code)) as Remote;
    const dirtyAtStart = Number(this.kv.get(K.dirty) ?? 0);
    const lastRevision = this.kv.get(K.revision);
    const local = await this.readLocal();
    const remoteData = remote.data === null ? null : parseSyncData(remote.data);
    if (remote.data !== null && !remoteData) throw new Error("Invalid server data");

    const force = this.kv.get(K.force) === "1";
    const firstTime = lastRevision === null;
    const localHasData = local.medications.length + local.doseLogs.length > 0;
    const dirty = dirtyAtStart > 0 || (firstTime && localHasData);

    let toSave: SyncData | null = null;
    let forcePut = false;
    if (force) {
      toSave = local;
      forcePut = true;
    } else if (!remoteData) {
      toSave = local;
    } else if (!dirty) {
      if (String(remote.revision) !== lastRevision) await this.applyLocal(remoteData);
      this.kv.set(K.revision, String(remote.revision));
      return true;
    } else {
      toSave = mergeSyncData(local, remoteData);
    }

    try {
      const saved = (await this.request("PUT", code, { baseRevision: remote.revision, force: forcePut, data: toSave })) as Remote;
      this.kv.set(K.revision, String(saved.revision));
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) return false;
      throw e;
    }
    await this.applyLocal(toSave);
    this.kv.remove(K.force);
    // Só limpa as alterações pendentes se não houve outras durante a sincronização.
    if (Number(this.kv.get(K.dirty) ?? 0) === dirtyAtStart) this.kv.set(K.dirty, "0");
    else this.again = true;
    return true;
  }

  private async readLocal(): Promise<SyncData> {
    const [medications, doseLogs, infarmedCache] = await Promise.all([
      this.db.medications.toArray(),
      this.db.doseLogs.toArray(),
      this.db.infarmedCache.toArray(),
    ]);
    return { schema: 1, medications, doseLogs, infarmedCache, tombstones: this.tombstones() };
  }

  /** Substitui os dados do telemóvel pela versão juntada (sem registar como alteração local). */
  private async applyLocal(data: SyncData): Promise<void> {
    const db = this.db;
    this.applying = true;
    try {
      await db.transaction("rw", db.medications, db.doseLogs, db.infarmedCache, async () => {
        await Promise.all([db.medications.clear(), db.doseLogs.clear(), db.infarmedCache.clear()]);
        await db.medications.bulkPut(data.medications);
        await db.doseLogs.bulkPut(data.doseLogs);
        await db.infarmedCache.bulkPut(data.infarmedCache);
      });
    } finally {
      this.applying = false;
    }
    this.kv.set(K.tombstones, JSON.stringify(data.tombstones));
  }

  private async request(method: "GET" | "PUT", code: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/api/data`, {
        method,
        headers: { Authorization: `Bearer ${code}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new HttpError(0);
    }
    if (!res.ok) throw new HttpError(res.status);
    return res.json();
  }

  private errorStatus(e: unknown): SyncStatus {
    if (e instanceof HttpError) {
      if (e.status === 0) return "offline";
      if (e.status === 401 || e.status === 429) return "unauthorized";
      if (e.status === 404 || e.status === 503) return "unavailable";
    }
    return "error";
  }
}

/** O servidor tem sincronização? (Falso no Vercel ou num NAS sem SYNC_CODE.) */
export async function syncAvailable(baseUrl = "", fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  try {
    const res = await fetchFn(`${baseUrl}/api/health`, { cache: "no-store" });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return isObj(body) && body.sync === true;
  } catch {
    return false;
  }
}
