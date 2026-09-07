"use client";

import { useState } from "react";
import Image from "next/image";
import { IconBox } from "@/components/icons";

/**
 * The picture half of a product page: one large well and a row of thumbnails
 * that change what is in it.
 *
 * Shared by the catalogue's product page and the shop's, because a product is
 * the same object on both and it should not be photographed differently
 * depending on which listing somebody arrived from. The two pages differ in
 * what sits *beside* this — a price and a basket on one, a datasheet and an
 * enquiry on the other — and that is where the two pages diverge.
 *
 * **The thumbnails are buttons, not links.** They change the picture in place
 * rather than navigating, so they have to be reachable by keyboard and
 * announce which one is showing; `aria-current` does that without inventing a
 * widget role for what is really a set of view choices.
 *
 * The well is a fixed 4:3 at every width, matching the cards in the shop.
 * A ratio rather than a height is what makes it hold from a 320px phone to a
 * wide monitor, and it means a slow image cannot move the price out from under
 * somebody's cursor — the rule every image on this site follows.
 */
export function ProductGallery({
  images, alts, name, priority = false,
}: {
  images: string[];
  /** From the media library, resolved by path — a description of the picture. */
  alts?: (string | null)[];
  /** The fallback alt, and only ever the product's name. */
  name: string;
  priority?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const shown = images[index];

  return (
    <div className="grid gap-3">
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-line-strong bg-surface">
        {shown ? (
          <Image
            // Keyed on the source so switching remounts rather than re-pointing
            // an existing element — the entrance animation restarts, which is
            // what makes the change read as a change.
            key={shown}
            src={shown}
            alt={alts?.[index] ?? name}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover motion-safe:animate-[gallery-fade_.35s_ease-out]"
            priority={priority}
            unoptimized
          />
        ) : (
          <span className="text-faint"><IconBox className="size-10" /></span>
        )}
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2.5">
          {images.slice(0, 5).map((src, i) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? "true" : undefined}
                aria-label={`Show image ${i + 1} of ${Math.min(images.length, 5)}`}
                /*
                  The selected thumbnail is marked with a ring rather than by
                  dimming the others: dimming reads as "these are unavailable"
                  on a control whose whole job is to be pressed.
                */
                className={`relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-lg border transition-colors duration-200 ${
                  i === index
                    ? "border-brand-600 ring-2 ring-brand-100"
                    : "border-line-strong hover:border-brand-300"
                }`}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
