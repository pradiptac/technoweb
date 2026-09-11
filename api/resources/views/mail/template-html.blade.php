{{--
    An editor's body, inside the branded shell.

    Rendered through `Illuminate\Mail\Markdown::render()`, which is what
    registers the `mail::` component namespace and inlines the theme CSS. The
    body passes through CommonMark untouched: the framework's converter sets
    only `allow_unsafe_links => false` and never `html_input`, so the default
    of `allow` stands.

    `{!! !!}` is the sink rather than a hole. The HTML was sanitised on write
    through the same `HtmlSanitiser::clean()` profile every other body in this
    product goes through, and its placeholders are already filled and escaped —
    escaping again here would show the editor their own tags.
--}}
<x-mail::message>
{!! $html !!}
</x-mail::message>
