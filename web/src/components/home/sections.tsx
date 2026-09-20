/**
 * The homepage's sections, one file each. This barrel keeps the import path
 * `page.tsx` has always used; it is the only importer, and it renders every
 * section, so nothing is lost to the "Turbopack keeps a module whole" rule.
 */
export { Partners } from "./partners";
export { TrustedBy } from "./trusted-by";
export { Credentials } from "./credentials";
export { Solutions } from "./solutions";
export { ProductCategories } from "./product-categories";
export { WhyUs } from "./why-us";
export { Industries } from "./industries";
export { WebServices } from "./web-services";
export { SupportBand } from "./support-band";
export { CaseStudies } from "./case-studies";
export { Resources } from "./resources";
