{{--
    A tax invoice (0.176.0, `docs/store.md` "The GST invoice").

    One template, two outputs: the console's print view serves it as a page
    and dompdf renders the same string into the stored file. That is the
    whole reason it is written the way it is — **tables and inline-ish CSS
    in one `<style>` block, no flexbox, no grid, no custom property and no
    web font**. dompdf implements roughly CSS 2.1: a layout built on flex
    renders perfectly in the browser and collapses into one column in the
    file, and the file is the copy somebody keeps.

    Nothing here decides anything. Every figure, every label and the
    CGST/SGST-against-IGST choice arrive already made on `$invoice`
    (`GstInvoice`), so the page and the PDF cannot disagree and neither can
    disagree with the order.

    It is deliberately plain. An invoice is read by an accountant and filed;
    the design budget belongs on the shop.
--}}
@php
    use App\Support\Money;

    /** @var \App\Support\Store\Invoice\GstInvoice $invoice */
    $order = $invoice->order;
    $seller = $invoice->seller;
    $buyer = $invoice->buyer;
    $totals = $invoice->totals;

    $address = static function (?array $a): string {
        if (! is_array($a)) {
            return '';
        }

        $parts = array_filter([
            $a['line1'] ?? null,
            $a['line2'] ?? null,
            trim(implode(' ', array_filter([$a['city'] ?? null, $a['pin'] ?? null]))),
            $a['state'] ?? null,
            $a['country'] ?? null,
        ], static fn ($v) => filled($v));

        return implode('<br>', array_map(static fn ($v) => e($v), $parts));
    };
