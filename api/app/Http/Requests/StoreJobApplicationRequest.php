<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Somebody applying for a job.
 *
 * The only unauthenticated **file** upload in the product, which makes it the
 * largest attack surface the site has. Everything here is tighter than it looks
 * like it needs to be, on purpose:
 *
 *   - **Extensions and mimes are both checked.** `mimes:` validates the
 *     detected type, not the name, and naming the extensions as well stops a
 *     file that sniffs as one thing arriving called `cv.php`.
 *   - **No images, no archives.** A CV is a document. Zip would let somebody
 *     post anything at all through a form open to the internet, and the point
 *     of an allowlist is that it says no to things nobody thought of.
 *   - **2 MB.** A CV that does not fit is a CV with photographs in it.
 */
class StoreJobApplicationRequest extends FormRequest
{
    /** What a CV may actually be. */
    public const CV_MIMES = 'pdf,doc,docx,rtf,odt';

    public const CV_MAX_KB = 2048;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            // `rfc` only, never `dns` — see the note on the registration
            // request. A DNS lookup on the request path is a network call this
            // project has already measured the cost of.
            'email' => ['required', 'email:rfc', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'current_company' => ['nullable', 'string', 'max:160'],
            'experience_years' => ['nullable', 'integer', 'min:0', 'max:60'],
            'cover_letter' => ['nullable', 'string', 'max:4000'],
            'portfolio_url' => ['nullable', 'url', 'max:255'],

            'cv' => [
                'required',
                'file',
                'mimes:'.self::CV_MIMES,
                'mimetypes:application/pdf,application/msword,'.
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'.
                    'application/rtf,text/rtf,application/vnd.oasis.opendocument.text',
                'max:'.self::CV_MAX_KB,
            ],

            // The honeypot, matching every other public form here.
            'website' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'cv.required' => 'Attach your CV so we know what you have done.',
            'cv.mimes' => 'A CV needs to be a PDF, Word or OpenDocument file.',
            'cv.mimetypes' => 'A CV needs to be a PDF, Word or OpenDocument file.',
            'cv.max' => 'That file is over 2 MB. A CV that large usually has images in it.',
        ];
    }

    public function attributes(): array
    {
        return ['cv' => 'CV', 'current_company' => 'current employer'];
    }
}
