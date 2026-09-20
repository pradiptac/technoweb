/**
 * Authenticated admin reads and writes, one module per console domain.
 *
 * `import { … } from "@/lib/admin"` keeps working: this file re-exports
 * every domain so no call site had to change when the 3,160-line
 * `lib/admin.ts` was split along the section headers it already carried.
 * Every function pulls the token from the httpOnly cookie itself through
 * `token()` in `_shared.ts`, mirroring lib/portal.ts. The whole module is
 * `server-only`: types may cross into a client component, functions may not
 * — a client component calls a Server Action instead.
 */
import "server-only";

export * from "./accounts";
export * from "./blog";
export * from "./careers";
export * from "./case-studies";
export * from "./catalogue";
export * from "./chat";
export * from "./company";
export * from "./knowledge-base";
export * from "./leads";
export * from "./media";
export * from "./newsletter";
export * from "./pages";
export * from "./seo";
export * from "./settings";
export * from "./site";
export * from "./store";
export * from "./tickets";
