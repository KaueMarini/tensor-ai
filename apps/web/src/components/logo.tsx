export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="iPORT Solutions">
      <rect width="32" height="32" rx="8" fill="white" />
      <path d="M23.57 5.79A11.4 11.4 0 1 0 23.57 26.21A10.45 10.45 0 1 1 23.57 5.79Z" fill="#1d5aa6" />
      <path d="M24.37 9.25A7.6 7.6 0 1 0 24.37 22.75A6.84 6.84 0 1 1 24.37 9.25Z" fill="#22a7c8" />
      <path d="M25.04 12.01A4.37 4.37 0 1 0 25.04 19.99A3.99 3.99 0 0 1 25.04 12.01Z" fill="#1d5aa6" />
    </svg>
  );
}
