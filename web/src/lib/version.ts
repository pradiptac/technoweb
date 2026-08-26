/**
 * The application version, in one place.
 *
 * Two rules keep this honest:
 *
 * **This constant is the source of truth**, not `package.json` and not a git
 * tag. It is what the console displays, so a version bumped anywhere else is a
 * version nobody sees.
 *
 * **Every bump gets an entry in `VERSION.md`** in the repository root, in the
 * same commit. A version number with no changelog line is worse than no
 * version number: it tells someone the build changed without telling them
 * what changed, which is exactly the question the number exists to answer.
 *
 * Semantic-ish, for an application rather than a library:
 *   major — a release the client has signed off, or a breaking data change
 *   minor — a feature an editor or a visitor would notice
 *   patch — a fix or an internal change nobody has to be told about
 */
export const APP_VERSION = "0.11.0";

/** What the console shows beside its wordmark. */
export const VERSION_LABEL = `v${APP_VERSION}`;
