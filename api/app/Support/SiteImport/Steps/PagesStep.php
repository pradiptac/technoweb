<?php

namespace App\Support\SiteImport\Steps;

use App\Enums\PublishStatus;
use App\Models\BlogPost;
use App\Models\ContentType;
use App\Models\Page;
use App\Models\Product;
use App\Models\Setting;
use App\Models\WordPressImportMapping;
use App\Support\HtmlSanitiser;
use App\Support\PageSections\SectionRules;
use App\Support\ReservedSlugs;
use App\Support\Revisions;
use App\Support\SiteImport\AiSections;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\Decisions;
use App\Support\SiteImport\PageKind;
use App\Support\SiteImport\PageReader;
use App\Support\SiteImport\Paths;
use App\Support\WordPress\Harvest;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Parts;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\RenderedSections;
use App\Support\WordPress\Seo;
use DOMText;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Each harvested page as a **draft** builder page.
 *
 * The page's own content — its body with the site's chrome (header, menu,
 * footer) taken away — is walked by `RenderedSections` with the generic
 * recognisers added (`siteRecognisers()`): a hero, a picture beside words,
 * a grid of cards, statistics, questions, a quote, a call to action, a form,
 * a map, a video; everything else gathers into text sections, split at the
 * main headings — and a text section with enough words and shape to be more
 * than prose is offered to the AI (`AiSections`) when the review allows it.
 * Each must pass its section's rules or it stays text, so nothing is lost
 * and nothing invalid is stored.
 *
 * **This step is also where every page is sorted** (0.164.0): it reads each
 * page, settles what it is (`PageKind`, then the review's say-so) and notes
 * it in `Context::kinds`. A page that is a blog post or a catalogue product
 * is handed on — `PostsStep` and `ProductsStep` extend this class, take the
 * records of their kind and write a `BlogPost` or a `Product` from the same
 * sections.
 *
 * A page's address becomes its slug (`/services/web-design` →
 * `services-web-design`) and the old address is redirected by the redirects
 * step. A slug is never changed on a second run; a record edited here since
 * it was imported is left as it is (`edited()`).
 */
class PagesStep extends Step
{
    /** The map's type for the fingerprint of what the import last wrote to a record. */
    public const HASH = 'page_hash';

    public function key(): string
    {
        return 'pages';
    }

    public function label(): string
    {
        return 'Pages';
    }

    public function mapType(): ?string
    {
        return 'page';
    }

    /** The kind of record this step writes. */
    protected function kind(): string
    {
        return PageKind::PAGE;
    }

    /** @return class-string<Page|BlogPost|Product> */
    protected function modelClass(): string
    {
        return Page::class;
    }

    /** The slug an old address would like. */
    protected function wantedSlug(string $path): string
    {
        return Paths::slug($path);
    }

    protected function slugTaken(string $slug): bool
    {
        return Page::query()->where('slug', $slug)->exists() || ReservedSlugs::reserved($slug) || ContentType::query()->where('slug', $slug)->exists();
    }

    /**
     * The read page, readied for this kind of record.
     *
     * @param  array<string, mixed>  $read
     * @return array<string, mixed>
     */
    protected function prepare(array $read): array
    {
        return $read;
    }

    /**
     * What the AI may place on this kind of record: sections of an ordinary
     * page only. An article is prose, and a product's words are its
     * description — neither is for a model to re-lay-out.
     */
    protected function assistant(Context $ctx): ?AiSections
    {
        return $ctx->ai();
    }

