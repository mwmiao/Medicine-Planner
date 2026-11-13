// Decisão pura de uma sincronização: dado o que há no telemóvel e no NAS, o que fazer?

import { mergeSyncData, type SyncData } from "./merge";

export type SyncPlan =
  /** Nada de novo no telemóvel: adotar a cópia do NAS. */
  | { kind: "pull"; data: SyncData }
  /** Gravar `data` no NAS (e no telemóvel). `force` ignora conflitos de revisão. */
  | { kind: "push"; data: SyncData; force: boolean };

export type SyncInputs = {
  local: SyncData;
  /** null = o NAS ainda não tem dados. */
  remote: SyncData | null;
  /** Importou/apagou tudo: a cópia do telemóvel é a verdade. */
  force: boolean;
  /** Alterações locais ainda não enviadas. */
  pendingChanges: number;
  /** Primeira sincronização deste telemóvel com o NAS. */
  firstTime: boolean;
};

export function planSync({ local, remote, force, pendingChanges, firstTime }: SyncInputs): SyncPlan {
  if (force) return { kind: "push", data: local, force: true };
  if (!remote) return { kind: "push", data: local, force: false };
  const localHasData = local.medications.length + local.doseLogs.length > 0;
  const dirty = pendingChanges > 0 || (firstTime && localHasData);
  if (!dirty) return { kind: "pull", data: remote };
  return { kind: "push", data: mergeSyncData(local, remote), force: false };
}
