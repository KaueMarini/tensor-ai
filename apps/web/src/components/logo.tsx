export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Tensor AI">
      <defs>
        <linearGradient id="tensor-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b7cf8" />
          <stop offset="1" stopColor="#5b4ee6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#tensor-grad)" />
      <g transform="translate(7 7) scale(0.75)" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </g>
    </svg>
  );
}

export function Marca() {
  return (
    <>
      Tensor <span className="text-[#8b7cf8]">AI</span>
    </>
  );
}
