# Plan 008: A second push reminder arrives when a dose is still not recorded 15 minutes later

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 34ffff1..HEAD -- src/lib/reminders/jobs.ts tests/reminder-jobs.test.ts src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes what the NAS sends; see maintenance notes)
- **Depends on**: none
- **Category**: direction (usability / safety)
- **Planned at**: commit `34ffff1`, 2026-11-15

## Why this matters

Each dose produces exactly one Web-Push reminder. If the elderly user does not
notice that single notification (phone in another room, screen locked, silent
mode), nothing else prompts her: the in-app banner only exists while the app is
open. After this plan, a dose that is still untaken 15 minutes after its
reminder triggers one more push with different wording ("not recorded yet").
Taking or recording the dose in the app cancels it, because the phone re-uploads
the job list and the server replaces unsent jobs.

**Assumption to confirm with the owner**: the gap is 15 minutes, and only one
follow-up per dose. It is a single constant (`FOLLOW_UP_MINUTES`), easy to change.

## Current state

`src/lib/reminders/jobs.ts` builds the list of push "jobs" the phone uploads to
the NAS. Key parts:

```ts
export const REMINDER_DAYS = 30;
export const REMINDER_URL = "/?from=reminder";

export function buildReminderJobs(meds, logs, m, now = new Date(), days = REMINDER_DAYS): ReminderJob[] {
  ...
  for (let i = 0; i < days; i++) {
    ...
      for (const time of [...new Set(med.times)]) {
        const scheduledFor = `${key}T${time}`;
        const id = doseId(med.id, scheduledFor);
        const log = byId.get(id);
        if (log?.status === "taken" || log?.status === "skipped") continue;
        // Toma adiada: o lembrete passa para a nova hora.
        const when = log?.status === "snoozed" && log.snoozedUntil ? log.snoozedUntil : scheduledFor;
        const at = parseLocalDateTime(when);
        if (at.getTime() < now.getTime() - 60_000) continue;
        jobs.push({
          id: when === scheduledFor ? id : `${id}|${when}`,
          at: at.toISOString(),
          title: m.reminders.pushTitle(med.name),
          body: m.reminders.pushBody(formatDose(med, m), time),
          url: REMINDER_URL,
          medicationId: med.id,
          scheduledFor,
        });
      }
  ...
  return jobs.sort((a, b) => a.at.localeCompare(b.at));
}
```

Server side (`server/push.mjs`, **do not modify**): `setJobs` replaces all unsent
jobs with the uploaded list and remembers sent ones by `id`; `MAX_JOBS = 5000`
(over this the upload fails with 413 and *no* reminders update); jobs older than
`LATE_LIMIT_MS = 30 min` are skipped; the notification `tag` is the job `id`.
The phone re-uploads (`ReminderJobsSync`, 2 s debounce) whenever medications or
dose logs change, so marking a dose taken removes its unsent jobs.

Messages: `pt.ts` `reminders` block has
`pushBody: (dose, time) => \`${dose} — ${time}. Toque para abrir.\`` and zh has
`` `${dose} — ${time}。点一下打开。` ``. `zh.ts` is typed `Messages` (= `typeof pt`),
so both files need the new key.

Existing tests: `tests/reminder-jobs.test.ts` — four cases using `med` (id `m1`,
times 08:00 and 20:00), `NOW = new Date(2026, 9, 26, 7, 0)`, `buildReminderJobs(..., days)`.
They assert exact job lists and **will change** because follow-ups add jobs.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (74 passed at planning time) |
| Job tests | `npx vitest run tests/reminder-jobs.test.ts` | all pass |

## Scope

**In scope**:
- `src/lib/reminders/jobs.ts`
- `tests/reminder-jobs.test.ts`
- `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts` (one key in `reminders`)

**Out of scope**:
- `server/push.mjs`, `src/lib/push.ts`, `public/sw.js`, `ReminderWatcher.tsx` (in-app banner).
- More than one follow-up, escalating reminders, user-configurable gap.

## Git workflow

- Branch: `advisor/008-follow-up-reminder`
- One commit, short imperative message.
- Do NOT push or open a PR.

## Steps

### Step 1: Messages

`pt.ts` `reminders` block, next to `pushBody`:
```ts
pushFollowUp: (dose: string, time: string) => `Ainda não registou esta toma: ${dose} — ${time}. Toque para abrir.`,
```
`zh.ts`, same position:
```ts
pushFollowUp: (dose: string, time: string) => `这次药还没有记录：${dose} — ${time}。点一下打开。`,
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Adapt existing tests, add new failing ones

In `tests/reminder-jobs.test.ts` add a helper at the top and use it in the
three existing tests that assert job counts/lists (the first, third and fourth
`it`), wrapping `buildReminderJobs(...)` results so they only see main jobs;
assertions stay otherwise unchanged:

```ts
const FOLLOW_UP_SUFFIX = "|again";
const mains = (jobs: ReturnType<typeof buildReminderJobs>) => jobs.filter((j) => !j.id.endsWith(FOLLOW_UP_SUFFIX));
```

Add new tests:

```ts
it("cria um segundo lembrete 15 minutos depois, com texto próprio", () => {
  const jobs = buildReminderJobs([med], [], pt, NOW, 1);
  const follow = jobs.find((j) => j.id === "m1|2026-10-26T08:00|again")!;
  expect(follow).toBeDefined();
  expect(new Date(follow.at).getTime()).toBe(new Date(2026, 9, 26, 8, 15).getTime());
  expect(follow.body).toContain("Ainda não registou");
  expect(follow.scheduledFor).toBe("2026-10-26T08:00");
  expect(follow.medicationId).toBe("m1");
  expect(jobs).toHaveLength(4);
});

