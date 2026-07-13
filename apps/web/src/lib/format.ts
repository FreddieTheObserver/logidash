export type DeadlineState = 'on-track' | 'at-risk' | 'breached';

export function fromNow(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  if (m < 1) return 'now';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  let s: string;
  if (h < 1) s = `${m}m`;
  else if (h < 24) s = mm ? `${h}h ${mm}m` : `${h}h`;
  else s = `${Math.floor(h / 24)}d`;
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

export function deadlineState(
  iso: string,
  now: number = Date.now(),
): DeadlineState {
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return 'breached';
  if (diff < 90 * 60_000) return 'at-risk';
  return 'on-track';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
