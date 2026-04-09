interface LeafIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export function LeafIcon({ size = 64, className = "", animated = false }: LeafIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      width={size}
      height={size}
      fill="none"
      className={`${className} ${animated ? "animate-pulse" : ""}`}
    >
      <path
        fill="currentColor"
        d="M 30 50 L 150 50 Q 145 75 80 90 Q 145 105 150 130 L 30 130 Q 100 90 30 50 Z"
      />
    </svg>
  );
}

export function SmallLeafIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      width={size}
      height={size}
      fill="none"
      className={className}
    >
      <path
        fill="currentColor"
        d="M 30 50 L 150 50 Q 145 75 80 90 Q 145 105 150 130 L 30 130 Q 100 90 30 50 Z"
      />
    </svg>
  );
}
