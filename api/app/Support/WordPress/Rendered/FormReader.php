<?php

namespace App\Support\WordPress\Rendered;

use App\Http\Requests\StoreFormRequest;
use DOMElement;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * A rendered form as a form here: Contact Form 7, WPForms, Gravity Forms,
 * Elementor's form, Divi's contact form, Formidable — or any `<form>` with
 * fields people fill in.
 *
 * Each control becomes a field of one of `FormField::KINDS`: a radio group
 * a single choice, a group of checkboxes a multiple choice, a lone checkbox a
 * tick box, a URL a web address and a date a date (0.117.0 — until then the
 * first two were dropdowns and the last two lines of text). Hidden fields,
 * honeypots, captchas, passwords and buttons are left out; a file upload is
 * still not brought across — what the old site accepted and how large is not
 * in the markup, and an upload open to the internet is not something to
 * switch on by guessing — and is named in `$dropped`. The label is what the page showed beside
 * the control (`<label for>`, a wrapping label, the field's group label,
 * `aria-label`, the placeholder). The key is the plugin's own field name
 * where it means something (`your-email` → `email`) and the label otherwise
 * (`wpforms[fields][3]` → `company_name`), never `website`.
 *
 * `key` says which form this is, so the same form placed on twelve pages is
 * one form here: the plugin's own id where it has one (`cf7:123`,
 * `wpforms:45`, `gform:2`), the fields' names otherwise.
 */
final class FormReader
{
    private const PLUGIN = '/^(wpcf7|wpforms-container|gform_wrapper|elementor-widget-form|et_pb_contact_form_container|frm_forms|fluentform|forminator-custom-form|wpcf7-form)$/';

    private const SKIP_NAME = '/^(_wp|_wpcf7|g-recaptcha|h-captcha|cf-turnstile|wpforms\[(id|author|post_id|token)\]|gform_|is_submit_|state_|form_id|post_id|queried_id|referer_title|_wpnonce|action$|et_pb_contactform_submit|_wpcf7_ak|ak_|honeypot|hp_|website_hp)/i';

    private const HONEYPOT = '/(honeypot|hp-field|wpforms-field-hp|gform_validation_container|akismet|ak_hp|wpcf7-response-output|screen-reader-response)/';

    /** @var list<string> the labels of controls with no field here */
    public array $dropped = [];

    /** Whether an element is a form worth bringing: a plugin's wrapper, or a form with fields. */
    public static function is(DOMElement $el): bool
    {
        if (Dom::has($el, self::PLUGIN)) {
            return Dom::firstTag($el, 'form') !== null || strtolower($el->tagName) === 'form';
        }
        if (strtolower($el->tagName) !== 'form') {
            return false;
        }
        if (strtolower($el->getAttribute('role')) === 'search' || Dom::has($el, '/search/') || str_contains(strtolower($el->getAttribute('action')), 'wp-login')) {
            return false;
        }

        return true;
    }

