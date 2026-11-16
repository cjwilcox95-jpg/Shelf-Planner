import { CheckCircle2, Hand, LayoutPanelTop, Plus, ScanBarcode } from 'lucide-react'
import { Sheet } from './Panels.jsx'

// The basics, in the order a new person meets them. Kept to five so it is read, not skipped.
const STEPS = [
  { icon: LayoutPanelTop, head: 'Tap a shelf to work on it.', text: 'You start with the whole set. “Whole set” at the bottom takes you back out.' },
  { icon: Plus, head: 'Use − and + to change facings.', text: 'A facing is one product showing at the front. 3 facings means 3 side by side.' },
  { icon: Hand, head: 'Tap a product to move it.', text: 'Arrows move it left, right, up or down a shelf. Or press and hold it in the picture, then slide it.' },
  { icon: ScanBarcode, head: 'Scan or Add to put a product on.', text: 'It goes on the shelf you are working on.' },
  { icon: CheckCircle2, head: 'The tag at the top says if it fits.', text: 'Green: everything fits. Red: a shelf is over. Tap it to see why.' },
]

const WORDS = [
  ['Facing', 'One product showing at the front of the shelf.'],
  ['Section', 'One set of shelves, top to bottom. Usually 4 feet wide.'],
  ['Aisle', 'Several sections side by side.'],
  ['AFI set', 'A planogram from AFI. Start a plan from one and it comes with AFI’s products and facings.'],
  ['Room above', 'The space between a shelf and the shelf above it (also called clearance).'],
  ['Off the shelf', 'Products that belong to the plan but are not on a shelf right now.'],
  ['~ and ≈', '~ is a guessed size. ≈ is an estimate from a photo or from AFI’s shelf count. No mark means it was measured.'],
  ['Special order', 'A product the store can order but does not normally stock.'],
]

const GOOD_TO_KNOW = [
  'Your work saves by itself after every change. It stays on this phone; nothing is uploaded.',
  'Undo takes back the last change. Redo is under Tools.',
  'To keep a copy, or to move to another phone: Plans, then Backup.',
  'To try a new set without losing the current one: Plans, tap ⋯ on a plan, then Copy.',
  'Sizes start as guesses. Tap a product, then Details, then Edit size to type a real one.',
  'It works with no signal once it has been opened online.',
]

/**
 * How the app works. Opens by itself the first time (as "Welcome"), and any time from Tools.
 * demo: the made-up demo products are loaded, so say how to bring in real ones.
 */
export function HelpSheet({ first = false, demo = false, onClose }) {
  return (
    <Sheet title={first ? 'Welcome' : 'How it works'} onClose={onClose} doneLabel={first ? 'Got it' : 'Done'} tall={!first}>
      <ol className="help-steps" data-testid="help-steps">
        {STEPS.map(({ icon: Icon, head, text }) => (
          <li key={head}>
            <span className="tool-icon"><Icon size={22} aria-hidden="true" /></span>
            <span className="row-main"><strong>{head}</strong><span className="row-sub">{text}</span></span>
          </li>
        ))}
      </ol>
      {demo && (
        <p className="ok-msg" data-testid="help-demo">
          These are made-up demo products, for trying things out. To use your store’s products: Plans, then Backup, then Import a file.
        </p>
      )}
      {first ? (
        <p className="muted small">You can read this again any time: Tools, then How it works.</p>
      ) : (
        <>
          <h3 className="sheet-section">Good to know</h3>
          <ul className="help-list">
            {GOOD_TO_KNOW.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <h3 className="sheet-section">What the words mean</h3>
          <dl className="help-words" data-testid="help-words">
            {WORDS.map(([w, t]) => <div key={w}><dt>{w}</dt><dd>{t}</dd></div>)}
          </dl>
        </>
      )}
    </Sheet>
  )
}
