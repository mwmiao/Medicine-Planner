// Web Push — esboço intencionalmente não implementado.
//
// O Safari no iOS (16.4+) só aceita Web Push para apps adicionadas ao ecrã
// principal, e exige um servidor com chaves VAPID que guarde as subscrições e
// envie as mensagens à hora certa. Isso contraria o objetivo desta app (sem
// servidor, sem conta, dados só no telemóvel) e a entrega no iOS não é
// garantida. Por isso os lembretes são feitos com:
//   1. avisos dentro da app enquanto está aberta (ReminderWatcher);
//   2. alarmes / automações do iPhone (instruções nas Definições).
//
// Para ativar no futuro: gerar chaves VAPID, criar um backend que guarde
// `PushSubscription`s e agende envios, e tratar o evento "push" em public/sw.js.

export const WEB_PUSH_ENABLED = false;

export async function subscribeToPush(): Promise<PushSubscription | null> {
  return null;
}
