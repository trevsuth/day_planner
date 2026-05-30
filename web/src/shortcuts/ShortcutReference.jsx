import { HelpCircle, X } from "lucide-react";

const shortcutSections = [
  {
    title: "Web Planner",
    rows: [
      ["Save", "Click Save"],
      ["Previous / next day", "Arrow buttons"],
      ["Open linked card", "Card button"],
      ["Remove card assignment", "Unlink button"],
    ],
  },
  {
    title: "Web Projects",
    rows: [
      ["Open filters", "/"],
      ["Move card focus", "J / K or Arrow keys"],
      ["Open focused card", "Enter"],
      ["New project drawer", "Alt+N"],
      ["New card", "Alt+C"],
      ["Open project card", "Alt+P"],
      ["Previous / next project", "Alt+K / Alt+J"],
      ["Switch project views", "Alt+1..8"],
      ["Clear filters", "Alt+0"],
      ["Close editor / preview", "Esc"],
      ["Save editor", "Ctrl+S / Cmd+S"],
    ],
  },
  {
    title: "TUI Planner",
    rows: [
      ["Projects view", "F2"],
      ["Previous / next day", "Left / Right"],
      ["Focus schedule", "Ctrl+1"],
      ["Focus priorities", "Ctrl+2"],
      ["Focus tasks", "Ctrl+3"],
      ["Focus notes", "Ctrl+4"],
    ],
  },
  {
    title: "TUI Projects",
    rows: [
      ["Planner view", "F1"],
      ["Search / jump cards", "F3"],
      ["Create project", "F5"],
      ["Add epic", "F6"],
      ["Add child card", "F7"],
      ["Previous / next card", "F8 / F9"],
      ["Save selected card", "F10"],
      ["Previous / next project", "PageUp / PageDown"],
    ],
  },
];

export function ShortcutReference({ onClose }) {
  return (
    <div className="shortcut-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="Keyboard shortcuts"
        className="shortcut-panel"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <HelpCircle size={18} />
            <h2>Keyboard Shortcuts</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close shortcuts" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="shortcut-grid">
          {shortcutSections.map((section) => (
            <article className="shortcut-section" key={section.title}>
              <h3>{section.title}</h3>
              <dl>
                {section.rows.map(([label, keys]) => (
                  <div key={`${section.title}-${label}`}>
                    <dt>{label}</dt>
                    <dd>{keys}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
