/**
 * The words on the settings screen: a label, hint and placeholder per key,
 * a title and blurb per group, the field order within a group, the keys the
 * screen hides, and the sections the twenty groups are filed under.
 *
 * Copy and configuration, in a module of their own so `settings-form.tsx`
 * is the form — 530 lines of tables inside a `"use client"` component were
 * the largest file in the console. `SCREENS` is the only list and `ORDER`
 * is derived from it; see CLAUDE.md for the tab that rendered as its raw
 * lowercase key when the two drifted.
 */
import type { SettingGroups } from "@/lib/admin";

/** Human labels and hints, so the UI does not just show raw setting keys. */
export const LABELS: Record<string, { label: string; hint?: string; placeholder?: string }> = {
  company_name: { label: "Company name" },
  console_notice_seconds: {
    label: "Notice duration (seconds)",
    hint: "How long a \"saved\" notice stays on screen in this console before it leaves. A failure stays until it is dismissed.",
  },

  /*
    The website assistant. Every key in the `chatbot` group had been rendering
    with its raw name and no hint — the group had no title, no labels and no
    field order, so the panel read as a list of database columns. These are the
    settings the module has always had plus the ones added with visitor intake
    and the WhatsApp hand-off.

    Four of them are public — the name, both auto-open keys and the WhatsApp
    number — because the widget draws them before anybody has spoken. The
    model, the caps and the intake questions are not.
  */
  chatbot_enabled: {
    label: "Website assistant",
    hint: "1 to enable, 0 to disable. Off by default, because switched on it spends money on every message.",
  },
  chatbot_name: {
    label: "Assistant name",
    hint: "Shown at the top of the panel and in the greeting. Blank uses the company name followed by \"assistant\", so renaming the business does not leave it introducing one that no longer exists.",
  },
  chatbot_welcome: {
    label: "Greeting",
    hint: "The first thing in the panel. It is chrome rather than a turn, so it is not stored in the transcript and does not reach the model.",
  },
  chatbot_fallback: {
    label: "When it cannot answer",
    hint: "Used whenever nothing on the website matches. The model is not called at all in that case — a question with no context attached is where an assistant invents.",
  },
  chatbot_quick_actions: {
    label: "Suggestion chips",
    hint: "One per line, as Label|what it asks. The label is the button and the second half is what gets sent, because \"Need support\" is a good button and a poor question. Five at most. Hidden entirely while visitor details are still being collected.",
  },
  chatbot_auto_open: {
    label: "Open by itself",
    hint: "1 to enable, 0 to disable. Off by default. Opened once per visit rather than per page, so a panel somebody dismissed does not reappear on every article afterwards.",
  },
  chatbot_colour: {
    label: "Assistant colour",
    hint: "The launcher button, its ring, and your visitors' own message bubbles. Blank uses the brand colour from Colour palette. The text on it is worked out to stay readable whatever you pick.",
  },
  chatbot_icon: {
    label: "Launcher icon",
    hint: "The glyph on the button and at the top of the panel.",
  },
  chatbot_font_size: {
    label: "Text size",
    hint: "The size of the messages in the panel.",
  },
  indexnow_enabled: { label: "Send IndexNow pings", hint: "Switch on at launch. Every published record then reports its own changes." },
  indexnow_key: { label: "Key", hint: "Filled in automatically the first time a ping is sent; served at /indexnow/{key}.txt so the engines can verify it. Leave blank." },
  reviews_embed: {
    label: "Google reviews widget (Elfsight)",
    hint: "Paste the whole snippet Elfsight gives you — the script tag and the <div class=\"elfsight-app-…\">. Only the app id and Elfsight's own script are used from it; anything else pasted here draws nothing. The section appears on the homepage under Credentials and can be moved or switched off on the Themes screen. The \"Powered by Elfsight\" line is hidden.",
  },
  reviews_kicker: { label: "Reviews kicker", placeholder: "Reviews" },
  reviews_heading: { label: "Reviews heading", placeholder: "What our customers say" },
  reviews_lede: { label: "Reviews intro", hint: "One sentence under the heading. Blank for none." },
  body_code: {
    label: "Code before </body>",
    hint: "For a widget whose instructions say to paste its code before the closing body tag — a chat, a booking tool, a badge. Put the snippet here exactly as given; it runs on every public page and never in the console or the portal. It is not checked or cleaned: only an administrator can write it, and it is as trusted as your own password.",
  },
  chatbot_background: {
    label: "Assistant background",
    hint: "The colour behind the conversation, between the header and the message box. Blank uses the palest brand tint from Colour palette. The bubbles stay white cards on it; anything drawn straight on the colour takes a text colour worked out to stay readable.",
  },
  chatbot_animation: {
    label: "Animation",
    hint: "How the button bids for attention until somebody opens it. Every style stops once the panel has been opened, and none plays for a visitor who has asked for reduced motion.",
  },
  chatbot_show_name: {
    label: "Show the name beside the button",
    hint: "The button becomes a pill carrying the assistant's name, so visitors see who they would be talking to before they open it. Off, it is the icon alone.",
  },
  chatbot_auto_open_delay: {
    label: "Wait before opening (seconds)",
    hint: "Only used when the above is on. A floor of 3 seconds applies whatever is set: opening on arrival interrupts the page before anybody has read a word of it.",
  },
  chatbot_intake_enabled: {
    label: "Ask who the visitor is first",
    hint: "1 to enable, 0 to disable. On by default. The assistant greets, collects the details below one question at a time, and answers nothing until it is done — then files a lead. Every question can be declined, and a signed-in customer is never asked for what their account already holds.",
  },
  chatbot_smart_intake: {
    label: "Read the answers with the model",
    hint: "1 to enable, 0 to disable. On by default. With an API key configured, the model reads each answer before the rules do: keyboard noise is refused where a shape check would let it through, a name is lifted out of the sentence around it, and a question asked instead of an answer is answered with the intake question put back. One small call per answer; never charged without a key, and never past the daily cap. The rules still have the last word.",
  },
  chatbot_intake_questions: {
    label: "The questions it asks",
    hint: "One per line, as field|question. Only name, email, phone, company and requirement are understood; anything else is ignored rather than asked, since nothing would know how to store the answer. The last line does double duty — its answer is both the enquiry and the first question the assistant actually answers.",
  },
  chatbot_whatsapp_number: {
    label: "WhatsApp number",
    hint: "With the country code, digits only — 919831100758. Adds a button to the panel that opens WhatsApp with a message already written, carrying whatever the visitor has given. Blank hides the button rather than showing a dead one.",
  },
  chatbot_forward_unanswered: {
    label: "Email unanswered questions",
    hint: "1 to enable, 0 to disable. Off by default. Sends the sales address the question and whoever asked it. The Unanswered screen already groups these; this is for catching somebody while they are still on the site, and switched on a busy afternoon is a lot of email.",
  },
  chatbot_model: {
    label: "AI model",
    hint: "Blank uses the model in the server's own configuration. A model this account cannot call fails on every message.",
  },
  chatbot_max_message_chars: { label: "Longest message (characters)" },
  chatbot_max_messages: {
    label: "Messages per conversation",
    hint: "The conversation is closed at this. Trimming the context bounds the cost of each request and does nothing about a thousand of them.",
  },
  chatbot_context_messages: {
    label: "Earlier messages sent with each request",
    hint: "What makes a follow-up like \"and the 48-port one?\" mean anything. Everything before it is paid for on every request and adds nothing.",
  },
  chatbot_daily_reply_cap: {
    label: "Replies per day",
    hint: "The one ceiling that bounds the bill rather than any single visitor. 0 removes it. Rate limits stop one person; this stops a bad afternoon.",
  },
  chat_retention_days: {
    label: "Keep transcripts for (days)",
    hint: "A transcript is personal data given by somebody with no account to come back and delete it themselves. A floor of 7 days applies whatever is set.",
  },
  /*
    The AI SEO assistant. Private settings — the `seo` group is not on the
    public whitelist, so none of this reaches a visitor.
  */
  seo_ai_enabled: {
    label: "AI SEO assistant",
    hint: "1 to enable, 0 to disable. Off by default. It only ever runs when somebody presses a button on a record; it is never called while a page is being rendered.",
  },
  seo_ai_model: {
    label: "AI model",
    hint: "Leave blank to use whatever the chatbot uses. Press Test after changing it — a model this account cannot call fails silently on every request otherwise.",
  },
  seo_ai_daily_cap: {
    label: "AI requests per day",
    hint: "The only ceiling that bounds the bill. 0 removes it entirely. Refused requests are free.",
  },
  seo_ai_business_type: {
    label: "What the business does",
    hint: "One line, given to the AI as context. Falls back to the tagline.",
  },
  seo_ai_audience: {
    label: "Who it sells to",
    hint: "Who the copy is written for. The AI has no other way to know.",
  },
  seo_ai_locations: {
    label: "Where it operates",
    hint: "Falls back to the places on the Locations screen, then to the postal address.",
  },
  lead_intent_words: {
    label: "More buying words",
    hint: "One word or phrase per line, added to the built-in list. Whole words only, so \"PO\" does not match \"port\"; plurals and -ing forms are matched for you.",
  },
  seo_ai_context: {
    label: "Tone and positioning",
    hint: "Anything else the AI should know before it writes. Do not list services or locations here — those are read from the catalogue on every request, so a list typed here would go stale the day something is published. The rules against inventing certifications, statistics and customer names are in the code and cannot be edited away.",
  },
  seo_ai_retention_days: {
    label: "Keep AI suggestions for (days)",
    hint: "Stored suggestions are deleted after this. A floor of 7 days applies whatever is set here.",
  },
  /*
    Page banners. The hint on each says which pages it dresses, because a
    section name is not a list of URLs and an editor uploading a picture is
    entitled to know where it is about to appear.
  */
  announcement_enabled: { label: "Show the info bar" },
  announcement_message: { label: "Message" },
  announcement_style: { label: "Background" },
  announcement_colour: { label: "Colour" },
  announcement_colour_2: { label: "Second colour" },
  announcement_mode: { label: "Message style" },
  announcement_closable: { label: "Visitors can close it" },
  announcement_starts_at: { label: "Show from" },
  announcement_ends_at: { label: "Show until" },
  banner_enabled: {
    label: "Show page banners",
    hint: "1 to enable, 0 to disable. On by default — with nothing uploaded below there is no banner to show, so this exists to drop them all at once without clearing the pictures.",
  },
  banner_default_path: {
    label: "Default banner",
    hint: "Used by any section with nothing of its own, so one upload dresses the whole site. Landscape and wide — roughly 2000×560 — and the darker the picture the better it reads. It is dimmed automatically so the heading stays legible over it.",
  },
  banner_solutions_path: { label: "Solutions banner", hint: "/solutions and every solution page." },
  banner_products_path: { label: "Products banner", hint: "/products, every category and product page, and /brands." },
  banner_services_path: { label: "Web Services banner", hint: "/services and every service page." },
  banner_industries_path: { label: "Industries banner", hint: "/industries and every industry page." },
  banner_store_path: { label: "Store banner", hint: "Store product pages. The shop's own front page has its hero slider instead." },
  banner_support_path: { label: "Support banner", hint: "/support." },
  banner_resources_path: { label: "Resources banner", hint: "/resources, the blog, case studies and the knowledge base." },
  banner_company_path: { label: "Company banner", hint: "About, Contact, Careers and the location pages." },
  activation_procedure: {
    label: "Default activation procedure",
    hint: "Sent by email the moment an activation code is issued, and shown beside the code on the order page. A product with its own procedure overrides this; a product left blank uses it.",
  },
  activation_pdf_path: {
    label: "Default activation document",
    hint: "A PDF attached to the same email — the vendor's guide or licence terms. Overridden per product in the same way.",
  },
  store_shipping_paise: {
    label: "Delivery charge, in paise",
    hint: "0 means free delivery. The same figure is shown on every product page, declared in the Google shopping feed and written into each product's Offer markup — three places, one number, so they cannot disagree.",
    placeholder: "0",
  },
  store_handling_days: {
    label: "Handling time, in working days",
    hint: "Days between payment and dispatch. Shown on the shipping page and declared to Google as the handling time.",
    placeholder: "2",
  },
  store_shipping_service: {
    label: "Delivery service name",
    hint: "What the courier service is called in the Google shopping feed — \"Standard Shipping\" unless you offer a named one.",
    placeholder: "Standard Shipping",
  },
  store_transit_days_min: {
    label: "Delivery time — from (working days)",
    hint: "The fastest a parcel arrives after it leaves. With the handling time above, this is what Google shows as the delivery estimate and what the shipping page says.",
    placeholder: "3",
  },
  store_transit_days_max: {
    label: "Delivery time — to (working days)",
    hint: "The slowest. Never below the figure above; a window typed backwards is corrected.",
    placeholder: "7",
  },
  store_return_days: {
    label: "Return window, in days",
    hint: "Counted from delivery. Shown on every returnable product and declared to Google as the return policy; a product marked non-returnable ignores it.",
    placeholder: "7",
  },
  store_cart_reminders_enabled: {
    label: "Send basket reminders",
    hint: "Off by default. On, somebody who leaves a basket with an email in it — typed at the checkout, or on their account — is emailed a reminder, and a second later. Only between the promotional hours, never to an address on the do-not-mail list, and each email carries an unsubscribe.",
  },
  store_cart_reminder_1_hours: {
    label: "First reminder after (hours)",
    hint: "How long a basket sits untouched before the first email. 1 to 72. A basket left for more than a week before reminders were switched on is not woken.",
    placeholder: "1",
  },
  store_cart_reminder_2_days: {
    label: "Second reminder after (days)",
    hint: "Counted from when the basket went quiet, and at least twelve hours after the first. 1 to 25 — an untouched basket is deleted at 30.",
    placeholder: "1",
  },
  store_cart_reminder_coupon: {
    label: "Coupon in the second reminder",
    hint: "A code from Store → Discount codes, or blank for none. It is offered only when the basket could actually use it — not expired, not used up, not below its minimum order.",
    placeholder: "COMEBACK10",
  },
  store_price_drop_min_percent: {
    label: "Wishlist price drop, in per cent",
    hint: "How far a saved product's price has to fall before whoever saved it is emailed — measured from the price when they saved it, or the last drop they were told about, so one drop is one message. A whole number from 1 to 90.",
    placeholder: "5",
  },
  store_promo_enabled: { label: "Show the promo banner" },
  store_promo_kicker: { label: "Kicker", hint: "The short line above the heading — a category, an offer, a season.", placeholder: "Business laptops, in stock" },
  store_promo_heading: { label: "Heading", placeholder: "Save Up To 60%" },
  store_promo_price_text: { label: "Price line", placeholder: "Starting At Just ₹9,999" },
  store_promo_subheading: { label: "Subheading", hint: "A sentence under the heading. Leave blank for none." },
  store_promo_cta_label: { label: "Button label" },
  store_promo_cta_href: { label: "Button link", hint: "A path on this site, or a full address.", placeholder: "/store/categories/laptops" },
  store_promo_image_path: {
    label: "Picture",
    hint: "PNG, JPG or WebP. A product photo on a plain or transparent background works best against the dark band.",
  },
  store_tile_1_enabled: { label: "Show this tile" },
  store_tile_1_kicker: { label: "Kicker", hint: "The short line above the heading.", placeholder: "Networking" },
  store_tile_1_heading: { label: "Heading", placeholder: "Switches from ₹4,990" },
  store_tile_1_text: { label: "One line", hint: "A sentence under the heading. Leave blank for none." },
  store_tile_1_cta_label: { label: "Button label" },
  store_tile_1_cta_href: { label: "Button link", hint: "A path on this site, or a full address.", placeholder: "/store/categories/switches" },
  store_tile_1_image_path: {
    label: "Picture",
    hint: "Drawn 2:1 beside its neighbour, cropped to fit; the words sit over the picture's left half, so keep the subject to the right.",
  },
  store_tile_2_enabled: { label: "Show this tile" },
  store_tile_2_kicker: { label: "Kicker", hint: "The short line above the heading.", placeholder: "Networking" },
  store_tile_2_heading: { label: "Heading", placeholder: "Switches from ₹4,990" },
  store_tile_2_text: { label: "One line", hint: "A sentence under the heading. Leave blank for none." },
  store_tile_2_cta_label: { label: "Button label" },
  store_tile_2_cta_href: { label: "Button link", hint: "A path on this site, or a full address.", placeholder: "/store/categories/switches" },
  store_tile_2_image_path: {
    label: "Picture",
    hint: "Drawn 2:1 beside its neighbour, cropped to fit; the words sit over the picture's left half, so keep the subject to the right.",
  },
  // The hint here comes from the chosen option's own description, which the
  // API sends — see ChoiceField. Only the label is needed.
  image_quality: { label: "Image quality" },
  media_max_kb: {
    label: "Maximum upload size (KB)",
    hint: "Images and documents. 5120 is 5 MB.",
  },
  media_max_video_kb: {
    label: "Maximum video size (KB)",
    hint: "MP4 and WebM only. 20480 is 20 MB.",
  },
  media_max_megapixels: {
    label: "Maximum image size (megapixels)",
    hint: "A separate limit from file size, and it has to be: a well-compressed image of enormous dimensions fits inside the size limit and still exhausts memory the moment anything resizes it. 50 is larger than any current camera produces.",
  },
  /*
    Each of these says the size it wants, because each is used at a different
    one and the file decides its own aspect ratio — the header reserved 180x40
    for a mark that turned out to be 600x81, and the navigation beside it
    jumped on every cold load until the real dimensions were read.
  */
  logo_path: {
    label: "Logo",
    hint: "PNG or SVG with a transparent background, around 600 x 80 px. Leave empty to use the TECHNOWARE wordmark.",
  },
  favicon_path: {
    label: "Favicon",
    hint: "The small icon in the browser tab. Square PNG or SVG, 512 x 512 px.",
  },
  login_image_path: {
    label: "Sign-in image",
    hint: "Used when \u201cPicture\u201d is chosen above. A landscape photograph around 1600 x 1200 px; it is hidden on phones. Leave empty for the brand gradient.",
  },
  login_message: {
    label: "Message in the panel",
    hint: "Written in the middle of the panel, over the picture or the animation, in place of the tagline. A heading, a line or two, a link. Leave empty to keep the tagline in the corner.",
  },
  login_backdrop: { label: "Behind the form" },
  login_intensity: { label: "Animation intensity" },
  login_speed: { label: "Animation speed" },
  newsletter_company: { label: "Sender name in the footer", hint: "Falls back to the company name above." },
  newsletter_from_name: { label: "From name", hint: "What a recipient sees in place of the address." },
  newsletter_from_email: { label: "From address", hint: "Must be on a domain whose SPF and DKIM records name your mail provider, or messages land in spam." },
  newsletter_reply_to: { label: "Reply-to", hint: "Where replies go. Worth setting to a monitored inbox — people do reply." },
  newsletter_address: {
    label: "Postal address",
    hint: "Goes in every footer. Required by anti-spam law in several countries, and a campaign without one is refused before it sends.",
  },
  newsletter_footer_text: { label: "Footer line", hint: "One sentence saying why they are receiving this." },
  newsletter_batch_size: { label: "Emails per batch", hint: "How many one background job sends. Lower it if your provider rate-limits." },
  newsletter_batch_delay: { label: "Seconds between batches", hint: "Zero sends as fast as the queue allows." },
  newsletter_tracking_enabled: {
    label: "Track opens and clicks",
    hint: "Adds a pixel and rewrites links. Switch it off and campaign reports show delivery only — which is a legitimate choice, not a broken one.",
  },
  newsletter_signup_enabled: { label: "Accept signups from the site", hint: "The form on the public site." },
  tagline: { label: "Tagline", hint: "One line, used in structured data and social previews." },
  phone: { label: "Phone", hint: "Shown in the header bar and on the contact page." },
  support_email: { label: "Support email" },
  sales_email: { label: "Sales email" },
  address: { label: "Address", hint: "Shown in the footer and on the contact page. Line breaks are kept." },
  map_embed_url: {
    label: "Map embed URL",
    hint: "In Google Maps: Share, then Embed a map, then copy just the src=\"...\" value. Only Google embed URLs are accepted.",
    placeholder: "https://www.google.com/maps/embed?pb=...",
  },
  map_link: { label: "Map link", hint: "Where Open in Maps goes.", placeholder: "https://maps.google.com/?q=..." },
  default_meta_description: {
    label: "Default meta description",
    hint: "Used where a page has no description of its own. Over 320 characters and search engines truncate it.",
  },
  default_og_image: {
    label: "Default social image",
    hint: "Path to an image in the media library. 1200 x 630 px — the size every social network crops its preview to.",
  },
  portal_enabled: { label: "Customer portal enabled", hint: "1 to enable, 0 to disable." },
  registration_enabled: { label: "Self-registration enabled", hint: "1 lets anybody register through the portal; 0 means accounts are created by staff or by paying." },
  /*
    Labelled on 2026-09-20. These fields drew under their raw keys —
    `comments_closed_after_days` as a label — and a field with no label is
    also left out of the command palette, which lists only what it can name.
  */
  blog_video_url: { label: "Sidebar video", hint: "A YouTube link. The widget is absent while this is blank." },
  comments_enabled: { label: "Comments enabled", hint: "1 puts a comment form on every article and a moderation queue on somebody's desk; 0 (the default) keeps both off." },
  comments_closed_after_days: { label: "Close comments after (days)", hint: "Counted from publication. An old article is where spam collects; 0 never closes them." },
  store_enabled: { label: "Store open", hint: "1 to open the shop, 0 to close it. A closed shop keeps its catalogue and refuses the basket." },
  digital_auto_fulfil: { label: "Issue activation codes automatically", hint: "1 hands a code over the moment payment lands; 0 waits for somebody to press Fulfil on the order." },
  landing_page_cap: { label: "Published landing pages, at most", hint: "The ceiling on how many programmatic pages may be live at once — the one rule about the set rather than the page.", placeholder: "40" },
  newsletter_webhook_secret: { label: "Bounce webhook secret", hint: "What a provider's bounce webhook must prove. With none set, nothing is accepted." },
  activity_retention_days: { label: "Keep the activity log for (days)", hint: "A floor of 30 days applies whatever is set." },
  application_retention_days: { label: "Keep job applications for (days)", hint: "The CV is deleted with the row. A floor of 30 days applies whatever is set." },
  client_error_retention_days: { label: "Keep JavaScript errors for (days)", hint: "Ranged on when the error was last seen, so a bug that keeps recurring stays." },
  comment_retention_days: { label: "Keep spam and binned comments for (days)", hint: "Published and waiting comments never age out." },
  customer_approval_required: {
    label: "Customer account activation required",
    hint: "1 to require staff approval before a self-registered account can sign in, 0 to activate it automatically the moment its email address is confirmed.",
  },
  default_login_method: {
    // The hint comes from the chosen option's own description, which the API
    // sends — see ChoiceField. Only the label is needed here.
    label: "Sign-in opens on",
  },
  otp_login_enabled: {
    label: "Customers sign in with a code",
    hint: "1 to enable, 0 to disable. On, the portal asks for an address and emails a six-digit code.",
  },
  otp_admin_login_enabled: {
    label: "Staff sign in with a code",
    hint: "1 to enable, 0 to disable. Convenient, and it makes the staff mailbox the only thing standing between an attacker and this console.",
  },
  password_login_enabled: {
    label: "Passwords still accepted",
    hint: "1 to enable, 0 to disable. Turning this off with mail misconfigured locks everybody out, and the way back in is a database edit.",
  },
  social_linkedin: { label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
  social_x: { label: "X", placeholder: "https://x.com/…" },
  social_facebook: { label: "Facebook", placeholder: "https://www.facebook.com/…" },
  social_instagram: { label: "Instagram", placeholder: "https://www.instagram.com/…" },
  social_youtube: { label: "YouTube", placeholder: "https://www.youtube.com/@…" },
  social_whatsapp: { label: "WhatsApp", placeholder: "https://wa.me/919876543210" },
  social_reddit: { label: "Reddit", placeholder: "https://www.reddit.com/r/… or /user/…" },
  home_stats_block: {
    label: "Stat bar section",
    hint: "A published stat bar to show on the homepage (Site → Stat bars). Where it sits, and whether it shows, is on the Themes screen.",
  },
  home_stack_block: {
    label: "Technology stack section",
    hint: "A published technology stack to show on the homepage (Site → Technology stack).",
  },
  home_pricing_block: {
    label: "Pricing section",
    hint: "A published pricing table to show on the homepage (Site → Pricing).",
  },
  social_style: {
    label: "How the icons are drawn",
    hint: "Flip tiles spell the word below and turn into the icons when somebody points at them; phones and touch screens show the icons straight away.",
  },
  social_flip_word: {
    label: "Word on the flip tiles",
    placeholder: "FOLLOW",
    hint: "Up to seven letters or digits, one per tile — CONTACT fits. A letter past the last profile gets a tile of its own that is not a link; a profile past the end of the word shows its network's initial.",
  },
  google_analytics_id: {
    label: "Google Analytics (GA4)",
    hint: "The measurement ID, which starts with G-. Leave blank to load nothing.",
    placeholder: "G-XXXXXXXXXX",
  },
  google_tag_manager_id: {
    label: "Google Tag Manager",
    hint: "Container ID. If GTM already loads Analytics for you, leave the GA4 field blank — setting both double-counts every pageview.",
    placeholder: "GTM-XXXXXXX",
  },
  google_site_verification: {
    label: "Google site verification",
    hint: "The content value from the meta tag Search Console gives you, not the whole tag.",
  },
  meta_pixel_id: {
    label: "Meta Pixel",
    hint: "Optional. The numeric Pixel ID from Events Manager.",
    placeholder: "1234567890123456",
  },
  meta_domain_verification: {
    label: "Meta domain verification",
    hint: "The content value from the meta tag Business Manager gives you.",
  },
  cookie_consent_enabled: {
    label: "Ask for consent",
    hint: "1 to require consent before any analytics loads, 0 to load it for everyone. With this off, the tags fire for every visitor.",
  },
  cookie_consent_title: { label: "Banner heading" },
  cookie_consent_message: { label: "Banner text", hint: "Placeholder copy — replace it with wording your legal adviser is happy with." },
  cookie_consent_accept_label: { label: "Accept button" },
  cookie_consent_reject_label: { label: "Decline button" },
  cookie_consent_policy_url: { label: "Policy link", hint: "Where “Read more” goes. Leave blank to hide the link.", placeholder: "/privacy" },
  smtp_host: { label: "SMTP host", placeholder: "smtp.example.com" },
  smtp_port: { label: "Port", placeholder: "587" },
  smtp_username: { label: "Username" },
  smtp_password: { label: "Password", hint: "Leave blank to keep the current one." },
  smtp_encryption: { label: "Encryption", hint: "tls, ssl, or none." },
  mail_from_address: { label: "From address", placeholder: "support@technoware.in" },
  mail_from_name: { label: "From name", placeholder: "Technoware Support" },
  openai_api_key: { label: "OpenAI API key", hint: "Stored for future use. Nothing on the site calls it yet." },
  gsc_service_account: {
    label: "Search Console service account (JSON key file)",
    hint: "Optional. In Google Cloud make a service account, download its JSON key and paste the whole file here; then in Search Console add the account's email to the property as a user. With one saved, the SEO overview shows each page's clicks, impressions and position for the last 28 days, can list the pages shown but never opened, and the assistant is told what a page already ranks for. Encrypted, never shown again.",
  },
  gsc_site_url: {
    label: "Search Console property",
    hint: "As Search Console names it: sc-domain:technoware.in for a domain property, or the exact URL prefix for a URL property. Leave blank to use the site's own domain.",
    placeholder: "sc-domain:technoware.in",
  },
  ga4_property_id: {
    label: "Google Analytics 4 property id",
    hint: "Optional. The number under Admin → Property details in GA4 (not the G- measurement id). Uses the Search Console service account above — add its email to the property as a Viewer. With one saved, the SEO overview shows each page's views and users for the last 28 days and can list the pages search shows that nobody opens, and the store dashboard shows product views against orders. Read only; nothing is written to Google.",
    placeholder: "123456789",
  },
  hunter_api_key: {
    label: "Hunter.io API key",
    hint: "Optional. With one saved, new subscriber addresses are checked a few at a time overnight and tagged Verified, Risky, Invalid or Disposable. Invalid and disposable addresses are left off every campaign; nothing is added to the do-not-mail list.",
  },
  hunter_monthly_cap: {
    label: "Hunter verifications per month",
    hint: "Your plan's allowance. The nightly check spreads what is left over the rest of the month and never goes past it, and asks Hunter for its own figure first. 0 pauses checking without removing the key.",
    placeholder: "100",
  },
  hero_kicker: { label: "Hero badge", hint: "The small pill above the headline." },
  hero_heading: { label: "Hero headline", hint: "The last word is shown in the brand colour." },
  hero_lede: { label: "Hero paragraph" },
  hero_stats: {
    label: "Hero statistics",
    hint: "The figures under the homepage heading. Four fit the row. These are currently invented figures \u2014 replace them before launch.",
  },
  support_stats: {
    label: "Support statistics",
    hint: "Shown in the support band lower down the homepage. Also invented.",
  },
  stats_animation: {
    label: "Figure animation",
    hint: "How the figures arrive the first time they scroll into view. Visitors who have asked their device for less motion see them still.",
  },
  stats_colour: {
    label: "Figure colour",
    hint: "The colour of every statistic's figure, on the hero and the support band. Blank uses the brand colour from Colour palette. A chosen colour is adjusted where it has to be to stay readable on the page and on the dark band.",
  },
  stats_size: {
    label: "Figure size",
    hint: "How large the figures are drawn.",
  },
  why_kicker: { label: "Why block kicker", hint: "The small line above the heading of the \"Why Technoware\" block, lower down the homepage." },
  why_heading: { label: "Why block heading" },
  why_lede: { label: "Why block paragraph" },
  why_steps: {
    label: "The steps",
    hint: "Numbered in the order shown here — assess, design, deploy, support, or whatever the process is. Four fit the column.",
  },
  testimonial_enabled: { label: "Show the testimonial", hint: "1 shows the pull-quote beside the steps; 0 hides the block. A blank quote with it on shows the built-in one." },
  testimonial_quote: { label: "Testimonial", hint: "The pull-quote beside the steps." },
  testimonial_author: { label: "Testimonial author", hint: "The initials on the disc are taken from this name." },
  testimonial_role: { label: "Testimonial role", placeholder: "IT Manager, Company" },
  amc_heading: { label: "AMC card heading" },
  amc_enabled: { label: "Show the AMC card", hint: "1 shows the card under the testimonial; 0 hides it." },
  amc_inclusions: { label: "AMC card list", hint: "One line each." },
  amc_link_label: { label: "AMC card link text" },
  amc_link_href: { label: "AMC card link", hint: "A path on this site, or a full address.", placeholder: "/solutions/amc" },
};

export const GROUP_TITLES: Record<string, { title: string; blurb: string }> = {
  general: { title: "General", blurb: "Company identity, used across the site and in structured data." },
  contact: { title: "Contact", blurb: "Shown in the header bar, the footer and on the contact page." },
  homepage: {
    title: "Homepage",
    blurb: "The hero and the figures beneath it. The statistics seeded here are invented placeholders — they must be replaced or removed before launch.",
  },
  social: {
    title: "Social profiles",
    blurb: "Full URLs. Leave one blank and its icon disappears from the footer — better than linking to a profile that does not exist. Below them, how the row of icons is drawn.",
  },
  appearance: {
    // "Colour palette" since 2026-09-16, when the site gained Themes (Site →
    // Themes): two things called "theme" one screen apart would be the drift.
    // The setting keys keep their `theme_*` names.
    title: "Colour palette",
    blurb: "The site's colours and type. One choice, applied everywhere — the public site, the customer portal and this console. Which layout the site uses is Site → Themes.",
  },
  login: {
    title: "Sign-in screen",
    blurb: "What sits beside the sign-in, registration and password forms \u2014 staff and customer alike. A photograph, or one of eight animations drawn in the site's own colours, with how much of it and how fast. Hidden on phones, where the form takes the whole screen; still for visitors who have asked their device for less motion.",
  },
  motion: {
    title: "Motion",
    blurb: "How the public site and the customer portal move: how sections arrive, what a button does under the pointer, how one page gives way to the next, what shows while it loads, and what sits behind a heading. The console keeps its own, quieter motion whatever is chosen here. Visitors who have asked their device for less motion get none of it.",
  },
  announcement: {
    // "Info bar" is the client's name for it; the settings keep `announcement_*`.
    // Drawn on its own screen, `/admin/info-bar`, never in the settings strip.
    title: "Info bar",
    blurb: "A strip above the header on every public page — a sale, an opening, a holiday closure. One line of your own words on a colour you choose, still or scrolling, with dates if it should switch itself off.",
  },
  banners: {
    title: "Page banners",
    blurb: "The picture behind a page's heading. One per section, and a default for any section left blank — leave the lot empty and every heading renders on plain ground, as it did before banners existed. The picture is dimmed automatically so the words stay legible over it, so pick for composition rather than for brightness.",
  },
  newsletter: {
    title: "Newsletter",
    blurb: "Who campaigns come from, what the footer says, and how fast they go out. The postal address is not optional — a campaign without one is refused before it sends.",
  },
  seo: { title: "SEO defaults", blurb: "Fallbacks for pages with no override of their own." },
  leads: {
    title: "Leads",
    blurb: "How an enquiry is scored on arrival. The built-in list of buying words is tuned for hardware procurement in India — tender, PO, AMC, quotation — and this extends it once real enquiries have been read for a while. A score is taken at intake and not rewritten; `php artisan technoware:rescore-leads --write` restates the whole table on the current words.",
  },
  chatbot: {
    title: "Website assistant",
    blurb: "The chat panel on the public site: what it is called, when it appears, what it asks a visitor before it answers, and the ceilings that bound the bill.",
  },
  analytics: {
    title: "Analytics",
    blurb: "Each loads only when its ID is filled in, and only on the public site — never inside this console or the customer portal. Consent gating is on by default; see the section below.",
  },
  consent: {
    title: "Cookie consent",
    blurb: "The banner shown before any analytics loads. It only appears when at least one analytics ID is set, because with none configured no cookie is ever placed and asking would be meaningless. The wording below is a starting point, not legal advice.",
  },
  mail: {
    title: "Outgoing mail",
    blurb: "Choose how mail leaves the site, then send a test to prove it. Leave the transport unset to keep using whatever the server's own configuration says. Every credential here is encrypted and none is ever shown again once saved.",
  },
  payments: {
    title: "Payments",
    blurb: "How the shop takes money, and the one thing that has to be done in the gateway's own dashboard. Every credential here is encrypted and none is ever shown again once saved.",
  },
  store: {
    title: "Store",
    blurb: "Whether the shop is open, which is a different question from whether a gateway is configured — the first is a decision, the second is a deployment that is not finished.",
  },
  store_reminders: {
    title: "Basket reminders",
    blurb: "Up to two emails to somebody who left something in their basket, the second of which may carry a discount code. The wording is under Settings → Email templates. The dashboard counts a basket as recovered when it became an order after a reminder.",
  },
  indexnow: {
    title: "IndexNow",
    blurb: "Tells Bing, Yandex and the other IndexNow engines the moment a page is published, changed or removed, instead of waiting for a crawl — Bing's index is what Copilot and ChatGPT search read. Off until launch: the site's public address is pinned to production on every machine, so a ping from anywhere else would name pages that are not there yet. The key is minted on first use and is public by the protocol's design.",
  },
  embeds: {
    title: "Embeds",
    blurb: "Third-party code the public site carries: the Google reviews widget, and a snippet a vendor asks you to paste before the closing body tag. Public pages only; never the console or the portal.",
  },
  integrations: {
    title: "API keys",
    blurb: "Encrypted, never returned to this screen, and never sent to the public site.",
  },
  /*
    Keyed `portal`, which is the group the settings table actually uses.

    It was keyed `support` and had been for long enough that the tab rendered
    as the raw string "portal", in lowercase, at the end of the strip — the
    group was renamed and this was not, so a perfectly good title sat here
    unread while the screen showed a database key. Nothing failed: an unknown
    group falls back to `{ title: group }`, which is a sensible default and a
    silent one.
  */
  /*
    The support mailbox tickets are read from. Drawn by TicketsPanel, so
    nothing here is a per-field label; the blurb is what the tab says before
    the switch.
  */
  tickets: {
    title: "Email to ticket",
    blurb: "Off by default. Switched on, a mailbox is read once a minute: each new message opens a ticket, the sender gets the acknowledgement with the reference, and the desk is told — exactly as for a ticket raised in the portal. A reply that quotes the reference lands on the ticket. The desk's own notifications landing in this mailbox, out-of-office replies, bounces and mailing lists are recognised and skipped.",
  },
  portal: {
    title: "Customer portal",
    blurb: "Whether the portal is open, whether anybody may register through it, and whether a new account waits for somebody to approve it.",
  },
  blog: {
    title: "Blog",
    blurb: "Comments are off site-wide by default — switching them on puts a public form on every article and a moderation queue on somebody's desk. Closing them after a number of days is the anti-spam measure that costs a real reader nothing, because an old article is where spam collects and there is no conversation left to interrupt.",
  },
  security: {
    title: "Data retention",
    blurb: "How long each kind of record is kept before the nightly prune deletes it. Every one has a floor enforced in the command as well, so a typo here cannot destroy a trail — and the activity log is append-only by design, which makes its retention the only thing that removes a row.",
  },
  media: {
    title: "Media",
    blurb: "How hard the library compresses the images it makes — a resize, a crop, a thumbnail, a rotate. Uploads are stored exactly as they arrive, because re-encoding an original throws away quality nobody can get back, and it is the only copy there is. Changing this affects images edited from now on; it does not go back and re-encode what is already there.",
  },
  auth: {
    title: "Sign-in",
    blurb: "How people get in. A one-time code by email is the default for both the portal and this console; passwords remain available behind a link. Leave passwords on unless you are certain outgoing mail is reliable — with codes as the only way in, a broken mail configuration locks out every account, including yours.",
  },
};

/**
 * Field order within a group.
 *
 * The API returns settings sorted by key, which is alphabetical and therefore
 * meaningless: on General it put the favicon between the company name and the
 * tagline. Anything not listed keeps its API position, after the listed ones.
 */
export const FIELD_ORDER: Record<string, string[]> = {
  general: ["company_name", "tagline", "logo_path", "favicon_path", "console_notice_seconds"],
  login: ["login_backdrop", "login_intensity", "login_speed", "login_image_path", "login_message"],
  seo: ["default_meta_description", "default_og_image", "landing_page_cap",
        "seo_ai_enabled", "seo_ai_model", "seo_ai_daily_cap",
        "seo_ai_business_type", "seo_ai_audience", "seo_ai_locations", "seo_ai_context"],
  banners: ["banner_enabled", "banner_default_path", "banner_solutions_path", "banner_products_path",
            "banner_services_path", "banner_industries_path", "banner_store_path", "banner_support_path",
            "banner_resources_path", "banner_company_path"],
  contact: ["phone", "support_email", "sales_email", "address", "map_embed_url", "map_link"],
  /*
    Read as a sequence somebody sets up in order: switch it on, name it, decide
    how it introduces itself, decide whether it appears by itself, decide what
    it asks, decide where a conversation can be carried on, then the ceilings.
    Alphabetical put the daily cap second.
  */
  chatbot: ["chatbot_enabled", "chatbot_name", "chatbot_show_name", "chatbot_colour", "chatbot_icon", "chatbot_font_size", "chatbot_background", "chatbot_animation",
            "chatbot_welcome", "chatbot_fallback",
            "chatbot_quick_actions", "chatbot_auto_open", "chatbot_auto_open_delay",
            "chatbot_intake_enabled", "chatbot_smart_intake", "chatbot_intake_questions",
            "chatbot_whatsapp_number", "chatbot_forward_unanswered",
            "chatbot_model", "chatbot_max_message_chars", "chatbot_max_messages",
            "chatbot_context_messages", "chatbot_daily_reply_cap", "chat_retention_days"],
  homepage: ["hero_kicker", "hero_heading", "hero_lede", "hero_stats", "support_stats", "stats_colour", "stats_size", "stats_animation", "home_stats_block", "home_stack_block", "home_pricing_block",
             "why_kicker", "why_heading", "why_lede", "why_steps",
             "testimonial_enabled", "testimonial_quote", "testimonial_author", "testimonial_role",
             "amc_enabled", "amc_heading", "amc_inclusions", "amc_link_label", "amc_link_href"],
  mail: ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_encryption",
         "mail_from_address", "mail_from_name"],
  integrations: ["openai_api_key", "hunter_api_key"],
  /*
    Read as the order somebody sets a newsletter up: the two switches, who it
    comes from, what the footer says, how it is delivered, then the Hunter
    allowance beside the delivery figures it is spent alongside. Alphabetical
    put the Hunter cap first, above the sender's own name.
  */
  newsletter: ["newsletter_signup_enabled", "newsletter_tracking_enabled",
               "newsletter_company", "newsletter_from_name", "newsletter_from_email", "newsletter_reply_to",
               "newsletter_address", "newsletter_footer_text",
               "newsletter_batch_size", "newsletter_batch_delay", "hunter_monthly_cap",
               "newsletter_webhook_secret"],
  consent: ["cookie_consent_enabled", "cookie_consent_title", "cookie_consent_message",
            "cookie_consent_accept_label", "cookie_consent_reject_label", "cookie_consent_policy_url"],
  /*
    The plain-grid groups below were unlisted until 2026-09-20 and drew in
    the API's alphabetical order — which also kept every one of their fields
    out of the command palette, since `settingsPages()` lists fields from
    here. The seeder's own order, which is the order somebody wrote them in.
  */
  social: ["social_linkedin", "social_facebook", "social_x", "social_instagram", "social_youtube", "social_whatsapp", "social_reddit", "social_style", "social_flip_word"],
  blog: ["blog_video_url", "comments_enabled", "comments_closed_after_days"],
  indexnow: ["indexnow_enabled", "indexnow_key"],
  media: ["image_quality", "media_max_kb", "media_max_video_kb", "media_max_megapixels"],
  store: ["store_enabled", "digital_auto_fulfil", "activation_procedure", "activation_pdf_path", "store_shipping_paise",
          "store_handling_days", "store_shipping_service", "store_transit_days_min", "store_transit_days_max", "store_return_days",
          "store_price_drop_min_percent"],
  store_reminders: ["store_cart_reminders_enabled", "store_cart_reminder_1_hours", "store_cart_reminder_2_days", "store_cart_reminder_coupon"],
  leads: ["lead_intent_words"],
  embeds: ["reviews_embed", "reviews_kicker", "reviews_heading", "reviews_lede", "body_code"],
  portal: ["portal_enabled", "registration_enabled", "customer_approval_required"],
  auth: ["default_login_method", "otp_login_enabled", "otp_admin_login_enabled", "password_login_enabled"],
  analytics: ["google_analytics_id", "google_tag_manager_id", "google_site_verification", "meta_pixel_id", "meta_domain_verification"],
  security: ["activity_retention_days", "application_retention_days", "chat_retention_days", "client_error_retention_days",
             "comment_retention_days", "seo_ai_retention_days"],
};

