# 25 — Using a CDN

A content delivery network (CDN) keeps copies of your website's files on
servers around the world and hands each visitor the nearest copy. It is
optional: the website works without one, and nothing here is switched on
until you do it.

There are two separate things a CDN can speed up, and they are set up
differently.

| What | How |
|---|---|
| Photographs, pages, scripts and styles | Put the **whole website** behind a CDN such as Cloudflare (part A) |
| Videos, documents and vector (SVG) logos | Either part A for the API's domain too, or a **media CDN address** in the console (part B) |

Photographs are in the first row because the website resizes each picture
for the screen asking for it, and serves the resized copy itself.

## Part A — the whole website behind Cloudflare

1. Add your domain to Cloudflare and switch its DNS records for the website
   (and, if you wish, the API's domain) to **Proxied**.
2. Set SSL/TLS to **Full (strict)**.
3. Switch these **off** — each one rewrites your pages and breaks them:
   - **Rocket Loader**
   - **Email Address Obfuscation**
   - any "minify" or "optimise HTML" option
4. Do **not** add a "cache everything" rule. The defaults are right:
   pictures, scripts and styles are cached and pages are not. If you add
   cache rules of your own, never include `/admin`, `/portal`, `/api`,
   `/checkout`, `/cart`, `/order`, `/visit`, `/meeting` or
   `/events/registration`.
5. Tell the website to read each visitor's own address from Cloudflare. Add
   this line to `config/web.env` in the folder you installed into, then
   restart the Node.js app:

   ```
   CLIENT_IP_HEADER=cf-connecting-ip
   ```

   Without it, everybody arriving through the same Cloudflare machine shares
   one sign-in limit: a few wrong passwords from one person can lock others
   out.
6. For that setting to be safe, your server should accept web traffic from
   Cloudflare only. Ask your host to restrict ports 80 and 443 to
   Cloudflare's address ranges, or use Cloudflare's "Authenticated Origin
   Pulls".
7. Open **System → Status** in the console. The **CDN** card should read
   *Behind Cloudflare* and *Visitors' own addresses are read from
   Cloudflare*. If it shows a warning in red, step 5 is not in effect.

## Part B — a media CDN address

Use this with a CDN that gives you a "pull zone": Bunny, Amazon CloudFront,
KeyCDN and others.

1. At the CDN, create a pull zone whose **origin** is your API's address
   (for example `https://api.example.com`).
2. Switch on the option to **vary the cache by query string** (Bunny: "Query
   String Vary"; CloudFront: include query strings in the cache key). This is
   what lets a replaced file show at once.
3. Note the address the CDN gives you, or attach a subdomain of your own
   such as `cdn.example.com`. It must be `https`.
4. In the console open **Content → Media settings → CDN**, enter that address
   in **CDN address** and press **Save media settings**.
5. Press **Test the CDN**. It fetches one of your files through the CDN and
   checks it is the same file your server holds. Fix whatever it reports
   before going on.
6. Tick **Serve files from the CDN** and save.

To stop using it, untick the box and save. Every file is served from your own
server again immediately, and the address is kept for next time.

## Things to know

- Your files stay on your own server. A CDN keeps copies; it is not storage
  and not a backup.
- When you crop, resize, rotate or replace a picture, its web address
  changes, so visitors and the CDN get the new version at once. You do not
  need to "purge" anything.
- The console, the customer portal, order pages and private files (ticket
  attachments, CVs, invoices) never go through the media CDN.
- If pages look broken after switching a CDN on, check step 3 of part A
  first.
