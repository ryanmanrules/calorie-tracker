// Wrapped localStorage so a parse error or private-mode block never crashes the app
export const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};

export const lsSet = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// ISO date string used as the key for per-day storage
export const toDateKey = (d) => d.toISOString().slice(0, 10);
export const todayKey  = () => toDateKey(new Date());

// Each day gets its own key so switching dates just swaps the array
export const loadDay = (key)        => lsGet(`ct_day_${key}`, []);
export const saveDay = (key, items) => lsSet(`ct_day_${key}`, items);
