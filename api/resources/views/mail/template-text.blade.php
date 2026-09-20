{{-- The same shell in its text form, around a body that either the editor
     wrote or `HtmlSanitiser::toEmailText()` derived. --}}
<x-mail::message>
{!! $text !!}
</x-mail::message>
