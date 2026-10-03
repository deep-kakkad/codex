/** The mark: a check drawn over a highlighter stroke, the same marker used for evidence in reviews. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M5.6 15.2c6.4-1.9 14.6-3 21.2-3.2l.6 7.4c-6.8.2-14.8 1.4-21 3.2z" fill="#FFD234" opacity="0.95" />
      <path
        d="M9 16.5l4.5 4.5L23 11.5"
        stroke="#08332d"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
