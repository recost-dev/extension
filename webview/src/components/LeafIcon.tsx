interface LeafIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export function LeafIcon({ size = 64, className = "", animated = false }: LeafIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 400"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${animated ? "animate-pulse" : ""}`}
    >
      <path d="M55 85 L240 85 L240 140 L105 140 L105 315 L55 315 Z" stroke="currentColor" strokeWidth={14} />
      <path d="M345 315 L160 315 L160 260 L295 260 L295 85 L345 85 Z" fill="currentColor" stroke="currentColor" strokeWidth={14} />
    </svg>
  );
}

export function SmallLeafIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 400"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M55 85 L240 85 L240 140 L105 140 L105 315 L55 315 Z" stroke="currentColor" strokeWidth={14} />
      <path d="M345 315 L160 315 L160 260 L295 260 L295 85 L345 85 Z" fill="currentColor" stroke="currentColor" strokeWidth={14} />
    </svg>
  );
}
