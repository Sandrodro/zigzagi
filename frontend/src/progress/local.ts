export interface LocalProgress {
  fills: Record<string, string>;
  timerSeconds: number;
  completedAt: string | null;
}

const CLIENT_ID_KEY = "zigzagi:client_id";
const progressKey = (date: string) => `zigzagi:progress:${date}`;

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    // ponytail: crypto.randomUUID in secure contexts (localhost counts); fallback for the rest.
    id = crypto?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function loadProgress(date: string): LocalProgress | null {
  const raw = localStorage.getItem(progressKey(date));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalProgress;
  } catch {
    return null;
  }
}

export function saveProgress(date: string, state: LocalProgress): void {
  localStorage.setItem(progressKey(date), JSON.stringify(state));
}
