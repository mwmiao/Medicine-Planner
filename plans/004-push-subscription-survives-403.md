# Plan 004: A push 403 no longer deletes the phone's subscription, and the app repairs a missing one

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 60b8a06..HEAD -- server/push.mjs tests/push.test.ts src/lib/push.ts src/components/ReminderJobsSync.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `60b8a06`, 2026-11-13

## Why this matters

Reminders are the point of the app for a person who forgets doses. The NAS
deletes a phone's push subscription when the push service answers 400 or 403.
Apple's push service answers 403 for VAPID-token problems (wrong contact
`VAPID_SUBJECT`, changed keys) — configuration mistakes, not a dead phone. After
one such error the subscription is gone, but the phone still has
`mp.push.enabled=1` and shows reminders as on, and nothing re-registers it: the
person simply stops receiving reminders with no visible sign. Fix: only delete on
404/410 (the standard "gone" answers), and let the phone detect "NAS has no
subscription for me" and re-register.

(Confidence note: the Apple 403 behavior is the planning assumption; 404/410 are
the documented Web Push "subscription gone" statuses, so restricting deletion to
them is correct regardless.)

## Current state

`server/push.mjs`, `PushService.deliver`:

```js
} catch (e) {
  const code = e && typeof e === "object" && "statusCode" in e ? e.statusCode : 0;
  // 404/410: subscrição expirada ou cancelada. 400/403 com o endpoint: inválida.
  if (code === 404 || code === 410 || code === 400 || code === 403) dead.add(sub.endpoint);
  else console.error("push failed", code, e instanceof Error ? e.message : e);
}
```

`PushService.status()` returns `{ subscriptions: <count>, pendingJobs, nextAt }`.
Server route `GET /api/push/status` (auth required) returns it.

`src/lib/push.ts` (client; uses `api(method, path, body)` for authenticated calls
and the helpers shown):

```ts
export function remindersEnabled(): boolean {
  return browserKv.get(ENABLED_KEY) === "1" && pushSupported() && Notification.permission === "granted";
}
...
export async function reminderStatus(): Promise<{ subscriptions: number; nextAt: string | null } | null> { ... }
function timezone(): string { ... }
```
and `enableReminders` posts `{ subscription: sub.toJSON(), locale, timezone: timezone() }` to
`/api/push/subscription` (this is how a subscription is registered).

`src/components/ReminderJobsSync.tsx` (mounted app-wide, renders null):

```tsx
export function ReminderJobsSync() {
  const { m, locale } = useMessages();
  const version = useLiveQuery(...);
  useEffect(() => {
    if (version === undefined || !remindersEnabled()) return;
    const id = setTimeout(() => void uploadReminderJobs(locale, m).catch(() => undefined), 2000);
    return () => clearTimeout(id);
  }, [version, locale, m]);
  return null;
}
```

Existing server test to keep passing: in `tests/push.test.ts`,
`"remove subscrições expiradas ou recusadas"` uses status 410 and expects
`{ sent: 0, removed: 1 }`; the real-network test replies 410 too. The helper
`service(logs, failWith)` makes a `PushService` whose `send` throws
`{ statusCode: failWith }`. `fakeSubscription(endpoint)` builds a valid fake subscription.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Push tests | `npx vitest run tests/push.test.ts` | all pass |
| All tests | `npm test` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**:
- `server/push.mjs` (the one condition in `deliver`)
- `tests/push.test.ts` (add one test)
- `src/lib/push.ts` (add `repairSubscription`)
- `src/components/ReminderJobsSync.tsx` (call it)

**Out of scope**:
- `server/server.mjs`, `public/sw.js`, `RemindersSection.tsx`, i18n files (no new UI text).
- The job-retry logic in `tick` (unchanged).

## Git workflow

- Branch: `advisor/004-push-403`
- One commit; short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing server test

In `tests/push.test.ts` add:

