# Plan 005: The app starts in Chinese when the phone's language is Chinese

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 34ffff1..HEAD -- src/lib/settings.ts src/lib/boot.ts src/app/layout.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (usability)
- **Planned at**: commit `34ffff1`, 2026-11-15

## Why this matters

The app is for an elderly Chinese-speaking user in Portugal. Her language
choice (PT / 中文) is stored only in `localStorage`, and the default when
nothing is stored is Portuguese. On iOS the Safari tab and the home-screen app
have **separate** storage, and iOS can also clear it, so a new install, a new
phone, or a storage purge shows her an all-Portuguese app until someone taps
中文. After this plan, when nothing is stored the app picks the language from
the phone's first preferred language (Chinese → 中文, anything else →
Português). An explicit choice always wins.

## Current state

`src/lib/settings.ts` (client module, preferences in `localStorage` via `browserKv`):

```ts
export function getLocale(): Locale {
  return read(KEYS.locale) === "zh" ? "zh" : "pt";      // line 29
}
...
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => "pt");   // line 48
}
```

`setLocale(locale)` writes `"zh"` or `"pt"` under key `mp.locale`, so a stored
value is always one of those two strings. The server-snapshot `() => "pt"`
must stay (static export pre-renders in Portuguese).

`src/lib/boot.ts` — an inline script run before first paint to avoid a language
flash; it only sets `<html lang>` and the text-size attribute:

```ts
export const PREFERENCES_BOOT_SCRIPT = `try{var l=localStorage.getItem("mp.locale");document.documentElement.lang=l==="zh"?"zh-CN":"pt-PT";var s=localStorage.getItem("mp.textSize");if(s==="large"||s==="xlarge")document.documentElement.dataset.textSize=s;}catch(e){}`;
```

`src/lib/kv.ts` — `browserKv.get` never throws; returns `null` when storage is
unavailable.

Conventions: Portuguese comments in code (match them), 2-space indent, double
quotes, tests in `tests/*.test.ts` with Vitest (`environment: "node"`, alias
`@` → `src`). Exemplar of a small pure-function test file: `tests/schedule.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (74 tests passed at planning time) |
| New tests only | `npx vitest run tests/settings.test.ts tests/boot.test.ts` | all pass |

## Scope

**In scope**:
- `src/lib/settings.ts`
- `src/lib/boot.ts`
- `tests/settings.test.ts` (create)
- `tests/boot.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/app/layout.tsx` (`<html lang="pt-PT">` stays; the boot script corrects it at runtime).
- Text size default, sync of preferences to the NAS, the language switcher UI.
- Any write of the detected language to storage (detection must stay derived, not persisted, so a phone-language change is followed until the user chooses explicitly).

## Git workflow

- Branch: `advisor/005-default-language`
- One commit, short imperative message (history style: "Keep push subscription on 403 and repair a missing one").
- Do NOT push or open a PR.

## Steps

### Step 1: Write the failing tests

Create `tests/settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localeFromLanguages } from "@/lib/settings";

describe("idioma por omissão a partir do telemóvel", () => {
  it("escolhe chinês quando o primeiro idioma é chinês", () => {
    expect(localeFromLanguages(["zh-Hans-PT", "pt-PT"])).toBe("zh");
    expect(localeFromLanguages(["zh-CN"])).toBe("zh");
    expect(localeFromLanguages(["ZH"])).toBe("zh");
  });
  it("escolhe português nos outros casos", () => {
    expect(localeFromLanguages(["pt-PT", "zh-CN"])).toBe("pt");
    expect(localeFromLanguages(["en-US"])).toBe("pt");
    expect(localeFromLanguages([])).toBe("pt");
    expect(localeFromLanguages([""])).toBe("pt");
  });
});
```

Create `tests/boot.test.ts`, which runs the real boot script string in a
`node:vm` sandbox with fake `localStorage`, `navigator` and `document`:

```ts
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/boot";

function boot(stored: Record<string, string>, languages: string[]) {
  const documentElement = { lang: "pt-PT", dataset: {} as Record<string, string> };
  runInNewContext(PREFERENCES_BOOT_SCRIPT, {
    localStorage: { getItem: (k: string) => stored[k] ?? null },
    navigator: { languages, language: languages[0] },
    document: { documentElement },
  });
  return documentElement;
}

