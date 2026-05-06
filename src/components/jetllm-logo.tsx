export function JetLLMLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 100"
      className={className}
    >
      <defs>
        <linearGradient id="jetllm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--accent-color))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--accent-color))" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <g fill="url(#jetllm-g)">
        <path d="M12 50 L53 41 L92 50 L53 59 Z" />
        <path d="M48 42 L29 17 L44 15 L72 43 Z" />
        <path d="M48 58 L29 83 L44 85 L72 57 Z" opacity="0.86" />
        <path d="M24 48 L10 35 L24 37 L39 45 Z" opacity="0.9" />
        <path d="M24 52 L10 65 L24 63 L39 55 Z" opacity="0.8" />
      </g>
      <path d="M66 48 L83 50 L66 52 L57 50 Z" fill="#020402" opacity="0.35" />
      <path d="M15 50 H2" stroke="hsl(var(--accent-color))" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <text
        x="106"
        y="65"
        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
        fontSize="44"
        fontWeight="800"
        letterSpacing="-1"
        fill="currentColor"
      >
        Jet
        <tspan fill="hsl(var(--accent-color))">LLM</tspan>
      </text>
    </svg>
  )
}
