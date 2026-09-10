@php($shell = \App\Support\Mail\Shell::class)
<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="$shell::siteUrl()">
{{ $shell::company() }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{--
    Footer.

    The company, then the postal address when one is set, then the year. There
    is deliberately **no unsubscribe link**: this wraps receipts, sign-in codes
    and dispatch notices, and nobody can opt out of being told their order has
    shipped. The newsletter's own footer carries one because a campaign is
    obliged to; that is a different renderer for a different kind of message.
--}}
{{--
    The address, then the copyright line — and the company name is printed
    once, by the second of them.

    The first cut printed it on its own line as well, which read as
    "Technoware / Technoware Unit 4, Lakeview… / © 2026 Technoware." on this
    install: the stored `address` setting already opens with the company name,
    because that is how somebody writes an address. Whether it does is a
    property of what a client typed, so the footer cannot assume either way —
    it prints the address as given and names the company exactly once itself.
--}}
<x-slot:footer>
<x-mail::footer>
@if ($address = $shell::address())
{{ $address }}

@endif
© {{ date('Y') }} {{ $shell::company() }}. {{ __('All rights reserved.') }}
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
