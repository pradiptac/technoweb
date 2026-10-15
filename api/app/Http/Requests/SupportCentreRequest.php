<?php

namespace App\Http\Requests;

use App\Enums\SupportCentreKind;
use App\Models\SupportCentre;
use App\Support\Countries;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A support centre, created or edited (docs/support-network.md). One class
 * for both: on an update every key is `sometimes`, and the coordinate pair
 * is judged against what the row will be.
 */
class SupportCentreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $merge = [];
        if ($this->has('country_code') && is_string($this->input('country_code'))) {
            $merge['country_code'] = strtoupper(trim($this->input('country_code')));
        }
        // A blank slug is made from the name, on create and on edit.
        if ($this->has('name') && blank($this->input('slug'))) {
            $merge['slug'] = Str::slug((string) $this->input('name'));
        } elseif ($this->has('slug')) {
            $merge['slug'] = Str::slug((string) $this->input('slug'));
        }
        foreach (['latitude', 'longitude'] as $key) {
            if ($this->has($key) && $this->input($key) === '') {
                $merge[$key] = null;
            }
        }
        $this->merge($merge);
    }

    public function rules(): array
    {
        /** @var SupportCentre|null $centre */
        $centre = $this->route('supportCentre');
        $req = $centre ? 'sometimes' : 'required';

        return [
            'name' => [$req, 'string', 'max:160'],
            'slug' => [$req, 'string', 'max:180', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('support_centres', 'slug')->ignore($centre?->id)],
            'kind' => ['sometimes', Rule::enum(SupportCentreKind::class)],
            'country_code' => [$req, 'string', 'size:2', Rule::in(array_keys(Countries::ALL))],
            'region' => ['sometimes', 'nullable', 'string', 'max:120'],
            'city' => [$req, 'string', 'max:120'],
            'address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[0-9+()\-.\s\/]{5,40}$/'],
            'phone_alt' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[0-9+()\-.\s\/]{5,40}$/'],
            'email' => ['sometimes', 'nullable', 'email:rfc', 'max:191'],
            'hours' => ['sometimes', 'nullable', 'string', 'max:255'],
            'latitude' => ['sometimes', 'nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'nullable', 'numeric', 'between:-180,180'],
            'location_id' => ['sometimes', 'nullable', 'integer', 'exists:locations,id'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
            // Replaced wholesale; absent leaves the staff alone, [] clears it.
            'staff' => ['sometimes', 'array', 'max:100'],
            'staff.*.user_id' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'staff.*.title' => ['nullable', 'string', 'max:80'],
            'staff.*.is_public' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => 'Enter a telephone number: digits, spaces, + ( ) - . and / only.',
            'phone_alt.regex' => 'Enter a telephone number: digits, spaces, + ( ) - . and / only.',
            'country_code.in' => 'Choose a country from the list.',
            'staff.*.user_id.distinct' => 'This person is listed twice.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            /** @var SupportCentre|null $centre */
            $centre = $this->route('supportCentre');
            $lat = $this->has('latitude') ? $this->input('latitude') : $centre?->latitude;
            $lng = $this->has('longitude') ? $this->input('longitude') : $centre?->longitude;
            // A pin needs both: one alone puts it nowhere.
            if (($lat === null) !== ($lng === null)) {
                $v->errors()->add($lat === null ? 'latitude' : 'longitude', 'Enter both the latitude and the longitude, or neither.');
            }
        });
    }
}
