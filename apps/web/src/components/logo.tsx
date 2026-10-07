export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand-700" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="white" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="white" strokeWidth="2" />
      <path d="M16 16 L23 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="white" />
    </svg>
  );
}