    public function records(Context $ctx): iterable
    {
        foreach (Harvest::read($ctx->import, 'pages') as $record) {
            // The pages step sees every page and sorts it; the others take their own.
            if ($this->kind() === PageKind::PAGE || ($ctx->kinds[(string) $record['path']]['kind'] ?? null) === $this->kind()) {
                yield $record;
            }
        }
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $path = (string) $record['path'];
        $read = $this->read($ctx, $record);
        $label = $read['title'] !== '' ? $read['title'] : ($read['h1'] !== '' ? $read['h1'] : $path);

        if ($this->kind() === PageKind::PAGE) {
            $kind = $this->sort($ctx, $path, $read);

            if ($kind === PageKind::SKIP) {
                return $this->row($ctx, $path, $label, Outcome::skip($label, 'Left out in the review.'));
            }

            // A post or a product: the step for it writes it and shows its row.
            if ($kind !== PageKind::PAGE) {
                return Outcome::delegated($label);
            }
        }

        if ($read['text'] === 0 && ! str_contains($read['html'], '<img')) {
            return $this->row($ctx, $path, $label, Outcome::skip($label, 'Has nothing on it once the site\'s header, menu and footer are taken away.'));
        }

        $existing = $ctx->map->model($this->mapType() ?? 'page', $path, $this->modelClass());
        $outcome = Outcome::upsert($existing !== null, $label, [
            'path' => $path,
            'title' => $label,
            'existing' => $existing?->getKey(),
            'keep' => $existing !== null && $this->edited($ctx, $existing, $path),
        ]);

        if ($existing === null) {
            $wanted = $this->wantedSlug($path);
            $slug = $this->freeSlug($wanted);
            $outcome->data['slug'] = $slug;

            if ($slug !== $wanted) {
                $outcome->warn('Its address was already used here, so it was given the next free one.');
            }
        }

        if ($outcome->data['keep']) {
            $outcome->warn('Edited here since it was imported, so it is left as it is.');
        } else {
            // A dry pass: nothing fetched or created, the parts counted, and what came across named.
            [$rows, , $ai] = $this->layout($ctx, $read, $label, $path, writes: false);
            $outcome->data['sections'] = count($rows);
            $outcome->data['ai'] = $ai;
            $outcome->data['types'] = array_count_values(array_map(fn (array $r) => (string) $r['type'], $rows));

            if ($rows === []) {
                return $this->row($ctx, $path, $label, Outcome::skip($label, 'Has nothing on it once the site\'s header, menu and footer are taken away.'));
            }

            $this->warnings($ctx, $outcome, $read);
        }

        if ($ctx->dryRun && $read['og_image'] !== null) {
            $ctx->planMedia($read['og_image'], $label);
        }

        return $this->row($ctx, $path, $label, $outcome);
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        if ($outcome->data['keep']) {
            return;
        }

        $path = (string) $record['path'];
        $label = $outcome->label;
        $read = $this->read($ctx, $record);
        [$rows] = $this->layout($ctx, $read, $label, $path, writes: true);
        // `normalise()` leaves objects where a section keeps a map; the records read the blocks as arrays.
        $blocks = json_decode((string) json_encode(SectionRules::normalise($rows)), true);

        $model = $outcome->data['existing'] ? $this->modelClass()::query()->find((int) $outcome->data['existing']) : null;
        $model ??= new ($this->modelClass());

        $this->fill($ctx, $model, $read, $label, $blocks, $outcome->data);
        $model->save();

        Seo::save($model, $this->seo($ctx, $read, $label));

        $ctx->map->put($this->mapType() ?? 'page', $path, $model, (string) $record['url']);
        $ctx->map->put(self::HASH, $path, $model, self::fingerprint($model));
    }

    /**
     * Set the record's columns from the page. The common part is here: the
     * sections, the draft status, the slug of a new record.
     *
     * @param  Page|BlogPost|Product  $model
     * @param  array<string, mixed>  $read
     * @param  array<int, array<string, mixed>>  $blocks
     * @param  array<string, mixed>  $data  the plan's
     */
    protected function fill(Context $ctx, Model $model, array $read, string $label, array $blocks, array $data): void
    {
        $model->fill([
            'title' => Str::limit((string) $data['title'], 250, ''),
            'template' => 'builder',
            'blocks' => $blocks,
            'status' => $model->exists ? $model->status : PublishStatus::Draft,
        ]);

        if (! $model->exists) {
            $model->slug = $data['slug'];
        }
    }

    /**
     * Something worth saying about this one record in the review.
     *
     * @param  array<string, mixed>  $read
     */
    protected function warnings(Context $ctx, Outcome $outcome, array $read): void {}

    public function finish(Context $ctx): void
    {
        if ($this->kind() !== PageKind::PAGE || ! $ctx->decision('set_homepage', false)) {
            return;
        }

        $home = $ctx->map->model('page', '/', Page::class);

        // Draft or not: the public settings name it only while it is a published builder page.
        if ($home !== null) {
            Setting::put('homepage_page_id', (string) $home->getKey());
        }
    }

    /**
     * What the import wrote to a record, as a hash: compared next time to see
     * whether anyone has edited it. Its title (or name) and its sections.
     */
    public static function fingerprint(Model $model): string
    {
        // MySQL's JSON column reorders object keys, so the blocks are compared in a canonical order.
        return sha1((string) json_encode(Revisions::canonical([$model->getAttribute('title') ?? $model->getAttribute('name'), $model->getAttribute('blocks')])));
    }

    /**
     * Whether a record the import made has been changed here since: its title
     * or sections no longer hash to what the import last wrote.
     */
    private function edited(Context $ctx, Model $model, string $path): bool
    {
        $stored = $ctx->map->get(self::HASH, $path)['url'] ?? null;

        return $stored !== null && $stored !== self::fingerprint($model);
    }

