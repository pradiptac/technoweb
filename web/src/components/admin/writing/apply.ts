/** Sets a field's value so a React-controlled input takes it: the prototype setter, then an `input` event (the draft restore's pattern). */
export function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
