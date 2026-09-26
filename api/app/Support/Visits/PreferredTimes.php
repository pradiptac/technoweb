<?php

namespace App\Support\Visits;

use Illuminate\Validation\Validator;

/**
 * The preferred-times rules, shared by a new request and a reschedule.
 *
 * A date input's `min` and `max` stop the obvious, but a Sunday, a holiday
 * or a window removed since the form loaded get through any browser — so the
 * whole check runs here, against the settings as they are at the moment of
 * the request, and each refusal names the row it is about.
 */
final class PreferredTimes
{
    /** @return array<string, array<int, mixed>> */
    public static function rules(): array
    {
        return [
            'preferred' => ['required', 'array', 'min:1', 'max:'.VisitSettings::MAX_PREFERRED],
            'preferred.*' => ['required', 'array'],
            'preferred.*.date' => ['required', 'string', 'date_format:Y-m-d'],
            'preferred.*.window' => ['required', 'string', 'max:24'],
        ];
    }

    /** @return array<string, string> */
    public static function messages(): array
    {
        return [
            'preferred.required' => 'Choose at least one date and time that suits you.',
            'preferred.max' => 'Choose up to '.VisitSettings::MAX_PREFERRED.' times.',
            'preferred.*.date.required' => 'Choose a date.',
            'preferred.*.date.date_format' => 'Choose a date.',
            'preferred.*.window.required' => 'Choose a part of the day.',
        ];
    }

    /**
     * The checks a rule cannot express: the day, the notice, the horizon, a
     * holiday, a window that exists, and the same time chosen twice.
     */
    public static function check(Validator $validator, string $prefix = 'preferred'): void
    {
        $data = $validator->getData();
        $rows = $data[$prefix] ?? null;

        if (! is_array($rows) || $validator->errors()->has($prefix)) {
            return;
        }

        $seen = [];

        foreach (array_values($rows) as $i => $row) {
            $date = is_array($row) ? (string) ($row['date'] ?? '') : '';
            $window = is_array($row) ? (string) ($row['window'] ?? '') : '';

            if ($validator->errors()->has("{$prefix}.{$i}.date") || $validator->errors()->has("{$prefix}.{$i}.window")) {
                continue;
            }

            if (($refusal = VisitSettings::refusal($date)) !== null) {
                $validator->errors()->add("{$prefix}.{$i}.date", $refusal);

                continue;
            }

            if (VisitSettings::window($window) === null) {
                $validator->errors()->add("{$prefix}.{$i}.window", 'Choose one of the parts of the day offered.');

                continue;
            }

            if (isset($seen[$date.'|'.$window])) {
                $validator->errors()->add("{$prefix}.{$i}.date", 'You chose this time twice. Pick a different day or part of the day.');

                continue;
            }

            $seen[$date.'|'.$window] = true;
        }
    }

    /**
     * What is stored: a list of `{date, window}`, nothing else from the row.
     *
     * @param  array<int, mixed>  $rows
     * @return list<array{date: string, window: string}>
     */
    public static function normalise(array $rows): array
    {
        return array_values(array_map(fn ($row) => [
            'date' => (string) ($row['date'] ?? ''),
            'window' => (string) ($row['window'] ?? ''),
        ], array_filter($rows, 'is_array')));
    }
}
