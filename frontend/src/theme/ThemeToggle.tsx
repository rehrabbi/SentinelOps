import { useTheme, type ThemeChoice } from './theme'
import './ThemeToggle.css'

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

export function ThemeToggle() {
  const { choice, setChoice } = useTheme()
  return (
    <div role="group" aria-label="Colour theme" className="theme-toggle">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          onClick={() => setChoice(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