it("usa o texto chinês no segundo lembrete", () => {
  const follow = buildReminderJobs([med], [], zh, NOW, 1).find((j) => j.id.endsWith("|again"))!;
  expect(follow.body).toContain("还没有记录");
});

it("não cria segundo lembrete para tomas tomadas", () => {
  const logs: DoseLog[] = [{ id: "m1|2026-10-26T08:00", medicationId: "m1", scheduledFor: "2026-10-26T08:00", status: "taken", takenAt: "x" }];
  const ids = buildReminderJobs([med], logs, pt, NOW, 1).map((j) => j.id);
  expect(ids).not.toContain("m1|2026-10-26T08:00|again");
  expect(ids).toContain("m1|2026-10-26T20:00|again");
});

it("depois da hora da toma ainda envia o segundo lembrete que falta", () => {
  // 08:10: o lembrete das 08:00 já passou, o das 08:15 ainda não.
  const ids = buildReminderJobs([med], [], pt, new Date(2026, 9, 26, 8, 10), 1).map((j) => j.id);
  expect(ids).not.toContain("m1|2026-10-26T08:00");
  expect(ids).toContain("m1|2026-10-26T08:00|again");
});

it("numa toma adiada, o segundo lembrete conta a partir da nova hora", () => {
  const logs: DoseLog[] = [{ id: "m1|2026-10-26T20:00", medicationId: "m1", scheduledFor: "2026-10-26T20:00", status: "snoozed", snoozedUntil: "2026-10-26T20:15" }];
  const follow = buildReminderJobs([med], logs, pt, NOW, 1).find((j) => j.id === "m1|2026-10-26T20:00|2026-10-26T20:15|again")!;
  expect(new Date(follow.at).getTime()).toBe(new Date(2026, 9, 26, 20, 30).getTime());
});

it("só cria segundos lembretes nos primeiros dias, para não chegar ao limite de 5000", () => {
  const jobs = buildReminderJobs([med], [], pt, NOW, 30);
  const followDays = new Set(jobs.filter((j) => j.id.endsWith("|again")).map((j) => j.scheduledFor!.slice(0, 10)));
  expect(followDays.size).toBe(7);
  expect(jobs.filter((j) => !j.id.endsWith("|again"))).toHaveLength(60);
});
```

**Verify**: `npx vitest run tests/reminder-jobs.test.ts` → the new tests fail, the adapted old ones still pass.

### Step 3: Implement

In `src/lib/reminders/jobs.ts`:

1. Add constants next to `REMINDER_DAYS`:
```ts
/** Minutos até ao segundo lembrete, se a toma continuar por registar. */
export const FOLLOW_UP_MINUTES = 15;
/** Só os primeiros dias têm segundo lembrete (a lista tem um máximo de 5000 no NAS). */
export const FOLLOW_UP_DAYS = 7;
```
2. Replace the single `if (at < now - 60s) continue; jobs.push(...)` with: compute the main job as today but push it only when `at.getTime() >= now.getTime() - 60_000` (no `continue`). Then, when `i < FOLLOW_UP_DAYS`, compute `followAt = new Date(at.getTime() + FOLLOW_UP_MINUTES * 60_000)`; if `followAt.getTime() >= now.getTime() - 60_000`, push:
```ts
{
  id: `${when === scheduledFor ? id : `${id}|${when}`}|again`,
  at: followAt.toISOString(),
  title: m.reminders.pushTitle(med.name),
  body: m.reminders.pushFollowUp(formatDose(med, m), time),
  url: REMINDER_URL,
  medicationId: med.id,
  scheduledFor,
}
```
Keep the final sort and every other line as is.

**Verify**: `npx vitest run tests/reminder-jobs.test.ts` → all pass. `npm run typecheck` → exit 0. `npm test` → exit 0.

### Step 4: Check the cap arithmetic and push tests

`npm test` → `tests/push.test.ts` still passes unchanged (server untouched).
In your report, state the job count for 20 medicines × 4 times: 20·4·30 + 20·4·7 = 2960 (< 5000).

## Test plan

Seven cases in Step 2: offset and wording (pt and zh), taken dose has none,
late upload keeps the remaining follow-up, snoozed base time, 7-day limit with
exact counts. Pattern: the existing cases in the same file.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -n "FOLLOW_UP_MINUTES" src/lib/reminders/jobs.ts` shows definition and use
- [ ] `git diff --stat -- server public` shows no changes
- [ ] `plans/README.md` status row updated

## STOP conditions

- `buildReminderJobs` differs from the excerpt.
- The server's `isJob` rejects jobs with the new `id` form (read `server/push.mjs` `isJob` before step 3; ids are only checked as non-empty strings — if not, stop).
- Making the 7-day limit pass requires changing `REMINDER_DAYS`.

## Maintenance notes

- Real-world check the unit tests cannot do: on an installed iPhone with reminders on, leave a test dose untaken and confirm two notifications arrive 15 minutes apart, and that recording the dose before the second one cancels it (needs the phone online so the job list re-uploads).
- Reminders cancel only through the phone's upload; if the phone is offline when she takes the dose, the follow-up still fires. This is the same limitation as the first reminder today.
- If the owner wants a different gap or a second follow-up, change `FOLLOW_UP_MINUTES` here; the job-count budget (`MAX_JOBS` on the server) must be re-checked.
