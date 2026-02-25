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
      <path d="M85 20 L70 80 L50 60 L20 70 Z" fill="url(#jetllm-g)" />
      <path d="M85 20 L50 60 L50 85 Z" fill="hsl(var(--accent-color))" opacity="0.4" />
      <text
        x="100"
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