describe("script de arranque", () => {
  it("sem escolha guardada segue o idioma do telemóvel", () => {
    expect(boot({}, ["zh-Hans-PT"]).lang).toBe("zh-CN");
    expect(boot({}, ["pt-PT"]).lang).toBe("pt-PT");
  });
  it("a escolha guardada tem prioridade", () => {
    expect(boot({ "mp.locale": "pt" }, ["zh-CN"]).lang).toBe("pt-PT");
    expect(boot({ "mp.locale": "zh" }, ["pt-PT"]).lang).toBe("zh-CN");
  });
  it("continua a aplicar o tamanho do texto", () => {
    expect(boot({ "mp.textSize": "large" }, ["pt-PT"]).dataset.textSize).toBe("large");
  });
});
```

**Verify**: `npx vitest run tests/settings.test.ts tests/boot.test.ts` → fails
(`localeFromLanguages` not exported; boot test for zh fails). That is expected.

### Step 2: Implement `localeFromLanguages` and use it in `getLocale`

In `src/lib/settings.ts`, add (above `getLocale`):

```ts
/** Sem escolha guardada: chinês se o primeiro idioma do telemóvel for chinês, senão português. */
export function localeFromLanguages(languages: readonly string[]): Locale {
  const first = languages.find((l) => l);
  return first && first.toLowerCase().startsWith("zh") ? "zh" : "pt";
}
```

Replace the body of `getLocale`:

```ts
export function getLocale(): Locale {
  const stored = read(KEYS.locale);
  if (stored === "zh" || stored === "pt") return stored;
  if (typeof navigator === "undefined") return "pt";
  return localeFromLanguages(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
```

Leave `useLocale` and its `() => "pt"` server snapshot unchanged.

**Verify**: `npx vitest run tests/settings.test.ts` → passes.

### Step 3: Mirror the logic in the boot script

Replace `PREFERENCES_BOOT_SCRIPT` in `src/lib/boot.ts` with a script that, with
no stored locale, uses the first of `navigator.languages` (fallback
`navigator.language`) and tests `/^zh/i`. Keep it a single-line template
string, keep the `try/catch`, keep the text-size part, and keep the existing
Portuguese doc-comment. Target shape:

```ts
export const PREFERENCES_BOOT_SCRIPT = `try{var l=null;try{l=localStorage.getItem("mp.locale")}catch(e){}if(l!=="zh"&&l!=="pt"){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"";l=/^zh/i.test(n)?"zh":"pt";}document.documentElement.lang=l==="zh"?"zh-CN":"pt-PT";var s=localStorage.getItem("mp.textSize");if(s==="large"||s==="xlarge")document.documentElement.dataset.textSize=s;}catch(e){}`;
```

**Verify**: `npx vitest run tests/boot.test.ts` → all 3 pass.

### Step 4: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → exit 0, previous 74 tests plus the 5 new ones pass.

Manual check (state in your report whether you ran it): `npm run dev`, open the
app in a browser whose preferred language is Chinese with `localStorage`
cleared → UI is Chinese; tap "PT" → Portuguese and stays after reload; clear
storage with a Portuguese browser → Portuguese.

## Test plan

Covered by Step 1: pure detection function (zh first / pt first / empty /
unrelated language) and the real boot script in a sandbox (detection, stored
choice wins, text-size still applied). Pattern: `tests/schedule.test.ts`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `tests/settings.test.ts` and `tests/boot.test.ts` exist and pass
- [ ] `grep -n "localeFromLanguages" src/lib/settings.ts` shows the export and its use in `getLocale`
- [ ] `git status` shows only the four in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- `getLocale`, `useLocale` or `PREFERENCES_BOOT_SCRIPT` differ from the excerpts above.
- Importing `@/lib/settings` in a Vitest node test throws (e.g. a top-level `window` access). Report instead of mocking globals broadly.
- You feel the need to persist the detected language or touch `layout.tsx`.

## Maintenance notes

- `getLocale` and the boot script duplicate the detection rule (one TypeScript, one inline string). Change both together; `tests/boot.test.ts` guards the string.
- Hydration: first client render uses the same server snapshot `"pt"` then switches; this is the existing behaviour for stored `zh` and is unchanged.
- Deferred on purpose: default text size (a product choice — ask the owner), syncing preferences to the NAS.
