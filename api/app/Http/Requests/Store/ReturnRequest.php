<?php

namespace App\Http\Requests\Store;

use App\Enums\ReturnReason;
use App\Support\Store\Returns\ReturnPhotos;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

/**
 * A customer asking to return lines of an order (docs/store.md "Returns").
 *
 * The shape only: which lines, how many, why, and up to four photographs.
 * Whether the order may return anything, and how many of each line are left
 * to return, is decided by `ReturnPolicy` inside the transaction that writes
 * the return — checked there against the locked order, never here against a
 * read that may be a tab old.
 *
 * It arrives as multipart when it carries photographs, so a line's quantity
 * is a string; `integer` accepts one. A photograph is held to an image by
 * extension **and** by what its bytes sniff as — a script renamed `box.jpg`
 * and a real JPEG arriving as `box.php` are both refused.
 */
class ReturnRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // A form posts every line with its quantity; a line left at 0 is one
        // the customer is keeping, not a mistake to send back as an error.
        $items = $this->input('items');

        if (is_array($items)) {
            $this->merge(['items' => array_values(array_filter(
                $items,
                fn ($row) => is_array($row) && (int) ($row['quantity'] ?? 0) > 0,
            ))]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'token' => ['sometimes', 'nullable', 'string'],
            'reason' => ['required', Rule::enum(ReturnReason::class)],
            'details' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.order_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
            'photos' => ['sometimes', 'array', 'max:'.ReturnPhotos::MAX_PHOTOS],
            'photos.*' => [
                'file',
                'max:'.ReturnPhotos::MAX_KB,
                'extensions:'.implode(',', ReturnPhotos::EXTENSIONS),
                'mimes:'.implode(',', ReturnPhotos::EXTENSIONS),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        $mb = (int) floor(ReturnPhotos::MAX_KB / 1024);

        return [
            'reason.required' => 'Choose why you are returning this.',
            'reason.enum' => 'Choose why you are returning this.',
            'details.max' => 'Keep the details to 2,000 characters.',
            'items.required' => 'Choose at least one item to return.',
            'items.min' => 'Choose at least one item to return.',
            'photos.max' => 'Send up to '.ReturnPhotos::MAX_PHOTOS.' photographs.',
            'photos.*.max' => "Each photograph can be up to {$mb} MB.",
            'photos.*.extensions' => 'A photograph must be a JPG, PNG or WebP picture.',
            'photos.*.mimes' => 'A photograph must be a JPG, PNG or WebP picture.',
        ];
    }

    /** @return list<UploadedFile> */
    public function photos(): array
    {
        return array_values(array_filter((array) $this->file('photos', [])));
    }
}
