import { Sheet } from './Panels.jsx'

const TOOLS = [
  { id: 'print', title: 'Print or save as PDF', text: 'A drawing to scale and a list with check boxes for setting the shelf.' },
  { id: 'guesses', title: 'Default size guesses', text: 'The typical sizes every guessed product starts from.' },
]

/** Everything that is not used every minute. */
export function ToolsSheet({ tools = TOOLS, onPick, onClose }) {
  return (
    <Sheet title="Tools" onClose={onClose}>
      <ul className="item-list">
        {tools.map((t) => (
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
