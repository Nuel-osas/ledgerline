/**
 * The Ledgerline mark: three proven periods stepping up, crossing the line that
 * unlocks credit. Snapped to a 1.5-unit lattice on a 24-unit grid so every edge
 * lands on a whole device pixel at 16, 32, 64, 128, 256 and 512 px.
 */
export default function Mark({ size = 26, className, title = 'Ledgerline' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size}
         role="img" aria-label={title} focusable="false">
      <title>{title}</title>
      <g fill="currentColor">
        <rect x="3" y="15" width="4.5" height="6" />
        <rect x="9.75" y="10.5" width="4.5" height="10.5" />
        <rect x="16.5" y="6" width="4.5" height="15" />
        <rect x="3" y="3" width="18" height="1.5" />
      </g>
    </svg>
  );
}
