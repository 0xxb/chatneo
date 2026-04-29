const LINES = 8;

export default function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      {Array.from({ length: LINES }, (_, i) => (
        <line
          key={i}
          x1="12" y1="2" x2="12" y2="6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 12 12)`}
        >
          <animate
            attributeName="opacity"
            values="1;0.2;0.2;0.2;0.2;0.2;0.2;1"
            dur="0.8s"
            begin={`${i * 0.1}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}
    </svg>
  );
}
