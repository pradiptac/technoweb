# Careers

Vacancies, applications and the one unauthenticated upload.

Moved out of `CLAUDE.md` on 2026-09-14, verbatim and in the order they were
written. Each note is a rule and the measurement behind it; the one-line
form of every rule is still in `CLAUDE.md` under "Modules". Add a new
note here **and** its one-line rule there.

**The vacancies table is `job_openings`, and the model is `JobOpening`.**
Laravel owns `jobs` — it is the database queue's table, and
`QUEUE_CONNECTION=database` means it is in use. That collision is how the
careers migration failed the first time it ran.

**A CV is the only unauthenticated file upload in the product.** It goes to the
`local` disk — whose root is `storage/app/private`, and which is what "the
private disk" means here; there is no disk called `private` and asking for one
throws — under a hashed name, and is streamed by one route behind the admin
session. The upload allowlist checks `mimes:` **and** `mimetypes:`, because a
`.php` renamed `.pdf` passes the first and fails the second. No archives: zip
through a public form is "post me anything". `cv_path` and `cv_disk` never
appear in a response — a storage path in JSON is the first half of making a
file fetchable.

**Deleting a job application deletes its CV**, via the model's `deleting` hook
rather than in the prune, so it holds however a record is removed. The prune
therefore deletes rows **one at a time**: a mass `delete()` skips model events,
and fast-and-wrong there is a folder of strangers' CVs that no record points
at. Retention is `application_retention_days` (private `security` group,
default 180) with a 30-day floor.

**A closing date closes a vacancy by itself**, in three places that must agree:
the listing drops it, the detail 404s, and the apply endpoint refuses with a
422. The third is not redundant — a tab left open across the date would
otherwise post into a role nobody is hiring for.

**Job qualifications and experience levels are lookup tables, not enums** —
the opposite call from `TicketStatus`, because "B.E. Computer Science" is a
value the client adds to rather than a lifecycle code branches on. Neither can
be deleted while a vacancy uses it.

**A vacancy emits `JobPosting` structured data**, which is what puts it into
Google Jobs. `validThrough` and `baseSalary` are omitted rather than faked when
the closing date or salary is blank — salary is optional per role by design.

**A blank `location` means remote**, said in the admin field's own hint,
because it has to mean *something*: Google indexes no posting that carries
neither a `jobLocation` nor `jobLocationType: TELECOMMUTE`, and a role with an
empty location was previously emitting neither. `identifier` and
`directApply` are there too — the second because the form is on the page rather
than behind a job board.
