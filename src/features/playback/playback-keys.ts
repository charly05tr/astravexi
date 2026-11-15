export type PlaybackKeyAction = 'toggle' | 'prev-reading' | 'next-reading' | 'prev-day' | 'next-day' | 'start' | 'end';

interface KeyLike {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Space play/pause, Left/Right step, Shift+Left/Right one day, Home/End. Anything with a modifier is left to the browser. */
export function keyAction(e: KeyLike): PlaybackKeyAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case ' ':
    case 'Spacebar':
      return e.shiftKey ? null : 'toggle';
    case 'ArrowLeft':
      return e.shiftKey ? 'prev-day' : 'prev-reading';
    case 'ArrowRight':
      return e.shiftKey ? 'next-day' : 'next-reading';
    case 'Home':
      return 'start';
    case 'End':
      return 'end';
    default:
      return null;
  }
}

/** Typing, menus and dialogs keep their keys; Space on a button or link belongs to that control. */
export function keyBelongsToPage(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"], [role="dialog"], [role="listbox"], [role="textbox"]')) return false;
  if ((key === ' ' || key === 'Spacebar') && target.closest('button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"]')) return false;
  return true;
}
