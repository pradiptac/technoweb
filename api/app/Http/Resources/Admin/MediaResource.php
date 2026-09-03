<?php

namespace App\Http\Resources\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MediaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'folder_id' => $this->folder_id,
            'is_image' => $this->resource->isImage(),
            /*
             * The authorised download, for a client holding a token.
             *
             * **Not something a browser can follow.** It needs
             * `Authorization: Bearer`, which a navigation does not send, and a
             * navigation's `Accept: text/html` turns the refusal into a 500
             * rather than a 401 — Laravel tries to redirect to a `login` route
             * an API-only application does not define. The console linked
             * straight at this for months, so pressing Download produced an
             * error page. It now goes to `/api/admin/media/{id}/download`,
             * which attaches the token server-side.
             */
            'download_url' => route('api.v1.admin.media.download', ['medium' => $this->id]),
            'id' => $this->id,
            'filename' => $this->filename,
            // The path is what gets stored on the owning record
            // (cover_image_path, og_image_path); the url is for display.
            'path' => $this->path,
            /*
             * Versioned, and that is what makes an edit visible.
             *
             * Resize, crop, rotate and replace all rewrite the file **in
             * place** — the path is the identity every record stores, so it
             * must not change. Which means the URL does not change either, and
             * the browser goes on serving the copy it already has: the console
             * refetched the row, re-rendered the grid, and showed the old
             * picture. It read as "the gallery does not refresh".
             *
             * `updated_at` moves on every one of those operations, so the
             * query string changes exactly when the bytes do. It is on `url`
             * and never on `path`: `path` is what gets stored on a record, and
             * a stored path with `?v=` in it would be a filename that does not
             * exist.
             */
            'url' => $this->url().'?v='.($this->updated_at?->timestamp ?? 0),
            'mime' => $this->mime,
            'size' => (int) $this->size,
            'width' => $this->width,
            'height' => $this->height,
            'alt_text' => $this->alt_text,
            /*
             * Deliberately distinct from alt_text, and neither is a synonym
             * for the other. Alt text is announced *in place of* the image on
             * every public page that renders it; a description is a working
             * note for whoever is filing assets, and reaches no public
             * response — `MediaResource` is the admin resource.
             */
            'description' => $this->description,
            // Always an array, never null: a caller mapping over it should not
            // have to ask which shape an untagged file came back as.
            'tags' => $this->tags ?? [],
            'uploaded_by' => $this->whenLoaded('uploader', fn () => $this->uploader?->name),
            'created_at' => $this->created_at?->toIso8601String(),
            // Distinct from created_at once a file can be cropped, resized,
            // rotated or renamed in place. The library sorts on it and the
            // details panel shows it, and a "modified" date that only ever
            // equalled the upload date would be a column pretending to be a
            // fact.
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
