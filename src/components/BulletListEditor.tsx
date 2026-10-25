"use client";

import { useMessages } from "@/lib/i18n";
import { Button, TextInput } from "./ui";

export function BulletListEditor({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void }) {
  const { m } = useMessages();
  const lines = value.length ? value : [""];
  const update = (i: number, text: string) => onChange(lines.map((l, j) => (j === i ? text : l)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-lg font-bold">{label}</legend>
      {lines.map((line, i) => (
        <div key={`${id}-${i}`} className="flex gap-2">
          <TextInput
            aria-label={`${label} ${i + 1}`}
            value={line}
            placeholder={m.info.linePlaceholder}
            onChange={(e) => update(i, e.target.value)}
          />
          {lines.length > 1 ? (
            <button
              type="button"
              aria-label={m.common.remove}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              className="min-h-14 min-w-14 rounded-xl border-2 border-line text-2xl text-danger"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <Button variant="ghost" className="self-start px-0" onClick={() => onChange([...lines, ""])}>
        + {m.info.addLine}
      </Button>
    </fieldset>
  );
}
