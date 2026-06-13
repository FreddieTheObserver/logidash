// Deterministic initials avatar. The palette is a hashing palette (not theme
// colors), so raw hex here is an intentional, documented exception.
const AV_COLORS = [
  '#2563eb',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0d9488',
  '#ca8a04',
];

export function Avatar({
  initials,
  name = '',
  id = '',
  size = 32,
}: {
  initials: string;
  name?: string;
  id?: string;
  size?: number;
}) {
  const key = id || name || '';
  const idx =
    key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: AV_COLORS[idx],
        fontSize: size * 0.4,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
