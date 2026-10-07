import Image from "next/image";
import { focalStyle } from "@/lib/focal";
import { blurProps } from "@/lib/blur";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { IconArrowRight } from "@/components/icons";
import { settingEnabled, type SiteSettings } from "@/lib/site-settings";

/**
 * The two promotional tiles above the shop front's wide band — the same
 * shape as the band minus the price line, side by side, each from its own
 * seven `store_tile_N_*` settings (Store → Promo banners).
 *
 * A tile draws only when its switch is on **and** it has a heading or a
 * picture, the band's own rule: a switched-on tile with nothing in it is a
 * dark rectangle nobody asked for. One tile on its own takes the whole row
 * rather than half of it beside a hole, and with neither the section is not
 * rendered at all — no empty band, no stray padding.
 *
 * `bg-dark` and the dark-ground tokens, like the band, so the two read as
 * one family and the tiles' text is graded against a ground that does not
 * invert with the scheme. The photograph fades into the ground through an
 * **opaque** stop (`from-scrim`) — `gradientStops()` in the audit discards a
 * translucent stop and would then grade the words against whatever opaque
 * colour sits further up the tree.
 */
export function PromoTiles({ settings }: { settings: SiteSettings }) {
  const tiles = ([1, 2] as const)
    .map((n) => {
      const k = (f: string) => settings[`store_tile_${n}_${f}`];
      if (!settingEnabled(settings, `store_tile_${n}_enabled`, false)) return null;
      const heading = k("heading");
      const image = k("image_url");
      if (!heading && !image) return null;
      return {
        n,
        kicker: k("kicker"),
        heading,
        text: k("text"),
        ctaLabel: k("cta_label") || "Shop now",
        ctaHref: k("cta_href") || "/store",
        image,
        focus: k("image_focus"),
        blur: k("image_blur"),
      };
    })
    .filter((t) => t !== null);

  if (tiles.length === 0) return null;

  return (
    <section data-aos="fade-up" className="py-2">
      <Container>
        <div className="grid gap-4 lg:grid-cols-2">
          {tiles.map((t) => (
            <div
              key={t.n}
              data-store-tile
              className={[
                "relative overflow-hidden rounded-xl bg-dark text-dark-ink",
                // A ratio from `lg` only, the band's rule: below it the words
                // set the height, because a heading, a line and a button need
                // more than a 16:9 box gives them at 320px. 2:1 beside a
                // neighbour; a lone tile stretches across at a flatter ratio
                // so it does not become a poster.
                tiles.length === 1 ? "lg:col-span-2 lg:aspect-[3.9/1]" : "lg:aspect-[2/1]",
              ].join(" ")}
            >
              {t.image && (
                <div className="absolute inset-0 hidden sm:block">
                  <Image
                    src={t.image}
                    alt=""
                    fill
                    sizes={tiles.length === 1 ? "100vw" : "(min-width: 1024px) 50vw, 100vw"}
                    className="object-cover"
                    style={focalStyle(t.focus)} {...blurProps(t.blur)}
                  />
                  {/* The words' ground: the left half fades from the scrim to the photograph.
                      Below `sm` the picture is not drawn at all — the words would cover most of it. */}
                  <span aria-hidden className="absolute inset-y-0 left-0 w-[75%] bg-linear-to-r from-scrim to-transparent" />
                </div>
              )}

              <div className="relative flex h-full flex-col justify-center p-6 sm:max-w-[60%] sm:p-8">
                {t.kicker && (
                  <span className="text-12-5 font-semibold uppercase tracking-[.1em] text-accent-300">{t.kicker}</span>
                )}
                {t.heading && <h2 className="display-3 mt-1.5 text-dark-ink">{t.heading}</h2>}
                {t.text && <p className="mt-2 text-14 leading-[1.55] text-dark-muted">{t.text}</p>}
                <div className="mt-4">
                  <ButtonLink href={t.ctaHref} variant="onDark" size="sm">
                    {t.ctaLabel} <IconArrowRight />
                  </ButtonLink>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
