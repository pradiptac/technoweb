<?php

namespace App\Support\Messaging;

use App\Models\Customer;

/**
 * Who an event message is for, as far as the caller knows.
 *
 * The caller says what it holds — an account, a mobile number typed at the
 * checkout — and the messaging module decides which channels that reaches:
 * a WhatsApp or RCS contact is looked up by the number (E.164), a push
 * subscription by the customer. Nothing here implies consent; `Messenger`
 * sends only to a contact row that records an opt-in and no opt-out.
 */
final readonly class MessageRecipient
{
    public function __construct(
        public ?int $customerId = null,
        public ?string $phone = null,
        public ?string $name = null,
    ) {}

    public static function customer(Customer $customer): self
    {
        return new self($customer->id, $customer->phone, $customer->name);
    }
}
