<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\NewsletterTemplate;
use App\Support\Newsletter\Branding;
use App\Support\Newsletter\EmailRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class NewsletterTemplateController extends Controller
{
    /**
     * The gallery.
     *
     * Without `html` and `blocks`: ten templates at six kilobytes each is
     * sixty kilobytes to draw a grid of names, and the preview is fetched per
     * template when one is opened. The same reasoning that keeps the rendered
     * HTML off the campaign index.
     */
    public function index(): JsonResponse
    {
        $templates = NewsletterTemplate::orderBy('is_system', 'desc')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'description', 'category', 'is_system', 'thumbnail_path']);

        return response()->json(['data' => $templates]);
    }

    public function show(NewsletterTemplate $template): JsonResponse
    {
        return response()->json(['data' => [
            'id' => $template->id,
            'name' => $template->name,
            'slug' => $template->slug,
            'description' => $template->description,
            'category' => $template->category,
            'is_system' => $template->is_system,
            'blocks' => $template->blocks ?? [],
            'html' => $template->html,
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: true);

        $template = NewsletterTemplate::create([
            ...$data,
            'slug' => $this->slug($data['name']),
            'html' => EmailRenderer::render($data['blocks'] ?? [], $this->branding()),
            // Only the seeder ships system templates. One created here is
            // somebody's own, and must survive the seeder being re-run.
            'is_system' => false,
        ]);

        return response()->json(['data' => $template], 201);
    }

    public function update(Request $request, NewsletterTemplate $template): JsonResponse
    {
        $data = $this->validated($request);

        $template->update([
            ...$data,
            'html' => array_key_exists('blocks', $data)
                ? EmailRenderer::render($data['blocks'] ?? [], $this->branding())
                : $template->html,
            /*
             * Editing a shipped template makes it yours.
             *
             * The seeder refreshes system templates and skips the rest, so
             * without this an afternoon's work would be overwritten by the
             * next deploy — silently, which is the worst way to lose it.
             */
            'is_system' => false,
        ]);

        return response()->json(['data' => $template->fresh()]);
    }

    public function destroy(NewsletterTemplate $template): JsonResponse
    {
        $template->delete();

        return response()->json(null, 204);
    }

    /**
     * Render arbitrary blocks without saving.
     *
     * What the editor's preview pane calls on every change. It renders through
     * exactly the same code path a send uses — a preview built any other way
     * is a preview of something else, which is the whole failure mode of an
     * email editor.
     */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'blocks' => ['required', 'array'],
            'preheader' => ['nullable', 'string', 'max:200'],
        ]);

        $html = EmailRenderer::render($data['blocks'], [
            ...$this->branding(),
            'preheader' => $data['preheader'] ?? null,
        ]);

        // Filled with a placeholder rather than left as `{{first_name}}`: the
        // preview is meant to show what a reader sees, and braces in a preview
        // are what make somebody ship braces.
        $filled = EmailRenderer::personalise($html, null, [
            'first_name' => 'there',
            'unsubscribe_url' => '#',
        ]);

        return response()->json(['data' => ['html' => $filled]]);
    }

    private function validated(Request $request, bool $creating = false): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:300'],
            'category' => ['nullable', 'string', 'max:40'],
            'blocks' => ['sometimes', 'array'],
        ]);
    }

    private function branding(): array
    {
        return Branding::all();
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'template';
        $slug = $base;
        $n = 2;

        while (NewsletterTemplate::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$n++;
        }

        return $slug;
    }
}
