import { useApp } from '../store';

/** The shared "use my kitchen" switch that biases every meal decider. */
export default function PantryToggle() {
  const { usePantry, setUsePantry, pantry } = useApp();
  const count = pantry.length;

  return (
    <label className="toggle" style={{ marginBottom: 16 }}>
      <span className="t-label">
        <span className="t-title">🧺 Cook from my kitchen</span>
        <span className="t-sub">
          {count
            ? `Prefer recipes using your ${count} pantry item${count > 1 ? 's' : ''}`
            : 'Add pantry items in the Kitchen tab to use this'}
        </span>
      </span>
      <span className="switch">
        <input
          type="checkbox"
          checked={usePantry}
          onChange={(e) => setUsePantry(e.target.checked)}
          disabled={count === 0}
        />
        <span className="track">
          <span className="thumb" />
        </span>
      </span>
    </label>
  );
}
