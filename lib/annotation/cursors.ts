/**
 * The cursors that say what a click is about to do.
 *
 * Shared so the image workspace and the website viewer feel like the same
 * tool: a reviewer who has learned that the orange pin means "click to leave a
 * comment" should not have to relearn it when the thing being reviewed is a
 * web page. Both fall back to `crosshair` where a custom cursor cannot load.
 */

/** Comment/pin placement — orange map pin with a "+", tip at the hotspot. */
export const COMMENT_PIN_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='28' viewBox='0 0 20 28'%3E%3Cpath d='M10 27C10 27 19 15.5 19 9.5C19 4.5 15 1 10 1C5 1 1 4.5 1 9.5C1 15.5 10 27 10 27Z' fill='%23ff6137' stroke='white' stroke-width='1'/%3E%3Ccircle cx='10' cy='9.5' r='3.5' fill='white'/%3E%3Cline x1='8.5' y1='9.5' x2='11.5' y2='9.5' stroke='%23ff6137' stroke-width='1.5' stroke-linecap='round'/%3E%3Cline x1='10' y1='8' x2='10' y2='11' stroke='%23ff6137' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") 10 27, crosshair`;

/** Markup tools — blue pencil, matching the pen icon in the drawing toolbar. */
export const DRAWING_PENCIL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 20 20'%3E%3Cpath d='M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.39.242l-3 1a1 1 0 01-1.265-1.265l1-3a1 1 0 01.242-.39l8.5-8.5z' fill='%232563eb' stroke='white' stroke-width='1' stroke-linejoin='round'/%3E%3C/svg%3E") 3 21, crosshair`;
