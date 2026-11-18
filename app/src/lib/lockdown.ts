// The app must not behave like a web page: no text selection, no browser context menu, no dragging
// pictures or links, no select-all / find / reload / print / zoom, and Space / arrows / Page keys never
// scroll the page (the app's own shortcuts still receive them). Text fields keep normal editing.

const editable = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color'].includes(el.type);
  return false;
};

const SCROLL_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
const BLOCKED_META = new Set(['a', 'f', 'g', 'p', 's', 'r', 'l', 'o', 'u', 'j', 'y', '[', ']', '=', '+', '-', '0']);

export function lockdown() {
  document.addEventListener('contextmenu', (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
  document.addEventListener('selectstart', (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
  // Pinch and ⌘-wheel zoom.
  document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  window.addEventListener(
    'keydown',
    (e) => {
      const inField = editable(e.target);
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        // ⌘A only selects inside a text field; the other web shortcuts do nothing anywhere.
        if (k === 'a' ? !inField : BLOCKED_META.has(k) && !(inField && ['z', 'y'].includes(k))) {
          e.preventDefault();
          return;
        }
      }
      if (!inField && SCROLL_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey) {
        // Let the app's own shortcut handlers run first, then stop the browser from scrolling.
        window.addEventListener('keydown', (late) => { if (late === e) e.preventDefault(); }, { once: true });
      }
      // Tab never walks the page; it only moves between fields of the dialog/form that holds the focus.
      if (e.key === 'Tab' && !inField && !(e.target as HTMLElement | null)?.closest?.('[role="dialog"], .onb-card, .modal')) e.preventDefault();
    },
    { capture: true },
  );
  // Clear any selection the platform made anyway (double-click on text).
  document.addEventListener('mouseup', () => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && !editable(document.activeElement)) sel.removeAllRanges();
  });
}
