import { Sheet } from './Panels.jsx'

const TOOLS = [
  { id: 'measure', title: 'Measure as you go', text: 'Scan a product, type its size from your tape, scan the next. Every guess you replace makes the fit checks more accurate.' },
  { id: 'scan', title: 'Scan a barcode', text: 'Find a product in this plan, or add it.' },
  { id: 'print', title: 'Print or save as PDF', text: 'A drawing to scale and a list with check boxes for setting the shelf.' },
  { id: 'sales', title: 'Sales help (worth a look)', text: 'What may run out, what takes room for little sales, what to cut first when a shelf is over.' },
  { id: 'compare', title: 'Compare with another plan', text: 'What to add, take out, move or change, e.g. current set to proposed set.' },
  { id: 'guesses', title: 'Default size guesses', text: 'The typical sizes every guessed product starts from.' },
]

/** Everything that is not used every minute. */
export function ToolsSheet({ tools = TOOLS, inAisle, onPick, onClose }) {
  return (
    <Sheet title="Tools" onClose={onClose}>
      <ul className="item-list">
        {tools.filter((t) => !(inAisle && t.id === 'compare')).map((t) => (
          <li key={t.id}>
            <button className="row" onClick={() => onPick(t.id)} data-testid={`tool-${t.id}`}>
              <span className="row-main">
                <span className="row-name">{t.title}</span>
                <span className="row-sub">{t.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