/**
 * Rows the verifier writes and nobody types.
 *
 * `newsletter_verify_error` is the `mail_error` pattern — a banner on the
 * Verification screen, cleared by the next success — and the last-run stamp
 * is a fact about the deployment. Both are settings so they survive a cache
 * clear, and both would render here as bare text inputs somebody could
 * "correct"; the Verification screen is where they are read.
 */
export const HIDDEN = new Set([
  "newsletter_verify_error", "newsletter_verify_last_run", "gsc_error", "ga4_error", "inbound_mail_error", "inbound_mail_last_run",
  // The consent a mailbox scan spends, written by the import screen and forgotten by the job.
  "newsletter_oauth_provider", "newsletter_oauth_refresh_token", "newsletter_oauth_account", "newsletter_oauth_connected_at", "newsletter_oauth_error",
]);

/**
 * Which screen draws each settings group, and the order of everything.
 *
 * **One list, because the alternative is two that have to agree.** The
 * sidebar's Settings rows, each screen's tabs, the command palette's entries
 * and `sectionFor()` are all derived from this, so a group cannot be filed
 * under one screen and linked from another — the drift that gave this
 * project `admin_path` in the API's resource names and `schema_type_options`
 * written out twice.
 *
 * **Settings holds only what is common to the whole console** (the client's
 * rule, 2026-09-20): identity, the two sign-in doors, the infrastructure that
 * every module shares, retention. Everything a module owns is a "Settings"
 * screen at the end of that module's sidebar section — Store → Settings holds
 * shipping and the gateway, SEO → Settings the defaults and IndexNow. Before
 * this the one screen held twenty-six tabs behind seven chips, and the
 * shipping charge sat beside the SMTP password.
 *
 * Every screen is the same component, `SettingsForm`, over the same
 * `GET /admin/settings` payload and the same save; only the groups drawn
 * differ. Keep each `path:` and each `groups: [...]` on one line —
 * `SettingsScreensTest` in `api/tests` reads them by regex, the way
 * `AdminNavRolesTest` reads the sidebar, and checks that every group the
 * seeder creates is drawn on exactly one screen.
 *
 * A screen with one group renders no tab strip; one with several renders
 * tabs, and `sections[].label` groups those tabs under a heading — only the
 * System screen uses it. Seven flat tabs measured one row at every width;
 * headings buy scanning, not space, and under ten tabs there is nothing to
 * scan for.
 *
 * **A group the API returns that is named nowhere here falls into "Other"**
 * on the System screen rather than vanishing into a tab labelled with its own
 * raw key — and `SettingsScreensTest` fails it by name, so the Other tab is a
 * safety net rather than a home. That rule is not hypothetical: `blog`,
 * `portal` and `security` had all arrived in the settings table since the
 * old list was last touched, and all three were rendering as lowercase keys
 * at the end of the strip.
 */