@endphp
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tax invoice {{ $order->invoice_number ?? $order->order_number }}</title>
<style>
    @page { margin: 14mm 12mm; }
    body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #111; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    .wrap { border: 1px solid #111; }
    .pad { padding: 6px 8px; }
    .head { border-bottom: 1px solid #111; }
    .title { font-size: 15px; font-weight: bold; letter-spacing: .04em; text-align: center; padding: 6px 0; border-bottom: 1px solid #111; }
    .party { width: 50%; vertical-align: top; border-right: 1px solid #111; }
    .party.last { border-right: 0; }
    .label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
    .name { font-weight: bold; font-size: 11px; }
    .lines th { background: #f2f2f2; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; }
    .lines th, .lines td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .mid { text-align: center; }
    .totals td { padding: 3px 8px; }
    .totals .k { text-align: right; }
    .totals .v { text-align: right; width: 110px; white-space: nowrap; }
    .grand td { border-top: 1px solid #111; font-weight: bold; font-size: 11px; }
    .words { border-top: 1px solid #111; }
    .foot td { border-top: 1px solid #111; vertical-align: top; width: 50%; }
    .sign { text-align: right; }
    .sign img { max-height: 46px; }
    .muted { color: #555; }
    .pre { white-space: pre-line; }
</style>
</head>
<body>
<table class="wrap">
    <tr><td colspan="2" class="title">TAX INVOICE</td></tr>

    <tr class="head">
        <td class="party pad">
            @if (filled($logo ?? null))
                <img src="{{ $logo }}" alt="" style="max-height:38px;margin-bottom:6px">
            @endif
            <div class="name">{{ $seller['name'] }}</div>
            @if (filled($seller['address']))
                <div class="pre muted">{{ $seller['address'] }}</div>
            @endif
            @if (filled($seller['gstin']))
                <div><strong>GSTIN:</strong> {{ $seller['gstin'] }}</div>
            @endif
            @if (filled($seller['state']))
                <div><strong>State:</strong> {{ $seller['state'] }} ({{ $seller['state_code'] }})</div>
            @endif
            @if (filled($seller['email']) || filled($seller['phone']))
                <div class="muted">{{ collect([$seller['email'], $seller['phone']])->filter()->implode(' · ') }}</div>
            @endif
        </td>
        <td class="party last pad">
            <table>
                <tr><td class="label">Invoice no.</td><td class="num"><strong>{{ $order->invoice_number ?? '—' }}</strong></td></tr>
                <tr><td class="label">Invoice date</td><td class="num">{{ $order->invoice_date?->format('d M Y') ?? '—' }}</td></tr>
                <tr><td class="label">Order no.</td><td class="num">{{ $order->order_number }}</td></tr>
                @if ($order->placed_at)
                    <tr><td class="label">Order date</td><td class="num">{{ $order->placed_at->format('d M Y') }}</td></tr>
                @endif
                <tr><td class="label">Place of supply</td><td class="num">{{ $invoice->placeOfSupply ? \App\Support\IndianStates::name($invoice->placeOfSupply).' ('.$invoice->placeOfSupply.')' : '—' }}</td></tr>
                <tr><td class="label">Reverse charge</td><td class="num">No</td></tr>
            </table>
        </td>
    </tr>

    <tr class="head">
        <td class="party pad">
            <div class="label">Billed to</div>
            <div class="name">{{ $buyer['company'] ?: $buyer['name'] }}</div>
            @if (filled($buyer['company']) && filled($buyer['name']))
                <div>{{ $buyer['name'] }}</div>
            @endif
            <div>{!! $address($buyer['billing']) !!}</div>
            @if (filled($buyer['gstin']))
                <div><strong>GSTIN:</strong> {{ $buyer['gstin'] }}</div>
            @endif
            <div class="muted">{{ collect([$buyer['email'], $buyer['phone']])->filter()->implode(' · ') }}</div>
        </td>
        <td class="party last pad">
            <div class="label">Delivered to</div>
            @if (filled($buyer['shipping']))
                <div>{!! $address($buyer['shipping']) !!}</div>
            @else
                {{-- Null, never a copy of the billing address: a digital
                     licence does not travel, and printing an address for one
                     puts a courier label on something that never moves. --}}
                <div class="muted">Same as the billing address.</div>
            @endif
        </td>
    </tr>
</table>

<table class="lines" style="margin-top:8px">
    <thead>
        <tr>
            <th style="width:22px">#</th>
            <th>Description</th>
            <th style="width:56px">HSN/SAC</th>
            <th style="width:34px">Qty</th>
            <th style="width:78px">Taxable</th>
            @if ($invoice->interState)
                <th style="width:40px">IGST</th>
                <th style="width:78px">Amount</th>
            @else
                <th style="width:40px">CGST</th>
                <th style="width:70px">Amount</th>
                <th style="width:40px">SGST</th>
                <th style="width:70px">Amount</th>
            @endif
            <th style="width:84px">Total</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($invoice->lines as $i => $line)
            <tr>
                <td class="mid">{{ $i + 1 }}</td>
                <td>{{ $line['description'] }}</td>
                <td class="mid">{{ $line['hsn'] ?? '—' }}</td>
                <td class="mid">{{ $line['quantity'] }}</td>
                <td class="num">{{ Money::format($line['taxable_paise'], true) }}</td>
                @if ($invoice->interState)
                    <td class="mid">{{ $line['rate'] ? $line['rate'].'%' : '—' }}</td>
                    <td class="num">{{ Money::format($line['igst_paise'], true) }}</td>
                @else
                    <td class="mid">{{ $line['basis_points'] !== null ? Money::ratePercent(intdiv($line['basis_points'], 2)).'%' : '—' }}</td>
                    <td class="num">{{ Money::format($line['cgst_paise'], true) }}</td>
                    <td class="mid">{{ $line['basis_points'] !== null ? Money::ratePercent(intdiv($line['basis_points'], 2)).'%' : '—' }}</td>
                    <td class="num">{{ Money::format($line['sgst_paise'], true) }}</td>
                @endif
                <td class="num">{{ Money::format($line['total_paise'], true) }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

@if (count($invoice->summary) > 1)
    {{-- Printed only when it says something the lines above do not. On a
         single-rate order it is the same row twice. --}}
    <table class="lines" style="margin-top:8px">
        <thead>
            <tr>
                <th>HSN/SAC</th>
                <th style="width:60px">Rate</th>
                <th style="width:90px">Taxable</th>
                @if ($invoice->interState)
                    <th style="width:90px">IGST</th>
                @else
                    <th style="width:90px">CGST</th>
                    <th style="width:90px">SGST</th>
                @endif
                <th style="width:90px">Total tax</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($invoice->summary as $row)
                <tr>
                    <td>{{ $row['hsn'] ?? '—' }}</td>
                    <td class="mid">{{ $row['rate'] ? $row['rate'].'%' : '—' }}</td>
                    <td class="num">{{ Money::format($row['taxable_paise'], true) }}</td>
                    @if ($invoice->interState)
                        <td class="num">{{ Money::format($row['igst_paise'], true) }}</td>
                    @else
                        <td class="num">{{ Money::format($row['cgst_paise'], true) }}</td>
                        <td class="num">{{ Money::format($row['sgst_paise'], true) }}</td>
                    @endif
                    <td class="num">{{ Money::format($row['gst_paise'], true) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
@endif

<table class="wrap" style="margin-top:8px">
    <tr>
        <td style="vertical-align:top;width:52%;border-right:1px solid #111" class="pad">
            @if (filled($bank ?? null))
                <div class="label">Bank details</div>
                <div class="pre">{{ $bank }}</div>
            @endif
            @if (filled($terms ?? null))
                <div class="label" style="margin-top:6px">Terms</div>
                <div class="pre muted">{{ $terms }}</div>
            @endif
        </td>
        <td style="vertical-align:top" class="pad">
            <table class="totals">
                <tr><td class="k">Taxable value</td><td class="v">{{ Money::format($totals['taxable_paise'], true) }}</td></tr>
                @if ($invoice->interState)
                    <tr><td class="k">IGST</td><td class="v">{{ Money::format($totals['igst_paise'], true) }}</td></tr>
                @else
                    <tr><td class="k">CGST</td><td class="v">{{ Money::format($totals['cgst_paise'], true) }}</td></tr>
                    <tr><td class="k">SGST</td><td class="v">{{ Money::format($totals['sgst_paise'], true) }}</td></tr>
                @endif
                <tr class="grand"><td class="k">Total</td><td class="v">{{ Money::format($totals['total_paise'], true) }}</td></tr>
            </table>
        </td>
    </tr>
    <tr class="words">
        <td colspan="2" class="pad"><span class="label">Amount in words</span> {{ $totals['in_words'] }}</td>
    </tr>
    <tr class="foot">
        <td class="pad">
            @if (filled($declaration ?? null))
                <div class="label">Declaration</div>
                <div class="pre muted">{{ $declaration }}</div>
            @endif
        </td>
        <td class="pad sign">
            <div class="muted">For {{ $seller['name'] }}</div>
            @if (filled($signature ?? null))
                <div style="margin:6px 0"><img src="{{ $signature }}" alt=""></div>
            @else
                <div style="height:46px"></div>
            @endif
            <div>{{ $signatory ?? 'Authorised signatory' }}</div>
        </td>
    </tr>
</table>

{{-- An electronic document needs to say it is one, or a reader looks for a
     wet signature that was never going to be there. --}}
<p class="muted" style="text-align:center;margin-top:8px">
    This is a computer-generated invoice.
</p>
</body>
</html>
