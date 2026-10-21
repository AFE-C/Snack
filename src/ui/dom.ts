export function element<T extends HTMLElement = HTMLElement>(root: ParentNode, id: string): T {
  const node = root.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node;
}
