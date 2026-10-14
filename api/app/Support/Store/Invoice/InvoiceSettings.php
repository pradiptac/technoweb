<?php

namespace App\Support\Store\Invoice;

use App\Models\Setting;
use App\Support\IndianStates;

/**
 * The seller's half of a tax invoice: who is issuing it, from where, and
 * under which GSTIN (0.176.0, `docs/store.md` "The GST invoice").
 *
 * One reader of the private `invoicing` group, so a field is spelled once.
 * Everything else — the logo, the bank details, the place of supply — comes
 * from the row that already holds it; a second copy here would be a second
 * answer free to disagree with the first.
 *
 * **`ready()` is the switch and everything the switch needs.** An invoice
 * missing the seller's GSTIN is not a document with a gap in it, it is a tax
 * document that is not one — so the shop issues nothing at all until the
 * four below are filled in, and the console says which are missing rather
 * than failing quietly at the moment of the first sale. The shape is
 * `ZohoSettings::ready()`/`missing()`, deliberately: an operator meets the
 * two screens a month apart and they should answer the same way.
 */
final class InvoiceSettings
{
    /**
     * GSTIN: two state digits, a ten-character PAN, an entity digit, Z, and
     * a check character. Checked for shape and **never against a government
     * API** — the brief rules that out, and a lookup on a save is the cost
     * this project has already measured at twelve seconds on a contact form.
     * A typo in the thirteenth character is caught by whoever reads the
     * first invoice, which is the same place it is caught today.
     */
    public const GSTIN_PATTERN = '/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/';

    public static function enabled(): bool
    {
        return (bool) Setting::get('invoice_enabled', false);
    }

    public static function legalName(): ?string
    {
        return self::text('invoice_legal_name') ?? self::text('company_name');
    }

    public static function gstin(): ?string
    {
        $value = self::text('invoice_gstin');

        return is_string($value) ? strtoupper($value) : null;
    }

    /** The seller's state, as a two-letter code. The place of supply is the buyer's. */
    public static function stateCode(): ?string
    {
        $value = self::text('invoice_state');

        if ($value === null) {
            return null;
        }

        return IndianStates::isCode(strtoupper($value))
            ? strtoupper($value)
            : IndianStates::code($value);
    }

    public static function address(): ?string
    {
        return self::text('invoice_address') ?? self::text('address');
    }

    public static function email(): ?string
    {
        return self::text('invoice_email') ?? self::text('email');
    }

    public static function phone(): ?string
    {
        return self::text('invoice_phone') ?? self::text('phone');
    }

    /** The series prefix. `INV` unless somebody says otherwise. */
    public static function prefix(): string
    {
        $value = self::text('invoice_prefix');

        return $value !== null && preg_match('/^[A-Z0-9\/-]{1,10}$/', strtoupper($value)) === 1
            ? strtoupper($value)
            : 'INV';
    }

    /** The HS code a line falls back to when its product names none. */
    public static function defaultHsn(): ?string
    {
        return self::text('invoice_hsn_default');
    }

    public static function terms(): ?string
    {
        return self::text('invoice_terms');
    }

    public static function declaration(): ?string
    {
        return self::text('invoice_declaration');
    }

    public static function signatory(): ?string
    {
        return self::text('invoice_signatory');
    }

    public static function signaturePath(): ?string
    {
        return self::text('invoice_signature_path');
    }

    public static function bankDetails(): ?string
    {
        return self::text('bank_account_details');
    }

    /** Switched on, and holding everything an invoice cannot be issued without. */
    public static function ready(): bool
    {
        return self::enabled() && self::missing() === [];
    }

    /**
     * What is still wanted, as sentences in the order to do them.
     *
     * Four things, and each is on the document by law rather than by taste:
     * who is selling, under what registration, from which state (it is what
     * decides CGST+SGST against IGST, so without it the tax cannot even be
     * labelled), and where they are.
     *
     * The GSTIN's shape is checked here rather than only on save, because a
     * row edited straight in the database would otherwise put a malformed
     * registration number on every invoice from then on.
     *
     * @return list<string>
     */
    public static function missing(): array
    {
        $missing = [];

        if (blank(self::legalName())) {
            $missing[] = 'Enter the registered business name the invoice is issued in.';
        }

        $gstin = self::gstin();

        if (blank($gstin)) {
            $missing[] = 'Enter your GSTIN.';
        } elseif (preg_match(self::GSTIN_PATTERN, $gstin) !== 1) {
            $missing[] = 'The saved GSTIN is not a valid one. Check it and save again.';
        }

        if (blank(self::stateCode())) {
            $missing[] = 'Choose the state you are registered in — it decides whether a sale is CGST and SGST or IGST.';
        }

        if (blank(self::address())) {
            $missing[] = 'Enter the address the invoice is issued from.';
        }

        return $missing;
    }

    private static function text(string $key): ?string
    {
        $value = Setting::get($key);

        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
