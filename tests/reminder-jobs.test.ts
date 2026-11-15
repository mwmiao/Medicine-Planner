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
const FOLLOW_UP_SUFFIX = "|again";
const mains = (jobs: ReturnType<typeof buildReminderJobs>) => jobs.filter((j) => !j.id.endsWith(FOLLOW_UP_SUFFIX));

describe("lista de lembretes para o NAS", () => {
  it("cria lembretes futuros com nome, dose e hora, a abrir o ecrã Hoje", () => {
    const jobs = mains(buildReminderJobs([med], [], pt, NOW, 2));
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
    const jobs = mains(buildReminderJobs([med], logs, pt, NOW, 1));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("m1|2026-10-26T20:00|2026-10-26T20:15");
    expect(new Date(jobs[0].at).getTime()).toBe(new Date(2026, 9, 26, 20, 15).getTime());
  });

  it("não inclui tomas que já passaram", () => {
    const jobs = mains(buildReminderJobs([med], [], pt, new Date(2026, 9, 26, 12, 0), 1));
    expect(jobs.map((j) => j.scheduledFor)).toEqual(["2026-10-26T20:00"]);
  });

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
});
