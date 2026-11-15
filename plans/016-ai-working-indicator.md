# Plan 016: A clear "Claude AI is working" indicator with a moving bar and a timer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4319530..HEAD -- src/components/BoxScanner.tsx src/components/MedicalInfoSection.tsx src/components/LeafletTranslator.tsx src/components/ui.tsx src/app/globals.css src/lib/i18n/pt.ts src/lib/i18n/zh.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" notes against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plans 010, 011, 014, 015 are on `main`)
- **Category**: direction (usability)
- **Planned at**: commit `4319530`, 2026-11-15

## Why this matters

The three Claude-powered steps take 5–60 seconds and the elderly user cannot
tell the app is working: (1) reading the box photo shows a fixed sliver of a
bar (the real progress is unknowable on the AI path, so `progress` stays 0 and
the bar is stuck at 3 %); (2) looking up the Chinese instructions after saving a
medicine shows only a line of text; (3) translating a leaflet shows only a line
of text. After this plan all three show one shared indicator: "Claude AI 正在处理…",
a moving (indeterminate) bar, a running "已等待 N 秒" timer, and a calm
"通常需要…请不要离开这一页" hint. No fake percentages.

## Current state

- `src/components/BoxScanner.tsx` (reading phase, ~lines 402–411):
```tsx
{phase === "reading" ? (
  <>
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <p className="text-xl font-semibold">{stage === "barcode" ? m.scan.readingBarcode : stage === "ai" ? m.scan.readingAi : m.scan.reading(Math.round(progress * 100))}</p>
      <div className="h-4 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }} />
      </div>
      {slow ? <p className="text-lg">{m.scan.slow}</p> : null}
    </div>
    {manualButton("secondary")}
  </>
) : null}
```
`stage` is `"barcode" | "ai" | "text"`; `m.scan.readingAi` (zh "正在识别药盒…"). The on-phone OCR path (`stage` "text") keeps its real percentage bar.
- `src/components/MedicalInfoSection.tsx` (~line 203): `{!info && auto === "searching" ? (<div className="mb-3"><Notice>{m.info.autoSearching}</Notice></div>) : null}`; `m.info.autoSearching` zh "正在查找中文说明…".
- `src/components/LeafletTranslator.tsx` (~line 83): `{busy ? <Notice>{m.info.translating}</Notice> : null}`; `m.info.translating` zh "正在翻译…大约需要一分钟。".
- `src/components/ui.tsx` exports `Button`, `Card`, `Notice`, `Loading`, `ColorDot`… (client components; pattern: small function components with Tailwind classes). `src/app/globals.css` holds Tailwind v4 `@theme` tokens (colors `primary`, `primary-soft`, …) and a few helpers (`.pt-safe`, `.px-safe`).
- i18n: `pt.ts` defines `Messages`; `zh.ts` is typed `Messages` — every new key goes in BOTH.
- Conventions: Portuguese code comments, 2-space indent, double quotes; text ≥ `text-lg`; respect `prefers-reduced-motion`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| All tests | `npm test` | exit 0 (143 passed at planning time) |

## Scope

**In scope**: `src/components/ui.tsx` (add `AiWorking`), `src/app/globals.css` (animation), `src/components/BoxScanner.tsx`, `src/components/MedicalInfoSection.tsx`, `src/components/LeafletTranslator.tsx`, `src/lib/i18n/pt.ts`, `src/lib/i18n/zh.ts`.

**Out of scope**: server code, the on-phone OCR progress bar, any change to timing/behaviour of the AI calls, `Loading`/`Notice` components, tests that need a DOM (none exist).

## Git workflow

- Branch: `advisor/016-ai-working`
- One commit; short imperative message; end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do NOT push or open a PR.

## Steps

### Step 1: Messages (BOTH files)

Add a new top-level block `ai` to `pt.ts` and `zh.ts` (same position in both, e.g. after `common`):

| key | pt | zh |
|---|---|---|
| `ai.badge` | `Claude IA a trabalhar` | `Claude AI 正在处理` |
| `ai.elapsed` | `(n: number) => \`À espera há ${n} s\`` | `(n: number) => \`已等待 ${n} 秒\`` |
| `ai.stay` | `Não saia desta página até terminar.` | `请不要离开这一页，等它完成。` |
| `ai.hintBox` | `Costuma demorar 5 a 20 segundos.` | `通常需要 5 到 20 秒。` |
| `ai.hintInstructions` | `Está a procurar e a traduzir as instruções. Costuma demorar 10 a 30 segundos.` | `正在查找并翻译说明，通常需要 10 到 30 秒。` |
| `ai.hintLeaflet` | `Está a ler e a traduzir o folheto. Pode demorar cerca de um minuto.` | `正在阅读并翻译说明书，可能需要大约一分钟。` |

