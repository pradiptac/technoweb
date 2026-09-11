{{-- The finished document, already themed and CSS-inlined by `Templates`.
     `MailChannel::buildView()` returns `$message->view` verbatim when it is
     set, which is the documented seam for supplying our own body *and* our own
     text part — the markdown path renders one view for both halves, so it
     cannot carry two different bodies. --}}
{!! $document !!}