export type SettingsScreen = {
  /** The console path — the sidebar row's href and what the page looks up. */
  path: string;
  /** The `PageHeader` title and the tab's `<title>`. */
  title: string;
  /** The sidebar section it sits in, for the palette's group column. */
  area: string;
  lede: string;
  saveLabel: string;
  /** Status reads beyond `getSettings()` that a panel on this screen needs. */
  needs?: ("mail" | "inbound")[];
  /** The groups drawn, in order. A `label` puts a heading over those tabs. */
  sections: { label?: string; groups: string[] }[];
};

export const SCREENS: SettingsScreen[] = [
  {
    path: "/admin/settings",
    title: "Settings",
    area: "System",
    lede: "What the whole console shares: who the company is, how people sign in, how mail leaves, which keys the modules spend, and how long records are kept. Each module's own settings are at the end of its section in the sidebar.",
    saveLabel: "Save settings",
    needs: ["mail"],
    sections: [
      { label: "Identity", groups: ["general", "contact", "social"] },
      /*
        Both doors. The sign-in screen's picture and the code-or-password
        choice serve staff and customers alike, which is what keeps them
        here rather than under Customers.
      */
      { label: "Sign-in", groups: ["login", "auth"] },
      /*
        `integrations` holds the OpenAI, Hunter, Search Console and GA4
        credentials, spent by four modules between them — one credential for
        one provider, so it cannot be half-rotated — which is why it is not
        filed under SEO or the assistant.
      */
      { label: "Infrastructure", groups: ["mail", "integrations"] },
      { label: "Privacy", groups: ["security"] },
    ],
  },
  {
    path: "/admin/site/settings",
    title: "Site settings",
    area: "Site",
    lede: "How the public site looks and what it says on the front page: the homepage copy and figures, the palette, motion, the page banners, embedded code, and the analytics tags with the consent banner that gates them.",
    saveLabel: "Save site settings",
    sections: [
      { groups: ["homepage", "appearance", "motion", "banners", "embeds", "analytics", "consent"] },
    ],
  },
  {
    path: "/admin/blog/settings",
    title: "Blog settings",
    area: "Blog",
    lede: "The sidebar video and whether readers may comment.",
    saveLabel: "Save blog settings",
    sections: [{ groups: ["blog"] }],
  },
  {
    path: "/admin/media/settings",
    title: "Media settings",
    area: "Content",
    lede: "How hard the library compresses the images it makes, and how large an upload may be — read against what this server's PHP will actually accept.",
    saveLabel: "Save media settings",
    sections: [{ groups: ["media"] }],
  },
  {
    path: "/admin/seo/settings",
    title: "SEO settings",
    area: "SEO",
    lede: "The fallbacks a page without its own metadata uses, the AI assistant and its daily ceiling, and IndexNow.",
    saveLabel: "Save SEO settings",
    sections: [{ groups: ["seo", "indexnow"] }],
  },
  {
    path: "/admin/store/settings",
    title: "Store settings",
    area: "Store",
    lede: "Whether the shop is open, what delivery costs and how long it takes, how licences are handed over, the basket reminders, and how the shop takes money.",
    saveLabel: "Save store settings",
    sections: [{ groups: ["store", "store_reminders", "payments"] }],
  },
  {
    path: "/admin/newsletter/settings",
    title: "Newsletter settings",
    area: "Campaign",
    lede: "Who campaigns come from, what the footer says, how fast they go out, and the Hunter allowance.",
    saveLabel: "Save newsletter settings",
    sections: [{ groups: ["newsletter"] }],
  },
  {
    path: "/admin/leads/settings",
    title: "Scoring",
    area: "Leads",
    lede: "How an enquiry is scored on arrival — the buying words that mark a lead as hot.",
    saveLabel: "Save scoring",
    sections: [{ groups: ["leads"] }],
  },
  {
    path: "/admin/tickets/settings",
    title: "Email to ticket",
    area: "Tickets",
    lede: "A support mailbox read once a minute, every new message becoming a ticket. Off by default.",
    saveLabel: "Save mailbox settings",
    needs: ["inbound"],
    sections: [{ groups: ["tickets"] }],
  },
  {
    path: "/admin/customers/settings",
    title: "Portal",
    area: "Customers",
    lede: "Whether the customer portal is open, whether anybody may register through it, and whether a new account waits for approval.",
    saveLabel: "Save portal settings",
    sections: [{ groups: ["portal"] }],
  },
  {
    path: "/admin/chat/settings",
    title: "Assistant settings",
    area: "Assistant",
    lede: "What the website assistant is called, how it looks, what it asks before it answers, which model it uses and the ceilings that bound the bill.",
    saveLabel: "Save assistant settings",
    sections: [{ groups: ["chatbot"] }],
  },
];

