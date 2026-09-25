import type { LoginBackdropId } from "@/lib/login-backdrop-choices";
import { ORIGINAL_SCENES } from "./original";
import type { SceneFactory } from "./shared";
import { VENGEANCE_SCENES } from "./vengeance";

/**
 * Every sign-in backdrop scene by id. Typed as the full record, so an id
 * added to `LoginBackdropId` without a scene is a type error here rather
 * than a blank panel.
 */
export const SCENES: Record<Exclude<LoginBackdropId, "image">, SceneFactory> = {
  ...ORIGINAL_SCENES,
  ...VENGEANCE_SCENES,
};
