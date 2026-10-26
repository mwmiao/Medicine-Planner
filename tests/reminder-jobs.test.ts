import { describe, expect, it } from "vitest";
import { pt } from "@/lib/i18n/pt";
import { zh } from "@/lib/i18n/zh";
import { buildReminderJobs, REMINDER_URL } from "@/lib/reminders/jobs";
import type { DoseLog, Medication } from "@/lib/types";
import { input } from "./helpers";

const med: Medication = {
  ...input({ name: "Ben-u-ron", dosage: "500 mg", times: ["08:00", "20:00"] }),
  id: "m1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const NOW = new Date(2026, 9, 26, 7, 0);

describe("lista de lembretes para o NAS", () => {
  it("cria lembretes futuros com nome, dose e hora, a abrir o ecrã Hoje", () => {
    const jobs = buildReminderJobs([med], [], pt, NOW, 2);
    expect(jobs.map((j) => j.scheduledFor)).toEqual(["2026-10-26T08:00", "2026-10-26T20:00", "2026-10-27T08:00", "2026-10-27T20:00"]);
    expect(jobs[0]).toMatchObject({ title: "💊 Ben-u-ron", url: REMINDER_URL, medicationId: "m1", id: "m1|2026-10-26T08:00" });
    expect(jobs[0].body).toContain("1 comprimido · 500 mg");
    expect(jobs[0].body).toContain("08:00");
    expect(new Date(jobs[0].at).getTime()).toBe(new Date(2026, 9, 26, 8, 0).getTime());
  });

  it("usa o idioma escolhido, sem traduzir o nome do medicamento", () => {
    const [job] = buildReminderJobs([med], [], zh, NOW, 1);
    expect(job.title).toBe("💊 Ben-u-ron");
    expect(job.body).toContain("片");
  });

  it("não lembra tomas já tomadas e passa as adiadas para a nova hora", () => {
    const logs: DoseLog[] = [
      { id: "m1|2026-10-26T08:00", medicationId: "m1", scheduledFor: "2026-10-26T08:00", status: "taken", takenAt: "x" },
      { id: "m1|2026-10-26T20:00", medicationId: "m1", scheduledFor: "2026-10-26T20:00", status: "snoozed", snoozedUntil: "2026-10-26T20:15" },
    ];
    const jobs = buildReminderJobs([med], logs, pt, NOW, 1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("m1|2026-10-26T20:00|2026-10-26T20:15");
    expect(new Date(jobs[0].at).getTime()).toBe(new Date(2026, 9, 26, 20, 15).getTime());
  });

  it("não inclui tomas que já passaram", () => {
    const jobs = buildReminderJobs([med], [], pt, new Date(2026, 9, 26, 12, 0), 1);
    expect(jobs.map((j) => j.scheduledFor)).toEqual(["2026-10-26T20:00"]);
  });
});
