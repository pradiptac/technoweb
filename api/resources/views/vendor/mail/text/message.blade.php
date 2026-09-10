@php($shell = \App\Support\Mail\Shell::class)
<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="$shell::siteUrl()">
{{ $shell::company() }}
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{{ $slot }}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{{ $subcopy }}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer. No unsubscribe line — see the HTML half for why. --}}
{{-- The company is named once, by the copyright line. See the HTML half. --}}
<x-slot:footer>
<x-mail::footer>
@if ($address = $shell::address())
{{ $address }}
@endif
© {{ date('Y') }} {{ $shell::company() }}. @lang('All rights reserved.')
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
