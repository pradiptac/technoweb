/**
 * Motion presets (0.114.0): the Motion tab's "Start from a preset" row.
 *
 * Plain data, the `LOOK_PRESETS` shape: each preset is a set of values for
 * the `motion_*` settings, keyed by setting name. Pressing one writes the
 * picker's controls and nothing else — the editor still presses Save, and
 * can change any single choice afterwards. Every value is an id from
 * `lib/motion-choices.ts`; a preset naming an id that list does not hold
 * would draw no tile as chosen, so keep the two in step.
 *
 * The first-visit splash is left out on purpose: it is a decision about the
 * first page of a visit, not about how the site moves, and a preset that
 * switched it on would surprise somebody choosing "Lively" for the buttons.
 */
export type MotionPreset = {
  id: string;
  label: string;
  note: string;
  values: Record<string, string>;
};

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: "standard",
    label: "Standard",
    note: "The site as it ships: sections lift in, buttons and cards rise under the pointer, the blueprint grid behind headings.",
    values: {
      motion_reveal: "lift", motion_buttons: "lift", motion_page: "none", motion_loader: "none",
      motion_hero: "grid", motion_cards: "lift", motion_progress: "none",
    },
  },
  {
    id: "calm",
    label: "Calm",
    note: "Sections fade in and nothing else moves. Quiet, for a site read more than browsed.",
    values: {
      motion_reveal: "fade", motion_buttons: "flat", motion_page: "none", motion_loader: "none",
      motion_hero: "none", motion_cards: "still", motion_progress: "none",
    },
  },
  {
    id: "lively",
    label: "Lively",
    note: "Pieces cascade in, pages rise, buttons grow, an aurora behind headings and a reading line along the top.",
    values: {
      motion_reveal: "cascade", motion_buttons: "scale", motion_page: "rise", motion_loader: "bar",
      motion_hero: "aurora", motion_cards: "float", motion_progress: "bar",
    },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    note: "Sections sharpen into focus, pages settle in, buttons shine and cards lean towards the pointer.",
    values: {
      motion_reveal: "blur", motion_buttons: "shine", motion_page: "zoom", motion_loader: "bar",
      motion_hero: "aurora", motion_cards: "tilt", motion_progress: "bar",
    },
  },
  {
    id: "still",
    label: "Still",
    note: "No movement anywhere — what visitors who ask for less motion always get, for everybody.",
    values: {
      motion_reveal: "none", motion_buttons: "flat", motion_page: "none", motion_loader: "none",
      motion_hero: "none", motion_cards: "still", motion_progress: "none",
    },
  },
];