    /**
     * @return array{key: string, name: ?string, submit_label: string, fields: list<array<string, mixed>>}|null
     */
    public function read(DOMElement $el): ?array
    {
        $form = strtolower($el->tagName) === 'form' ? $el : Dom::firstTag($el, 'form');
        if ($form === null) {
            return null;
        }

        $this->dropped = [];
        $ids = [];
        foreach (Dom::descendants($form) as $node) {
            if (($id = $node->getAttribute('id')) !== '') {
                $ids[$id] = $node;
            }
        }

        $fields = [];
        $groups = [];
        $submit = '';

        foreach (Dom::descendants($form) as $control) {
            $tag = strtolower($control->tagName);
            if (! in_array($tag, ['input', 'select', 'textarea', 'button'], true)) {
                continue;
            }
            $type = strtolower($control->getAttribute('type') ?: ($tag === 'button' ? 'submit' : 'text'));

            if (in_array($type, ['submit', 'button'], true) || ($tag === 'input' && $type === 'image')) {
                $submit = $submit !== '' ? $submit : (Dom::text($control) ?: trim($control->getAttribute('value')));

                continue;
            }
            if ($tag === 'button' || in_array($type, ['hidden', 'reset', 'password'], true) || self::hidden($control, $form)) {
                continue;
            }

            $raw = $control->getAttribute('name');
            if ($raw !== '' && preg_match(self::SKIP_NAME, $raw)) {
                continue;
            }

            $label = $this->label($control, $ids, $form);

            if ($type === 'file') {
                $this->dropped[] = $label !== '' ? $label : 'A file upload';

                continue;
            }

            if (in_array($type, ['radio', 'checkbox'], true)) {
                $group = $raw !== '' ? $raw : 'group-'.count($groups);
                $groups[$group] ??= ['type' => $type, 'controls' => [], 'at' => count($fields)];
                $groups[$group]['controls'][] = $control;
                if (count($groups[$group]['controls']) === 1) {
                    $fields[] = ['group' => $group];
                }

                continue;
            }

            $kind = match (true) {
                $tag === 'textarea' => 'textarea',
                $tag === 'select' => 'select',
                $type === 'email' => 'email',
                $type === 'tel' => 'tel',
                $type === 'number' || $type === 'range' => 'number',
                $type === 'date' => 'date',
                $type === 'url' => 'url',
                default => 'text',
            };

            $field = [
                'kind' => $kind,
                'raw' => $control->getAttribute('data-original_id') ?: $raw,
                'label' => $label,
                'placeholder' => trim($control->getAttribute('placeholder')),
                'required' => self::required($control, $label),
                'width' => self::half($control, $form) ? 'half' : 'full',
            ];
            if ($kind === 'select') {
                $options = [];
                foreach (Dom::tags($control, 'option') as $n => $option) {
                    $text = Dom::text($option);
                    $value = trim($option->getAttribute('value'));
                    // Only a first option written with an empty value is a prompt; one with no value attribute is a choice named by its text.
                    if ($n === 0 && $value === '' && $option->hasAttribute('value')) {
                        $field['placeholder'] = $field['placeholder'] ?: $text;

                        continue;
                    }
                    if ($text !== '' || $value !== '') {
                        $options[] = ['value' => mb_substr($value !== '' ? $value : $text, 0, 150), 'label' => mb_substr($text !== '' ? $text : $value, 0, 150)];
                    }
                }
                if ($options === []) {
                    continue;
                }
                $field['options'] = array_slice($options, 0, 50);
            }
            $fields[] = $field;
        }

        // A group of radios or checkboxes, read once its last control is seen.
        foreach ($fields as $i => $field) {
            if (! isset($field['group'])) {
                continue;
            }
            $group = $groups[$field['group']];
            $fields[$i] = $this->group($group['type'], $group['controls'], $ids, $form, (string) $field['group']);
        }

        $fields = $this->named(array_values(array_filter($fields)));
        if ($fields === []) {
            return null;
        }

        $valid = Validator::make(['fields' => $fields], array_filter(
            StoreFormRequest::formRules(),
            fn (string $key) => str_starts_with($key, 'fields'),
            ARRAY_FILTER_USE_KEY,
        ));
        if ($valid->fails()) {
            return null;
        }

        $title = trim($form->getAttribute('aria-label') ?: $form->getAttribute('name'));

        return [
            'key' => self::key($el, $form, $fields),
            'name' => $title !== '' && ! preg_match('/^(new form|form|contact form \d+)$/i', $title) ? mb_substr($title, 0, 150) : null,
            'submit_label' => mb_substr($submit !== '' ? $submit : 'Send', 0, 60),
            'fields' => $fields,
        ];
    }

    /**
     * @param  list<DOMElement>  $controls
     * @param  array<string, DOMElement>  $ids
     * @return array<string, mixed>|null
     */
    private function group(string $type, array $controls, array $ids, DOMElement $form, string $raw): ?array
    {
        $first = $controls[0];
        $container = Dom::closest($first, '/(wpcf7-form-control-wrap|wpforms-field|gfield|elementor-field-group|et_pb_contact_field|form-group|field|fieldset)/', $form);
        $legend = $container ? (Dom::text(Dom::firstTag($container, 'legend')) ?: Dom::text(Dom::first($container, '/(wpforms-field-label|gfield_label|field-label)$/'))) : '';

        // A lone tick box — "I agree to be contacted" — is a tick box.
        if ($type === 'checkbox' && count($controls) === 1) {
            $label = self::bare($this->label($first, $ids, $form) ?: $legend);

            return $label === '' ? null : ['kind' => 'checkbox', 'raw' => $raw, 'label' => $label, 'required' => self::required($first, $label), 'width' => 'full'];
        }

        $options = [];
        foreach ($controls as $control) {
            $text = self::bare($this->label($control, $ids, $form));
            $value = trim($control->getAttribute('value'));
            if ($text === '' && $value === '') {
                continue;
            }
            $options[] = ['value' => mb_substr($value !== '' ? $value : $text, 0, 150), 'label' => mb_substr($text !== '' ? $text : $value, 0, 150)];
        }
        if ($options === []) {
            return null;
        }

        return [
            // A group with one choice in it is not a choice between things;
            // a dropdown is the kind that may hold a single option.
            'kind' => count($options) < 2 ? 'select' : ($type === 'radio' ? 'radio' : 'checkboxes'),
            'raw' => $raw,
            'label' => $legend !== '' ? self::bare($legend) : (string) Str::of($raw)->afterLast('[')->before(']')->replace(['-', '_'], ' ')->ucfirst(),
            'required' => self::required($first, $legend),
            'width' => 'full',
            'options' => array_slice($options, 0, 50),
        ];
    }

