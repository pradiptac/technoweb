<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Form;
use Illuminate\Database\Seeder;

/**
 * The contact form, as a form an editor can now edit.
 *
 * Its fields deliberately mirror what the hard-coded enquiry form already
 * collects, so replacing one with the other changes who can edit it and
 * nothing else. The enquiry endpoint and its table stay where they are —
 * this is an addition, not a migration of existing data.
 */
class FormSeeder extends Seeder
{
    public function run(): void
    {
        $form = Form::updateOrCreate(
            ['slug' => 'contact'],
            [
                'name' => 'Contact',
                'status' => PublishStatus::Published,
                'submit_label' => 'Send enquiry',
                'success_message' => 'Thank you — we have your enquiry and will be in touch shortly.',
                // Null on purpose: it falls back to the sales_email setting,
                // so the address stays in one place rather than two.
                'notify_email' => null,
            ],
        );

        // Only built when the form has no fields, so a re-seed cannot undo an
        // editor's changes.
        if ($form->fields()->exists()) {
            return;
        }

        $fields = [
            ['kind' => 'text', 'name' => 'name', 'label' => 'Your name', 'required' => true, 'width' => 'half'],
            ['kind' => 'email', 'name' => 'email', 'label' => 'Work email', 'required' => true, 'width' => 'half'],
            ['kind' => 'tel', 'name' => 'phone', 'label' => 'Phone', 'width' => 'half'],
            ['kind' => 'text', 'name' => 'company', 'label' => 'Company', 'width' => 'half'],
            ['kind' => 'text', 'name' => 'subject', 'label' => 'Subject'],
            [
                'kind' => 'textarea', 'name' => 'message', 'label' => 'How can we help?', 'required' => true,
                'help' => 'Site size, what it has to do, and anything already in place.',
            ],
        ];

        foreach ($fields as $i => $field) {
            $form->fields()->create($field + ['sort_order' => $i]);
        }
    }
}
