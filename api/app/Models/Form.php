<?php

namespace App\Models;

use App\Enums\PublishStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * A form an editor assembled, addressed by slug from a shortcode.
 *
 * Like Slider, it deliberately avoids the Sluggable trait: a form has no URL
 * of its own, so the 301 that trait writes on a slug change would point at two
 * pages that do not exist.
 */
class Form extends Model
{
    protected $fillable = ['name', 'slug', 'status', 'submit_label', 'success_message', 'notify_email', 'embed_enabled'];

    /**
     * The column has a database default, so the model must declare it too.
     *
     * `embed_enabled` is `default(false)` in the migration and would be **null**
     * on a row created and read back in the same breath — and null is not
     * false to anything that asks. Both store models carry `$attributes` for
     * every boolean with a column default for exactly this reason, after a
     * variation created in one statement called itself unsellable.
     */
    protected $attributes = ['embed_enabled' => false];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'embed_enabled' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $form) {
            if (blank($form->slug)) {
                $form->slug = $form->uniqueSlug($form->name);
            }
        });
    }

    public function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'form';
        $slug = $base;

        for ($n = 2; self::where('slug', $slug)->whereKeyNot($this->getKey())->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }

    public function fields(): HasMany
    {
        return $this->hasMany(FormField::class)->orderBy('sort_order')->orderBy('id');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(FormSubmission::class);
    }

    public function scopePublished(Builder $query): void
    {
        $query->where('status', PublishStatus::Published);
    }

    /**
     * The address the person who filled this in gave, if they gave one.
     *
     * **Read from the field's *kind*, never from its name.** An editor names
     * fields, so the only thing that reliably says "this answer is an email
     * address" is `kind === 'email'` — which is also what `FormValidator`
     * applied `email:rfc` to on the way in.
     *
     * This is deliberately not `$lead->email`. `LeadIntake` guesses the
     * contact columns from a list of likely key names
     * (`email`, `email_address`, `work_email`), which is right for a pipeline
     * record that degrades to "full answers attached, no contact columns" —
     * and wrong as the recipient of a message, because a form whose field is
     * called `contact_email` would silently acknowledge nobody. `$lead` is
     * nullable besides: intake swallows its own failures by design.
     *
     * One resolver with two callers: the reply-to on the desk notification,
     * and the acknowledgement to the submitter. It lived as a private method
     * on `FormSubmitted` until the second caller existed.
     */
    public function submitterEmail(FormSubmission $submission): ?string
    {
        foreach ($this->fields as $field) {
            if ($field->kind !== 'email') {
                continue;
            }

            $value = $submission->data[$field->name] ?? null;

            if (is_string($value) && filter_var($value, FILTER_VALIDATE_EMAIL)) {
                return $value;
            }
        }

        return null;
    }
}