```ts
it("não apaga a subscrição por um 403 (pode ser só configuração VAPID); 404/410 sim", async () => {
  for (const code of [400, 403, 500]) {
    const { svc } = service([], code);
    await svc.subscribe({ subscription: fakeSubscription("https://push.example/keep") });
    expect((await svc.sendTest({ locale: "pt" })).body).toEqual({ sent: 0, removed: 0 });
    expect((await svc.status()).subscriptions).toBe(1);
  }
  const { svc } = service([], 404);
  await svc.subscribe({ subscription: fakeSubscription("https://push.example/gone") });
  expect((await svc.sendTest({})).body).toEqual({ sent: 0, removed: 1 });
});
```

**Verify**: `npx vitest run tests/push.test.ts` → the new test FAILS for 400 and 403
(removed is 1). If it passes already, STOP.

### Step 2: Restrict deletion to 404/410

In `deliver`, replace the condition and comment with:

```js
// 404/410: subscrição expirada ou cancelada. Outros erros (ex.: 403 por chaves VAPID erradas)
// não apagam a subscrição: são registados e tentados outra vez.
if (code === 404 || code === 410) dead.add(sub.endpoint);
else console.error("push failed", code, e instanceof Error ? e.message : e);
```

**Verify**: `npx vitest run tests/push.test.ts` → all pass.

### Step 3: Let the phone repair a missing subscription

In `src/lib/push.ts` add (near `reminderStatus`):

```ts
/** Se os lembretes estão ligados mas o NAS não tem nenhuma subscrição, regista a deste telemóvel outra vez. */
export async function repairSubscription(locale: Locale): Promise<void> {
  if (!remindersEnabled() || !getSync().connected) return;
  const status = await reminderStatus();
  if (!status || status.subscriptions > 0) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api("POST", "/api/push/subscription", { subscription: sub.toJSON(), locale, timezone: timezone() });
}
```

In `src/components/ReminderJobsSync.tsx` import `repairSubscription` from
`@/lib/push` and add one effect that runs it first, once per locale change/mount,
errors swallowed:

```tsx
useEffect(() => {
  void repairSubscription(locale).catch(() => undefined);
}, [locale]);
```

Do not change the existing upload effect.

**Verify**: `npm run typecheck` → exit 0.

### Step 4: Full verification

**Verify**: `npm test` → exit 0.

**Manual check (cannot be automated here; report it as not run)**: with the app
installed on an iPhone and connected to a NAS, enable reminders, delete
`/data/push.json`'s `subscriptions` entry (container stopped), start the
container, open the app → `GET /api/push/status` shows `subscriptions: 1` again
within a few seconds, and "Enviar lembrete de teste" delivers.

## Test plan

- 1 new server test (Step 1), pattern: the neighbouring `"remove subscrições expiradas ou recusadas"` test.
- `repairSubscription` is browser-only (`navigator.serviceWorker`, `PushManager`) and has no existing unit-test harness; it is covered by typecheck plus the manual check above. Do not build a mock harness for it in this plan.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0, new test passes
- [ ] `grep -n "code === 400\|code === 403" server/push.mjs` returns nothing
- [ ] `git status` shows only the four in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The new test passes before Step 2.
- A subscription that returns 400 for a malformed payload now makes every tick log and retry forever — if you see `tick` re-sending the same job each minute in tests, stop; do not change retry logic here.
- `repairSubscription` would need to import something that creates a cycle (`push.ts` ↔ `sync/index.ts`); it already imports `getSync`, so none is expected.

## Maintenance notes

- `repairSubscription` checks only the *count*: a second phone's subscription masks a missing one on this phone. Fixing that needs the status route to expose endpoint hashes — deliberately deferred.
- Dead endpoints that keep returning 5xx or 400 are now kept; they cost one failed send per due reminder and are logged. If that becomes noisy, add a consecutive-failure counter rather than deleting on 403 again.
- Reviewer: this changes who deletes subscriptions; confirm the 404/410 paths (and the real-network test in `tests/push.test.ts`) still pass.
