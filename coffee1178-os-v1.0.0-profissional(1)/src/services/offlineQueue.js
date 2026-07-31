const KEY = "coffee1178.pendingActions";
const SNAPSHOT = "coffee1178.snapshot";

export function queueAction(action) {
  const list = JSON.parse(localStorage.getItem(KEY) || "[]");
  list.push({ ...action, id: crypto.randomUUID(), queuedAt: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function getQueue() {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}

export function removeQueued(id) {
  localStorage.setItem(KEY, JSON.stringify(getQueue().filter(x => x.id !== id)));
}

export function saveSnapshot(data) {
  localStorage.setItem(SNAPSHOT, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
}

export function getSnapshot() {
  return JSON.parse(localStorage.getItem(SNAPSHOT) || "null");
}
