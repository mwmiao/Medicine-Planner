// Armazenamento simples chave/valor no telemóvel (localStorage). Nunca lança erro:
// em modo privado ou sem armazenamento, lê `null` e ignora as gravações.

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserKv: KeyValue = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // armazenamento indisponível
    }
  },
  remove(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      // armazenamento indisponível
    }
  },
};