    /** @param  array<string, DOMElement>  $ids */
    private function label(DOMElement $control, array $ids, DOMElement $form): string
    {
        $id = $control->getAttribute('id');
        if ($id !== '') {
            foreach (Dom::tags($form, 'label') as $label) {
                if ($label->getAttribute('for') === $id) {
                    return self::bare(self::labelText($label));
                }
            }
        }

        // A label wrapped round the control.
        for ($node = $control->parentNode; $node instanceof DOMElement && ! $node->isSameNode($form); $node = $node->parentNode) {
            if (strtolower($node->tagName) === 'label') {
                return self::bare(self::labelText($node));
            }
        }

        if (($aria = trim($control->getAttribute('aria-label'))) !== '') {
            return self::bare($aria);
        }
        if (($by = $control->getAttribute('aria-labelledby')) !== '' && isset($ids[$by])) {
            return self::bare(Dom::text($ids[$by]));
        }

        // The field's group label: WPForms, Gravity, Elementor, Divi.
        $group = Dom::closest($control, '/^(wpforms-field|gfield|elementor-field-group|et_pb_contact_field|form-group|form-row|frm_form_field)$/', $form);
        if ($group && ($label = Dom::firstTag($group, 'label', 'legend'))) {
            return self::bare(self::labelText($label));
        }

        return self::bare(trim($control->getAttribute('placeholder')));
    }

    /** A label's own words, without the options of a select it wraps. */
    private static function labelText(DOMElement $label): string
    {
        $copy = $label->cloneNode(true);
        if (! $copy instanceof DOMElement) {
            return '';
        }
        foreach (Dom::tags($copy, 'select', 'textarea', 'option') as $inner) {
            $inner->parentNode?->removeChild($inner);
        }

        return Dom::text($copy);
    }

    private static function bare(string $text): string
    {
        return trim((string) preg_replace('/\s*(\*|\(required\))\s*$/i', '', trim($text)));
    }

    private static function required(DOMElement $control, string $label): bool
    {
        return $control->hasAttribute('required')
            || strtolower($control->getAttribute('aria-required')) === 'true'
            || Dom::has($control, '/(wpcf7-validates-as-required|required)$/')
            || Dom::closest($control, '/^(gfield_contains_required|elementor-field-required|wpforms-field-required)$/') !== null;
    }

    private static function half(DOMElement $control, DOMElement $form): bool
    {
        return Dom::closest($control, '/(one-half|wpforms-one-half|gf_left_half|gf_right_half|elementor-col-50|et_pb_contact_field_half|col-md-6|col-sm-6|half)$/', $form) !== null;
    }

