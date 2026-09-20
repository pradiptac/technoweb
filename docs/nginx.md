# Deploying behind nginx

The application does not care which web server fronts it: the site is a Node
process on a port, the API is PHP-FPM behind a front controller. What *does*
care is `api/public/.htaccess` — ninety lines that nginx never reads — so
under nginx the four rules it carries have to be restated in the server block
or they are silently gone: `nosniff` on everything the API serves, the
`sandbox` policy on `.svg`, the year-long cache on uploads, and compression of
JSON. Everything below is those rules, plus the three things nginx does
differently enough to be worth a paragraph each.

Two blocks, one per domain. Adjust the paths, the PHP-FPM socket and the
certificate lines to the machine; nothing else is machine-specific.

---

## `api.technoware.in` — Laravel behind PHP-FPM

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.technoware.in;

    # ssl_certificate     /etc/letsencrypt/live/api.technoware.in/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/api.technoware.in/privkey.pem;

    # The document root is public/, never api/. Anything above it — .env, the
    # private disk with ticket attachments and CVs — must not be reachable.
    root /var/www/technoweb/api/public;
    index index.php;

    server_tokens off;
    charset utf-8;

    # Uploads. nginx's default is 1m, and it answers 413 before PHP sees a
    # byte, so every image over a megabyte would fail with a page the
    # console cannot explain. The effective limit is the *minimum* of this,
    # php.ini's `upload_max_filesize`/`post_max_size`, and the `media_max_kb`
    # setting — keep this the largest of the three so the others decide.
    # A ticket reply is five attachments at 10MB.
    client_max_body_size 64m;

    # The nosniff rule, for everything: the API's own JSON included. Without
    # it a browser may re-classify a file by its bytes, which is how a
    # text-ish upload holding markup becomes a document. `always` so it is
    # sent on 4xx/5xx too.
    #
    # ** nginx trap #1: `add_header` does not inherit. ** A location block
    # that sets any add_header of its own drops every add_header from the
    # levels above it. So this line is repeated in each location below that
    # adds a header — leaving it out of one is a location that serves
    # without nosniff and nothing warns.
    add_header X-Content-Type-Options "nosniff" always;

    # Compress what Apache's mod_deflate compressed. text/html is always in
    # nginx's list; the rest is the API's JSON, the sitemap's XML, and SVG.
    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types application/json text/plain text/xml application/xml image/svg+xml;

    # Dotfiles and environment files: never served. (Apache: <FilesMatch "^\.">)
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Nothing under /storage may execute, however it got there. The media
    # upload is an allowlist and the SVG sanitiser runs on write, so this is
    # the half that holds if either is ever wrong.
    location ~* ^/storage/.*\.php$ {
        deny all;
    }

    # An SVG is a document, so one opened directly is sandboxed: no scripts,
    # no forms, a unique origin. It costs an <img> embed nothing. Scoped to
    # the extension rather than to /storage/ because the same policy on a
    # PDF stops Chrome's viewer rendering it inline. Cache and nosniff
    # restated here because of trap #1.
    location ~* \.svg$ {
        try_files $uri =404;
        add_header Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; sandbox" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
        expires 1y;
    }

    # Uploads are immutable at their address: hashed names, and an in-place
    # edit versions the URL with ?v=<updated_at>. A browser may keep one for
    # a year and never re-validate. JSON is deliberately not in this list.
    location ~* \.(jpe?g|png|gif|webp|avif|woff2?|pdf|mp4|webm)$ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        expires 1y;
        access_log off;
    }

    # A trailing slash on something that is not a directory redirects
    # without it, as .htaccess does — one URL per resource.
    location / {
        if (!-d $request_filename) {
            rewrite ^/(.+)/$ /$1 permanent;
        }
        try_files $uri $uri/ /index.php?$query_string;
    }

    # The front controller. Only index.php exists under public/, and the
    # deny above keeps anything under /storage from reaching here.
    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        include fastcgi_params;
        # $realpath_root, not $document_root, so a deploy that swaps a
        # symlinked release directory is picked up without a reload.
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        fastcgi_hide_header X-Powered-By;
        fastcgi_read_timeout 120s;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name api.technoware.in;
    return 301 https://$host$request_uri;
}
```

**The `Authorization` header is not a problem here.** Apache strips it unless
`.htaccess` puts it back; nginx hands every request header to PHP-FPM as
`HTTP_*` without being asked, so `Authorization: Bearer …` reaches Laravel as
`HTTP_AUTHORIZATION`. The check is the same one API.md opens with: an
unauthenticated `GET /api/v1/admin/auth/me` with `Accept: application/json`
must answer **401** JSON. A 500 mentioning `Route [login] not defined` means
the header, or the Accept header, did not arrive.

**`php artisan storage:link` still applies**, and nginx follows the symlink
`public/storage → storage/app/public` by default (`disable_symlinks off`).
If the panel or a hardening guide has set `disable_symlinks if_not_owner`,
the link and its target must share an owner or every upload 404s.

---

## `www.technoware.in` — Next.js behind a reverse proxy

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.technoware.in technoware.in;

    # ssl_certificate     /etc/letsencrypt/live/www.technoware.in/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/www.technoware.in/privkey.pem;

    server_tokens off;

    # Uploads pass through Next's route handlers on their way to the API
    # (`lib/proxy-upload.ts`), so this ceiling has to be at least the API's.
    client_max_body_size 64m;

    # Stream a multipart body straight through rather than spooling it to
    # disk first. Not required — the browser's progress bar measures bytes
    # sent to nginx either way — but with buffering on, a 40MB upload sits
    # in a temp file before Next sees the first byte, and "Processing…" at
    # 100% lasts that much longer.
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # ** nginx trap #2: the forwarded host. ** `proxy.ts` decides the
        # canonical-host redirect from `x-forwarded-host` before `host`, and
        # builds the redirect with hostname and port set separately — so the
        # internal `127.0.0.1:3000` never leaks into a Location header. That
        # only holds if these headers are set; without X-Forwarded-Host the
        # proxy compares the wrong name and every request 301s to itself.
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP         $remote_addr;

        # Harmless in production; needed only if `next dev` is ever fronted
        # by this block (its HMR socket).
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 120s;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name www.technoware.in technoware.in;
    return 301 https://$host$request_uri;
}
```

