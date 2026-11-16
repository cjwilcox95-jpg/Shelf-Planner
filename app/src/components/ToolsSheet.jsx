import { ChevronRight, Columns3, GitCompare, Printer, Redo2, Ruler, SlidersHorizontal, TrendingUp } from 'lucide-react'
import { Sheet } from './Panels.jsx'

// Scanning has its own button in the bottom bar, so it is not repeated here.
const TOOLS = [
  { id: 'measure', icon: Ruler, title: 'Measure as you go', text: 'Scan a product, type its size from your tape.' },
  { id: 'print', icon: Printer, title: 'Print or save as PDF', text: 'A drawing to scale and a check-off list.' },
  { id: 'sales', icon: TrendingUp, title: 'Sales help', text: 'What may run out, what to cut first.' },
  { id: 'compare', icon: GitCompare, title: 'Compare with another plan', text: 'What to add, take out, move or change.' },
  { id: 'shelf', icon: Columns3, title: 'Shelf sizes', text: 'Width, depth, room above; add or remove a shelf.' },
  { id: 'guesses', icon: SlidersHorizontal, title: 'Default size guesses', text: 'The typical sizes that guesses start from.' },
]

/** Everything that is not used every minute, as one plain list. */
export function ToolsSheet({ tools = TOOLS, inAisle, onPick, onClose, canRedo, onRedo }) {
  return (
    <Sheet title="Tools" onClose={onClose}>
      <ul className="tool-list">
        {tools.filter((t) => !(inAisle && t.id === 'compare')).map(({ id, icon: Icon, title, text }) => (
          <li key={id}>
            <button className="tool" onClick={() => onPick(id)} data-testid={`tool-${id}`}>
              <span className="tool-icon"><Icon size={22} aria-hidden="true" /></span>
              <span className="row-main">
                <span className="tool-title">{title}</span>
                <span className="tool-text">{text}</span>
              </span>
              <ChevronRight size={20} className="row-go" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {inAisle && <p className="muted small">Compare works on a single section: open one from Plans.</p>}
      <button className="btn wide" onClick={onRedo} disabled={!canRedo} data-testid="redo"><Redo2 size={20} aria-hidden="true" />Redo last change</button>
    </Sheet>
  )
}