**Verify**: `npm run typecheck` → exit 0.

### Step 2: The indicator component and the animation

In `src/app/globals.css` append:

```css
/* Barra indeterminada (IA a trabalhar): um bloco que corre da esquerda para a direita. */
@keyframes ai-slide {
  0% { left: -40%; }
  100% { left: 100%; }
}
.ai-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 40%;
  animation: ai-slide 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .ai-bar {
    animation: none;
    left: 30%;
  }
}
```

In `src/components/ui.tsx` add and export (add `useEffect`, `useState` to the React imports; `useMessages` from `@/lib/i18n`):

```tsx
/** "Claude IA a trabalhar": barra em movimento, contador de segundos e uma frase calma. Sem percentagens inventadas. */
export function AiWorking({ title, hint }: { title: string; hint?: string }) {
  const { m } = useMessages();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-2xl bg-primary-soft p-4 text-blue-950">
      <p className="flex items-center gap-2 text-lg font-bold">
        <span aria-hidden className="text-2xl">✨</span>
        {m.ai.badge}
      </p>
      <p className="text-xl font-semibold">{title}</p>
      <div className="relative h-4 overflow-hidden rounded-full bg-white">
        <div className="ai-bar rounded-full bg-primary" />
      </div>
      <p className="text-lg tabular-nums">{m.ai.elapsed(seconds)}</p>
      {hint ? <p className="text-lg">{hint}</p> : null}
      <p className="text-lg font-semibold">{m.ai.stay}</p>
    </div>
  );
}
```
(If `ui.tsx` is not already a client component or does not import `useMessages`, keep its existing `"use client"` and add the import; do not restructure the file.)

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Use it in the three places

1. `BoxScanner.tsx` reading phase: when `stage === "ai"` render `<AiWorking title={m.scan.readingAi} hint={m.ai.hintBox} />` instead of the existing status block (keep the existing block for `"barcode"` and `"text"` unchanged), and keep the `slow` line and `{manualButton("secondary")}` below it. Import `AiWorking` from `./ui` (extend the existing import).
2. `MedicalInfoSection.tsx`: replace `<Notice>{m.info.autoSearching}</Notice>` (inside its `mb-3` wrapper) with `<AiWorking title={m.info.autoSearching} hint={m.ai.hintInstructions} />`. Keep the surrounding conditions. Import from `./ui` (extend the existing import).
3. `LeafletTranslator.tsx`: replace `{busy ? <Notice>{m.info.translating}</Notice> : null}` with `{busy ? <AiWorking title={m.info.translating} hint={m.ai.hintLeaflet} /> : null}`. Extend the `./ui` import; keep `Notice` imported only if it is still used there (it is, for the problem notices).

**Verify**: `npm run typecheck` → exit 0; `npm test` → exit 0 (same count as baseline: no new tests); `grep -rn "AiWorking" src` → definition plus exactly three uses.

### Step 4: Manual check (say which parts you ran)

With `npm run dev`, a temporary look is possible only by rendering the component: if you can, open any page and verify no layout error; otherwise state that the visual was not checked. The owner will see it on the phone: bar sliding, timer counting, "Claude AI 正在处理" badge during box reading, instruction lookup and leaflet translation.

## Test plan

No automated test: the repo has no DOM test tooling and the component is presentational. Rely on typecheck, the grep check, and the owner's visual check.

## Done criteria

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -rn "AiWorking" src` shows 1 definition and 3 uses
- [ ] `grep -n "ai-bar" src/app/globals.css` shows the animation and the reduced-motion override
- [ ] Only in-scope files changed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The three code excerpts don't match the live code.
- `ui.tsx` cannot use hooks or `useMessages` without restructuring.
- A step's verification fails twice.

## Maintenance notes

- The bar is intentionally indeterminate; do not replace it with a fake percentage. If the server later streams real progress, pass a `progress` prop and switch the bar to determinate.
- Any new AI call (new `/api/ai/*` route used from the UI) should show `AiWorking` while it waits.