    /**
     * Settle what a page becomes, once per page, and note it: the review's
     * choice if there is one, else the rules, else — for the ambiguous — the
     * AI, when it may be asked.
     *
     * @param  array<string, mixed>  $read
     */
    private function sort(Context $ctx, string $path, array $read): string
    {
        $detected = PageKind::detect((array) $read['facts'], $path);
        $by = 'rules';

        if (! $detected['certain'] && $ctx->aiOn() && ($asked = PageKind::ask($ctx->import, $ctx->aiLedger(), $path, $read, (array) $read['facts'])) !== null) {
            $detected['kind'] = $asked;
            $by = 'ai';
        }

        $decided = Decisions::kindFor($ctx, $path);
        $ctx->kinds[$path] = [
            'kind' => $decided ?? $detected['kind'],
            'detected' => $detected['kind'],
            'by' => $decided !== null && $decided !== $detected['kind'] ? 'you' : $by,
        ];

        return $ctx->kinds[$path]['kind'];
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array<string, mixed> `PageReader`'s page, readied for this kind of record
     */
    protected function read(Context $ctx, array $record): array
    {
        $site = $ctx->site();

        return $this->prepare(PageReader::read($record, (array) ($site['chrome'] ?? []), $site['name'] ?? null, $ctx));
    }

    /**
     * The page as section rows, and the parts it holds.
     *
     * Planning (`writes: false`) fetches nothing and creates nothing: a
     * picture is "planned", markup is left as it is, and `Parts` only counts.
     *
     * @param  array<string, mixed>  $read
     * @return array{0: list<array<string, mixed>>, 1: Parts, 2: int} the sections, the parts, and how many the AI placed
     */
    protected function layout(Context $ctx, array $read, string $label, string $path, bool $writes): array
    {
        $parts = new Parts($ctx, $path, $label, $writes);
        $media = fn (string $src) => $writes ? $ctx->media($src, $label) : $ctx->planMedia($src, $label);
        $body = fn (string $html) => $this->body($ctx, $html, $label, $writes);
        $ai = $this->assistant($ctx);
        $assist = $ai === null ? null : fn (Piece $piece, bool $opening) => $ai->place($piece, $opening, $media);
        $walker = new RenderedSections($body, $media, $parts, RenderedSections::siteRecognisers(), $assist);
        $rows = $walker->toSections(self::offered($read['html']));

        return [$this->documentLinks($ctx, $rows, $label, $writes), $parts, $ai->made ?? 0];
    }

    /**
     * The page's markup, as one block the recognisers can look at whole: a
     * hand-written page has its questions or its columns straight under the
     * body, with no wrapper to ask. A page with loose words at the top is left
     * as it is, so those words stay the walker's to place.
     */
    private static function offered(string $html): string
    {
        foreach (Dom::load($html)->childNodes as $node) {
            if ($node instanceof DOMText && trim($node->data) !== '') {
                return $html;
            }
        }

        return '<div>'.$html.'</div>';
    }

    /**
     * A body brought across: the pictures it shows and the documents it links
     * to (same site) re-homed in the media library, then the sanitiser — the
     * one a body typed in the console goes through. Links to other pages are
     * rewritten later, by the links step, once every page exists.
     */
    private function body(Context $ctx, string $html, string $label, bool $writes): ?string
    {
        if (trim($html) === '') {
            return null;
        }

        $html = (string) preg_replace('/\s(srcset|sizes)="[^"]*"/i', '', $html);
        $html = self::paragraphs($html);

        $html = (string) preg_replace_callback('/(<img\b[^>]*\bsrc=")([^"]+)(")/i', function (array $m) use ($ctx, $label, $writes) {
            $src = html_entity_decode($m[2], ENT_QUOTES);
            $path = $writes ? $ctx->media($src, $label) : $ctx->planMedia($src, $label);

            return $writes && $path !== null ? $m[1].e(Context::mediaUrl($path)).$m[3] : $m[0];
        }, $html);

        $html = (string) preg_replace_callback('/(\bhref=")([^"]+)(")/i', function (array $m) use ($ctx, $label, $writes) {
            $href = html_entity_decode($m[2], ENT_QUOTES);

            if (! self::isDocument($ctx, $href)) {
                return $m[0];
            }

            $path = $writes ? $ctx->media($href, $label) : $ctx->planMedia($href, $label);

            return $writes && $path !== null ? $m[1].e(Context::mediaUrl($path)).$m[3] : $m[0];
        }, $html);

        $clean = HtmlSanitiser::clean($html);

        return $clean !== null && trim(strip_tags($clean, '<img><iframe><table><hr>')) !== '' ? $clean : null;
    }

    /** What a `<div>` may hold and still be a line of text. */
    private const INLINE = ['a', 'strong', 'b', 'em', 'i', 'span', 'br', 'img', 'small', 'sup', 'sub', 'code', 'mark', 'abbr', 'u', 's', 'time', 'cite', 'q'];

    /**
     * A `<div>` holding only words and inline markup is a paragraph. The
     * sanitiser removes `<div>` and keeps what is in it, so without this a
     * masthead of `<div>Welcome</div><div>Nice to meet you</div>` reads
     * "WelcomeNice to meet you".
     */
    private static function paragraphs(string $html): string
    {
        if (! str_contains($html, '<div')) {
            return $html;
        }

        $root = Dom::load($html);
        $doc = $root->ownerDocument;

        // Deepest first, so a wrapper of such lines is judged after them.
        foreach (array_reverse(iterator_to_array($root->getElementsByTagName('div'))) as $div) {
            $inline = true;

            foreach (Dom::children($div) as $child) {
                $inline = $inline && in_array(strtolower($child->tagName), self::INLINE, true);
            }

            if ($doc === null || ! $inline || trim($div->textContent) === '') {
                continue;
            }

            $p = $doc->createElement('p');

            while ($div->firstChild !== null) {
                $p->appendChild($div->firstChild);
            }

            $div->parentNode?->replaceChild($p, $div);
        }

        $out = '';

        foreach ($root->childNodes as $child) {
            $out .= (string) $doc?->saveHTML($child);
        }

        return $out;
    }

    /**
     * A document a button or card links to (same site) brought into the
     * library, its link pointed at the copy there.
     *
     * @param  array<int|string, mixed>  $value
     * @return array<int|string, mixed>
     */
    private function documentLinks(Context $ctx, array $value, string $label, bool $writes): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->documentLinks($ctx, $item, $label, $writes);
            } elseif ($key === 'href' && is_string($item) && self::isDocument($ctx, $item)) {
                $path = $writes ? $ctx->media($item, $label) : $ctx->planMedia($item, $label);

                if ($writes && $path !== null) {
                    $value[$key] = Context::mediaUrl($path);
                }
            }
        }

        return $value;
    }

    private static function isDocument(Context $ctx, string $href): bool
    {
        return preg_match('/\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)$/i', (string) parse_url($href, PHP_URL_PATH)) === 1
            && Paths::sameSite($href, $ctx->siteUrl());
    }

    /**
     * The override block: only what the site would not derive. A canonical is
     * never copied — it names the old address, and this site derives its own.
     *
     * @param  array<string, mixed>  $read
     * @return array<string, mixed>
     */
    protected function seo(Context $ctx, array $read, string $label): array
    {
        $seo = [];

        if ($read['title'] !== '' && strcasecmp($read['title'], $label) !== 0) {
            $seo['title'] = Str::limit($read['title'], 250, '');
        }

        if ($read['description'] !== '') {
            $seo['description'] = Str::limit($read['description'], 320, '');
        }

        if ($read['noindex']) {
            $seo['robots'] = 'noindex, follow';
        }

        if ($read['og_image'] !== null && ($path = $ctx->media($read['og_image'], $label)) !== null) {
            $seo['og_image_path'] = $path;
        }

        return $seo;
    }

    private function freeSlug(string $wanted): string
    {
        $slug = $wanted;
        $i = 2;

        while ($this->slugTaken($slug)) {
            $slug = $wanted.'-'.$i++;
        }

        return $slug;
    }

    /** Add a page to the review's table, and hand the outcome back. */
    private function row(Context $ctx, string $path, string $label, Outcome $outcome): Outcome
    {
        if ($ctx->dryRun) {
            $kind = $ctx->kinds[$path] ?? ['kind' => $this->kind(), 'detected' => $this->kind(), 'by' => 'rules'];

            $ctx->rows[] = [
                'path' => $path,
                'title' => Str::limit($label, 120, '…'),
                'action' => $outcome->action,
                'sections' => (int) ($outcome->data['sections'] ?? 0),
                'types' => (array) ($outcome->data['types'] ?? []),
                'ai' => (int) ($outcome->data['ai'] ?? 0),
                'kind' => $kind['kind'],
                'detected' => $kind['detected'],
                'by' => $kind['by'],
                'note' => $outcome->reason ?? ($outcome->warnings[0] ?? null),
            ];
        }

        return $outcome;
    }

    /**
     * Every page, post and product this import has mapped, with the model.
     *
     * @return iterable<WordPressImportMapping>
     */
    public static function mapped(Context $ctx): iterable
    {
        return WordPressImportMapping::query()
            ->where('site', $ctx->import->site)
            ->whereIn('source_type', ['page', 'post', 'product'])
            ->lazyById(200);
    }
}
