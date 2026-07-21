// Inline flame badge shown next to a card title during an active streak.
// Gradient id is shared across instances; the defs are identical so
// duplicate ids render correctly.
export default function StreakBadge({ count }: { count: number }) {
  return (
    <div className="streak-badge-inline">
      <svg className="streak-flame-mini" viewBox="6 0 12 16" fill="none">
        <path
          d="M12 2C12 2 8 6 8 10C8 12 9 14 12 14C15 14 16 12 16 10C16 6 12 2 12 2Z"
          fill="url(#streakFlameGrad)"
        />
        <path
          d="M12 8C12 8 10 10 10 12C10 13 10.5 14 12 14C13.5 14 14 13 14 12C14 10 12 8 12 8Z"
          fill="#FEF3C7"
        />
        <defs>
          <linearGradient
            id="streakFlameGrad"
            x1="12"
            y1="2"
            x2="12"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FBBF24" />
            <stop offset="1" stopColor="#F97316" />
          </linearGradient>
        </defs>
      </svg>
      <span className="streak-count-mini">{count}</span>
    </div>
  );
}
