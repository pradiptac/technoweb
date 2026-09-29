<?php

/*
 * The public half of the key releases are signed with (release/build.mjs).
 *
 * The updater refuses a release zip whose `release.json.sig` does not verify
 * against this key, which is what stops a tampered or third-party zip being
 * installed through System → Updates. Replacing it is a deliberate act: an
 * install only trusts a new key once a release carrying it has been applied.
 */

return [
    /*
     * A `--worktree` build is a supplier's test, never a release. Refused
     * unless this is on — for the supplier's own staging install only, set in
     * its config/api.env. Never on a customer's.
     */
    'allow_test_builds' => (bool) env('RELEASE_ALLOW_TEST_BUILDS', false),

    'public_key' => '2KoYCxCeYKMn+5Umf+3fW+yVvkU2+zx/j6xGgs5ryE4=',
];