/** Every group a screen draws, in screen order — the palette's order too. */
export const ORDER = SCREENS.flatMap((s) => s.sections.flatMap((x) => x.groups));

/** The System screen, where a group nothing claims is drawn under "Other". */
export const SYSTEM_SCREEN = "/admin/settings";

/**
 * Groups with a form of their own that is *not* `SettingsForm`: the info bar
 * (`/admin/info-bar`), the themes (`/admin/themes`) and the store's promo
 * band (`/admin/store/promo`). The first two are fetched with the rest — one
 * `GET /admin/settings` — and saved through the same action; the promo band
 * has an endpoint of its own so a store manager can reach it. Explicit rather
 * than "whatever no screen names", because a group somebody forgot would
 * then be silently standalone with nowhere to be edited.
 */
export const STANDALONE_GROUPS = new Set(["announcement", "themes", "store_promo", "store_tiles"]);

export function screenAt(path: string): SettingsScreen {
  const screen = SCREENS.find((s) => s.path === path);
  if (!screen) throw new Error(`No settings screen at ${path}`);
  return screen;
}

/** The screen a group is drawn on, or undefined for one nothing claims. */
export function screenFor(group: string): SettingsScreen | undefined {
  return SCREENS.find((s) => s.sections.some((x) => x.groups.includes(group)));
}

/** The heading a group's tab sits under on its screen, if the screen uses them. */
export function sectionFor(group: string): string | undefined {
  for (const screen of SCREENS) {
    const section = screen.sections.find((x) => x.groups.includes(group));
    if (section) return section.label;
  }
  return undefined;
}

/** Applies FIELD_ORDER, leaving unlisted keys in their API order at the end. */
export function orderFields(group: string, rows: SettingGroups[string]) {
  const order = FIELD_ORDER[group];
  if (!order) return rows;

  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };

  return [...rows].sort((a, b) => rank(a.key) - rank(b.key));
}
