<?php

namespace App\Http\Requests;

use App\Enums\DownloadAccess;
use App\Enums\DownloadSource;
use App\Enums\PublishStatus;
use App\Models\Download;
use App\Support\Downloads\DownloadFiles;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A download, created or edited — the `CertificationRequest` shape: one
 * request for both writes, because nothing here means something different
 * the second time. The authorisation is the route's `role:content_manager`.
 *
 * **It arrives two ways.** As JSON from the console's Server Action, and as
 * `multipart/form-data` when the form carries a file to upload — through
 * `POST` with `_method=PATCH` on an edit, since PHP reads a multipart body
 * on POST only. A multipart form cannot say "an empty list", so the form
 * sends `relations_sent` and an absent `product_ids` then means none.
 *
 * The rules that span two fields are checked against what the download
 * **will be**: a `PATCH` naming one half is compared with the stored other
 * half, the rule a certification's dates follow.
 */
class DownloadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->boolean('relations_sent')) {
            $this->merge([
                'product_ids' => $this->input('product_ids', []),
                'store_product_ids' => $this->input('store_product_ids', []),
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST') && $this->route('download') === null;

        return [
            'title' => [$creating ? 'required' : 'sometimes', 'required', 'string', 'max:160'],
            'summary' => ['nullable', 'string', 'max:500'],
            'download_category_id' => ['nullable', 'integer', Rule::exists('download_categories', 'id')],
            'version' => ['nullable', 'string', 'max:40'],
            'released_on' => ['nullable', 'date_format:Y-m-d'],
            'access' => ['sometimes', Rule::enum(DownloadAccess::class)],
            'source' => ['sometimes', Rule::enum(DownloadSource::class)],
            // A media-library path: one the library does not know is a
            // button that 404s on a page whose whole job is the file.
            'file_path' => ['nullable', 'string', 'max:255', Rule::exists('media', 'path')->whereNull('deleted_at')],
            'file' => [
                'nullable', 'file',
                'max:'.DownloadFiles::maxKb(),
                'extensions:'.implode(',', DownloadFiles::EXTENSIONS),
            ],
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'relations_sent' => ['sometimes', 'boolean'],
            'product_ids' => ['sometimes', 'array', 'max:200'],
            'product_ids.*' => ['integer', 'distinct', Rule::exists('products', 'id')->whereNull('deleted_at')],
            'store_product_ids' => ['sometimes', 'array', 'max:200'],
            'store_product_ids.*' => ['integer', 'distinct', Rule::exists('store_products', 'id')],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            /** @var Download|null $record */
            $record = $this->route('download');
            $data = $v->getData();
            $given = fn (string $key) => array_key_exists($key, $data);

            $source = $given('source') ? (string) $data['source'] : ($record?->source->value ?? DownloadSource::Library->value);
            $access = $given('access') ? (string) $data['access'] : ($record?->access->value ?? DownloadAccess::Public->value);
            $status = $given('status') ? (string) $data['status'] : ($record?->status->value ?? PublishStatus::Draft->value);
            $uploading = $this->hasFile('file');

            if ($uploading && $source !== DownloadSource::Upload->value) {
                $v->errors()->add('file', 'Choose "Uploaded here" as the file\'s source to send a file with this download.');

                return;
            }

            $hasFile = $source === DownloadSource::Upload->value
                ? ($uploading || ($record?->source === DownloadSource::Upload && filled($record->private_path)))
                : filled($given('file_path') ? $data['file_path'] : ($record?->source === DownloadSource::Library ? $record->file_path : null));

            /*
             * A library file has a public address — that is what the library
             * is — so "customers only" on one would be a lock on a door with
             * no wall. Refused rather than quietly published.
             */
            if ($access === DownloadAccess::Customers->value && $source === DownloadSource::Library->value) {
                $v->errors()->add('access', 'A file from the media library has a public address, so it cannot be limited to customers. Upload the file here instead.');
            }

            if ($status === PublishStatus::Published->value && ! $hasFile) {
                $v->errors()->add('status', $source === DownloadSource::Upload->value
                    ? 'Upload the file before publishing this download.'
                    : 'Choose the file before publishing this download.');
            }
        });
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        $mb = (int) floor(DownloadFiles::maxKb() / 1024);

        return [
            'title.required' => 'Give the download a title — what the file is.',
            'summary.max' => 'The summary is limited to 500 characters.',
            'download_category_id.exists' => 'That category no longer exists. Choose another.',
            'released_on.date_format' => 'Give the release date as a date.',
            'file_path.exists' => 'Choose the file from the media library.',
            'file.max' => "That file is larger than this server accepts ({$mb} MB).",
            'file.extensions' => 'That type of file cannot be offered as a download here.',
            'product_ids.*.exists' => 'One of those products no longer exists.',
            'store_product_ids.*.exists' => 'One of those shop products no longer exists.',
        ];
    }
}
