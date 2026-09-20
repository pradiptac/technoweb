<?php

namespace App\Http\Requests\Concerns;

/**
 * Turn a store request's rules into an update request's.
 *
 * A `PATCH` mentions only the fields it changes, so every top-level rule set
 * gains `sometimes` and a field the request does not carry is left alone.
 * Nested and wildcard keys (`faqs.*.question`) are not prefixed: those are
 * validated inside a value the request *did* send, where "present" already
 * means what it says. An update request that differs from its store request
 * by nothing but this prefix and a `unique(...)->ignore()` extends the store
 * request and calls this on `parent::rules()`; the pairs whose rules differ
 * in substance (a slug required on update and derived on create, a status
 * required on create alone) stay two classes, because those differences are
 * the point.
 */
trait SometimesRules
{
    /**
     * @param  array<string, mixed>  $rules
     * @return array<string, mixed>
     */
    protected function sometimes(array $rules): array
    {
        foreach ($rules as $field => $set) {
            if (str_contains((string) $field, '.')) {
                continue;
            }
            $set = is_array($set) ? $set : explode('|', (string) $set);
            if (! in_array('sometimes', $set, true)) {
                array_unshift($set, 'sometimes');
            }
            $rules[$field] = $set;
        }

        return $rules;
    }
}
