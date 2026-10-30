import { GitCompare, Printer, Redo2, Ruler, ScanBarcode, SlidersHorizontal, TrendingUp, Columns3 } from 'lucide-react'
import { Sheet } from './Panels.jsx'

const TOOLS = [
  { id: 'measure', icon: Ruler, title: 'Measure as you go', text: 'Scan a product, type its size from your tape, scan the next.' },
  { id: 'scan', icon: ScanBarcode, title: 'Scan a barcode', text: 'Find a product in this plan, or add it.' },
  { id: 'print', icon: Printer, title: 'Print or save as PDF', text: 'A drawing to scale and a check-off list.' },
  { id: 'sales', icon: TrendingUp, title: 'Sales help (worth a look)', text: 'What may run out, what to cut first.' },
  { id: 'compare', icon: GitCompare, title: 'Compare with another plan', text: 'What to add, take out, move or change.' },
  { id: 'shelf', icon: Columns3, title: 'Shelf sizes', text: 'Width, height and depth; add or remove a shelf.' },
  { id: 'guesses', icon: SlidersHorizontal, title: 'Default size guesses', text: 'The typical sizes guesses start from.' },
]

/** Everything that is not used every minute. */
export function ToolsSheet({ tools = TOOLS, inAisle, onPick, onClose, canRedo, onRedo }) {
  return (
    <Sheet title="Tools" onClose={onClose}>
      <button className="btn wide redo-btn" onClick={onRedo} disabled={!canRedo} data-testid="redo"><Redo2 size={20} aria-hidden="true" />Redo last change</button>
      <ul className="tool-grid">
        {tools.filter((t) => !(inAisle && t.id === 'compare')).map(({ id, icon: Icon, title, text }) => (
          <li key={id}>
            <button className="tool" onClick={() => onPick(id)} data-testid={`tool-${id}`}>
              <span className="tool-icon"><Icon size={26} aria-hidden="true" /></span>
              <span className="tool-title">{title}</span>
              <span className="tool-text">{text}</span>
            </button>
          </li>
        ))}
      </ul>
      {inAisle && <p className="muted small">Compare works on a single section: open one from Plans.</p>}
    </Sheet>
  )
}
