import { placeholderSrc } from '@/lib/inventory/placeholder-image';

/**
 * The stand-in picture at the start of an item row. Decorative: the name beside
 * it says everything. The SVG is used as a mask so its colour comes from the
 * theme. Items have no picture of their own yet; when they do, show that here instead.
 */
export function ItemImage({ name, category }: { name: string; category?: string | null }) {
  const mask = `url(${placeholderSrc(name, category)}) center / 28px no-repeat`;
  return (
    <span aria-hidden="true" className="size-10 shrink-0 rounded-md bg-muted">
      <span className="block size-full bg-muted-foreground" style={{ mask, WebkitMask: mask }} />
    </span>
  );
}