**nginx trap #3: do not add security headers to the site block.** It is
tempting to put `X-Frame-Options`, a `Content-Security-Policy` or
`X-Content-Type-Options` here as a matter of hygiene. Next already sends
them, per route, from `next.config.ts`: the CSP is split into an enforced
half and a Report-Only half that `npm run audit` checks, and `/embed/*`
deliberately drops `X-Frame-Options` and carries `frame-ancestors *` so a
form can be framed on a partner's site. A second CSP from nginx is
**intersected** with Next's, not overridden by it, so a blanket
`frame-ancestors 'self'` here silently breaks every embed and reads as
correct. Let Next own the headers on this domain; nginx owns them on the
API's.

`CANONICAL_HOST`, `NEXT_PUBLIC_SITE_URL` and `FRONTEND_URL` still have to
agree with each other exactly as the README says — nginx changes nothing
about that. The bare `technoware.in` is listed in `server_name` so it
reaches the proxy and is redirected by `proxy.ts` to whichever form
`CANONICAL_HOST` names; doing that redirect in nginx instead is fine and
faster, as long as it sends people to the same host the canonicals name.

---

## Check it, do not assume it

Every one of these is a line in `.htaccess` that nginx would drop without
saying so. Run them after any change to either block.

```bash
# nosniff on the API's own JSON, and on an upload
curl -sI https://api.technoware.in/api/v1/ | grep -i x-content-type-options
curl -sI https://api.technoware.in/storage/media/seed/brands/cisco.svg | grep -i x-content-type-options

# the sandbox policy on an SVG — and NOT on a PDF
curl -sI https://api.technoware.in/storage/media/seed/brands/cisco.svg | grep -i content-security-policy
curl -sI https://api.technoware.in/storage/<some>.pdf | grep -ic content-security-policy   # expect 0

# a year, immutable, on a raster upload; nothing of the kind on JSON
curl -sI https://api.technoware.in/storage/media/<some>.jpg | grep -i cache-control
curl -sI https://api.technoware.in/api/v1/settings | grep -ic immutable                   # expect 0

# JSON is compressed
curl -sI -H 'Accept-Encoding: gzip' https://api.technoware.in/api/v1/settings | grep -i content-encoding

# the Authorization header reaches Laravel: 401 JSON, never a 500
curl -si -H 'Accept: application/json' https://api.technoware.in/api/v1/admin/auth/me | head -1

# nothing above public/ is reachable
curl -sI https://api.technoware.in/.env | head -1                                         # 403 or 404

# the body limit: a 20MB post must not be a 413 from nginx
head -c 20000000 /dev/zero > /tmp/big.bin
curl -s -o /dev/null -w '%{http_code}\n' -F 'file=@/tmp/big.bin' https://api.technoware.in/api/v1/admin/media   # 401, not 413

# the site: one redirect, to the canonical host, with no :3000 in it
curl -sI http://technoware.in/ | grep -i location
curl -sI https://www.technoware.in/ | grep -i location                                    # expect nothing

# Next's own headers survive the proxy, and the embed route's exception with them
curl -sI https://www.technoware.in/ | grep -i 'content-security-policy\|x-frame-options'
curl -sI https://www.technoware.in/embed/forms/<slug> | grep -i 'x-frame-options'         # expect nothing (a form with embed_enabled on)
```

The last pair is the one to believe over any config review: a header that is
right in the file and wrong on the wire is what trap #1 produces, and only a
request shows it.
