// jsdom has no layout, so virtualized scroll containers and rows report 0x0
// and the virtualizer renders nothing. Report plausible sizes instead.
// TanStack Virtual reads offsetWidth/offsetHeight for its measurements.

const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");

const isViewport = (el: HTMLElement) => el.getAttribute?.("data-slot") === "scroll-area-viewport";
const isRow = (el: HTMLElement) => el.hasAttribute?.("data-index");

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    if (isViewport(this) || isRow(this)) return 1280;
    return originalOffsetWidth?.get?.call(this) ?? 0;
  },
});

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    if (isViewport(this)) return 800;
    if (isRow(this)) return 66;
    return originalOffsetHeight?.get?.call(this) ?? 0;
  },
});
