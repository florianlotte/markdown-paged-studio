// Dropdown menus of the toolbar and of the editor bar: a button opens a `role="menu"` list of entries,
// the arrows, Home and End move between the entries shown at this width, Escape and a click outside close.
// The popup menu of the file tabs (chapters.js) is filled at each opening and shares the keyboard handling.

// The keyboard of a `role="menu"` list: the arrows, Home and End move the focus between `items`, Escape (and
// Tab, which would leave the menu open behind) closes it with `close({ focus: true })`.
export function menuKeydown(event, items, close) {
  const index = items.indexOf(document.activeElement);
  const moves = { ArrowDown: index + 1, ArrowUp: index + items.length - 1, Home: 0, End: items.length - 1 };
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault();
    close({ focus: true });
  } else if (event.key in moves && items.length) {
    event.preventDefault();
    items[moves[event.key] % items.length].focus();
  }
}

// A menu under a toolbar button (the arrow next to Export, the "more" button): Escape, a click elsewhere or
// leaving it closes it; the arrow keys move between its entries; `actions` maps the id of an entry to what
// it does.
export function bindMenu(buttonId, menuId, actions) {
  const arrow = document.getElementById(buttonId);
  const menu = document.getElementById(menuId);
  // The entries shown at this width (an entry may exist on a phone only), read once the menu is open.
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')].filter(item => item.getClientRects().length);
  const open = () => {
    menu.hidden = false;
    arrow.setAttribute('aria-expanded', 'true');
    items()[0].focus();
  };
  const close = ({ focus = false } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    arrow.setAttribute('aria-expanded', 'false');
    if (focus) arrow.focus();
  };
  arrow.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('keydown', event => menuKeydown(event, items(), close));
  document.addEventListener('pointerdown', event => {
    if (!arrow.parentElement.contains(event.target)) close();
  });
  menu.addEventListener('focusout', event => {
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== arrow) close();
  });
  for (const [id, action] of Object.entries(actions)) {
    document.getElementById(id).addEventListener('click', event => {
      // An entry that is not available here keeps the menu open on its explanation.
      if (event.currentTarget.getAttribute('aria-disabled') === 'true') return;
      close();
      action();
    });
  }
}
