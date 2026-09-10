@props(['url'])
{{--
    The site's own mark, or its name when no logo has been uploaded.

    Laravel's stock version of this file checks `trim($slot) === 'Laravel'` and
    swaps in a hosted PNG from laravel.com. That is a third-party request in
    every email this business sends, pointing at somebody else's logo, so it is
    gone.

    `width` is set as an attribute and the height is left to the ratio: Outlook
    ignores CSS sizing on an image, and a mark that is 600x81 rendering at its
    natural width would be twice the width of the email.
--}}
<tr>
<td class="header">
<a href="{{ $url }}" style="display: inline-block;">
@if ($logo = \App\Support\Mail\Shell::logoUrl())
<img src="{{ $logo }}" class="logo" width="180" alt="{{ \App\Support\Mail\Shell::company() }}">
@else
{!! $slot !!}
@endif
</a>
</td>
</tr>
