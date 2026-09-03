"use client";

import { useEffect, useRef } from "react";

/**
 * Tell the browser a password sign-in succeeded, so it offers to save it.
 *
 * **Why this is needed at all.** Chrome, Firefox and every password manager
 * built on their hooks decide "a login just happened" by watching a real form
 * submission navigate. React 19 Server Actions do not submit — React calls
 * `preventDefault()` and posts the form over `fetch()`, which was measured
 * here: submitting `/portal/login` produces exactly one POST, `fetch`, with
 * `isNavigationRequest() === false`. The browser therefore never sees a login,
 * never offers to save the password, and — because it has nothing saved for
 * the origin — never offers to fill one either. Both halves of "no save prompt
 * and no password prompt" are that one fact.
 *
 * `navigator.credentials.store()` is the API for exactly this case: a page
 * that knows a credential worked, in a flow the browser cannot infer.
 *
 * **Stored on unmount, deliberately.** The server action `redirect()`s on
 * success, which is what makes the no-JavaScript path work and is worth
 * keeping — so there is no "success" value for the client to react to. What
 * there is instead: this component is still mounted when a sign-in fails (it
 * re-renders carrying the error) and is unmounted when one succeeds, because
 * the redirect navigates away from it. So the cleanup is the success signal.
 *
 * The two guards are what stop it prompting on a password that did not work:
 * nothing is stored unless a submit actually happened, and nothing is stored
 * if the last action state carried an error.
 */
export function useStoreCredentialOnSuccess(
  /** Read at unmount — pass a getter, not a value, or it closes over a stale render. */
  read: () => { email: string; password: string; failed: boolean } | null,
) {
  const latest = useRef(read);

  /*
    Assigned in an effect, not during render — a ref write during render is
    impure and `react-hooks/refs` refuses it. This runs after every render, so
    by the time the unmount cleanup below reads it, it holds the getter from
    the last render rather than the one this hook first saw.
  */
  useEffect(() => {
    latest.current = read;
  });

  useEffect(() => () => {
    const submitted = latest.current();

    if (!submitted || submitted.failed) return;
    if (!submitted.email || !submitted.password) return;

    /*
      Chromium only, and that is fine — it degrades to what happens today
      everywhere else rather than throwing. Firefox and Safari expose
      `navigator.credentials` without `PasswordCredential`, so both checks
      are needed, not just the first.
    */
    const w = window as unknown as {
      PasswordCredential?: new (data: { id: string; password: string }) => Credential;
    };

    if (!navigator.credentials?.store || !w.PasswordCredential) return;

    try {
      const credential = new w.PasswordCredential({
        id: submitted.email,
        password: submitted.password,
      });

      // Fire and forget: the browser decides whether to prompt, and a refusal
      // here must never surface as an error on a sign-in that worked.
      void navigator.credentials.store(credential).catch(() => {});
    } catch {
      // A malformed credential is not worth reporting to somebody who has
      // just successfully signed in.
    }
  }, []);
}
