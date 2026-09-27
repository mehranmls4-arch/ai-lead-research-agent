export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#2349C6" />
        <path d="M7 16V8l5 6V8M17 8v8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        NovaFlow <span className="font-normal text-muted">AI</span>
      </span>
    </span>
  );
}
