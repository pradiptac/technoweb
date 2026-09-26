<?php

namespace App\Support\Messaging\Providers;

use App\Models\MessageTemplate;
use App\Support\Mail\Placeholders;

/**
 * One message ready for a provider: where it goes, the template, and the
 * values to fill it with. Rendering lives here so every provider fills a
 * template the same way.
 */
final readonly class OutgoingMessage
{
    /**
     * @param  array<string, scalar|null>  $vars
     */
    public function __construct(
        public string $to,
        public MessageTemplate $template,
        public array $vars,
        public ?string $callbackUrl = null,
    ) {}

    public function body(): string
    {
        return $this->template->render($this->vars);
    }

    /**
     * The values in the order the body first uses them — a positional
     * provider's `{{1}}`, `{{2}}`. A blank value is sent as a dash: WhatsApp
     * refuses an empty parameter outright.
     *
     * @return list<string>
     */
    public function positionalValues(): array
    {
        return array_map(fn (string $name) => $this->value($name), $this->template->placeholderNames());
    }

    public function value(string $name): string
    {
        $value = trim((string) ($this->vars[$name] ?? ''));

        return $value === '' ? '-' : $value;
    }

    public function title(): ?string
    {
        $title = $this->template->push_title ?? $this->template->header_text;

        return filled($title) ? Placeholders::fillText((string) $title, $this->vars) : null;
    }

    public function link(): ?string
    {
        return filled($this->template->push_link) ? Placeholders::fillText((string) $this->template->push_link, $this->vars) : null;
    }

    /** @return list<array{type: string, text: string, value: string}> */
    public function buttons(): array
    {
        return array_values(array_map(fn (array $b) => [
            'type' => (string) ($b['type'] ?? 'reply'),
            'text' => (string) ($b['text'] ?? ''),
            'value' => Placeholders::fillText((string) ($b['value'] ?? ''), $this->vars),
        ], (array) ($this->template->buttons ?? [])));
    }
}