    private static function hidden(DOMElement $control, DOMElement $form): bool
    {
        for ($node = $control; $node instanceof DOMElement && ! $node->isSameNode($form); $node = $node->parentNode) {
            if (Dom::hidden($node) || Dom::has($node, self::HONEYPOT)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Each field's key: the plugin's own name where it says something, the
     * label otherwise; unique, `^[a-z][a-z0-9_]*$`, never `website`.
     *
     * @param  list<array<string, mixed>>  $fields
     * @return list<array<string, mixed>>
     */
    private function named(array $fields): array
    {
        $used = [];
        $out = [];

        foreach (array_slice($fields, 0, 30) as $field) {
            $label = trim((string) ($field['label'] ?? ''));
            $name = self::fromRaw((string) ($field['raw'] ?? ''));
            if ($name === null || preg_match('/^(field|input|item|text|textarea|select|checkbox|radio)(_\d+)?$/', $name)) {
                $name = Str::slug((string) preg_replace('/^your\s+/i', '', $label), '_') ?: null;
            }
            if ($name === null || $name === '') {
                $name = $field['kind'] === 'email' ? 'email' : 'field';
            }
            if (! preg_match('/^[a-z]/', $name)) {
                $name = 'field_'.$name;
            }
            $name = mb_substr($name === 'website' ? 'website_url' : $name, 0, 56);
            $base = $name;
            for ($n = 2; isset($used[$name]); $n++) {
                $name = $base.'_'.$n;
            }
            $used[$name] = true;

            if ($label === '') {
                $label = Str::of($name)->replace('_', ' ')->ucfirst()->toString();
            }

            $out[] = array_filter([
                'kind' => $field['kind'],
                'name' => $name,
                'label' => mb_substr($label, 0, 150),
                'placeholder' => ($p = (string) ($field['placeholder'] ?? '')) !== '' && $p !== $label ? mb_substr($p, 0, 150) : null,
                'required' => (bool) ($field['required'] ?? false),
                'width' => $field['width'] ?? 'full',
                'options' => $field['options'] ?? null,
            ], fn ($v) => $v !== null);
        }

        return $out;
    }

    /** `your-email` → `email`, `form_fields[name]` → `name`, `wpforms[fields][3]` → null. */
    private static function fromRaw(string $raw): ?string
    {
        if ($raw === '') {
            return null;
        }
        if (preg_match_all('/\[([^\]]*)\]/', $raw, $m)) {
            $parts = array_values(array_filter($m[1], fn ($p) => $p !== ''));
            $raw = (string) end($parts);
        }
        // A generated id (`field_9c1b2`, `input_3`) says nothing; the label will.
        if (preg_match('/^(field|input)[-_][0-9a-z]*\d[0-9a-z]*$/i', $raw)) {
            return null;
        }
        $raw = (string) preg_replace('/^(your|wpforms|input|field|form_fields|item_meta|et_pb_contact)[-_]?/i', '', $raw);
        $raw = (string) preg_replace('/[-_]\d+$/', '', $raw);
        if ($raw === '' || ! preg_match('/^[a-z]/i', $raw) || preg_match('/^[0-9a-f]{6,}$/i', $raw)) {
            return null;
        }
        $slug = Str::slug(Str::snake($raw), '_');

        return $slug !== '' ? $slug : null;
    }

    /** @param  list<array<string, mixed>>  $fields */
    private static function key(DOMElement $wrapper, DOMElement $form, array $fields): string
    {
        foreach ([$wrapper, $form, ...Dom::descendants($wrapper)] as $node) {
            $id = $node->getAttribute('id');
            if (preg_match('/^wpcf7-f(\d+)-/', $id, $m)) {
                return 'cf7:'.$m[1];
            }
            if (preg_match('/^wpforms-form-(\d+)$/', $id, $m) || ($node->getAttribute('data-formid') !== '' && Dom::has($node, '/^wpforms-form$/') && preg_match('/^(\d+)$/', $node->getAttribute('data-formid'), $m))) {
                return 'wpforms:'.$m[1];
            }
            if (preg_match('/^gform_(\d+)$/', $id, $m)) {
                return 'gform:'.$m[1];
            }
            if (strtolower($node->tagName) === 'input' && in_array($node->getAttribute('name'), ['_wpcf7', 'form_id'], true) && $node->getAttribute('value') !== '') {
                return ($node->getAttribute('name') === '_wpcf7' ? 'cf7:' : 'elementor:').$node->getAttribute('value');
            }
        }

        /*
         * Hashed over the kinds as they were named before 0.117.0. This key
         * is how a second import finds the form the first one made, so the
         * day a radio group stopped being read as a dropdown must not be the
         * day every such form is imported again as a copy.
         */
        $legacy = ['radio' => 'select', 'checkboxes' => 'select', 'date' => 'text', 'url' => 'text'];

        return 'fields:'.substr(sha1(implode('|', array_map(fn ($f) => ($legacy[$f['kind']] ?? $f['kind']).':'.$f['name'], $fields))), 0, 16);
    }
}
