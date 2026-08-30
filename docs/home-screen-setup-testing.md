# Home Screen setup and sign-in transfer

## Deployment requirements

- Serve on HTTPS, on the same exact hostname used for sign-in and installation.
- Existing Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_PATH`) must support Auth user lookup/custom-token signing and Firestore reads/writes. No new secret or authentication provider is needed with the existing private-key service account configuration.
- Existing `NEXT_PUBLIC_FIREBASE_VAPID_KEY` and Firebase messaging configuration remain required for notifications. The VAPID key is a build-time value; changing it requires a rebuild.
- Recommended housekeeping: enable Firestore TTL for collection group `installHandoffs`, field `expiresAt`. Expiry is enforced in application code even without TTL. TTL only removes expired, unused records; normal redemption/logout deletes them immediately. No new Firestore client permission is needed: the existing catch-all rule denies access to this server-only collection.
- No deployment or Firebase configuration has been changed by these source edits.

## Security and behavior

The browser prepares a 30-minute, single-use random ticket using a verified, non-revoked Firebase ID token. Only the ticket's SHA-256 hash is stored server-side. The opaque ticket is an HttpOnly, Secure, SameSite=Strict, host-only cookie. No password, ID token, or custom token appears in a URL or log.

On the installed app's first launch, Firebase persistence is checked first. If the app is not signed in, the cookie may be redeemed once, using a same-origin POST-like PUT request with a required custom header. Redemption checks expiry, account existence, disabled/revoked status, and profile existence before returning a custom token. It never overrides an existing login. The ordinary sign-in screen is the fallback for expired, missing, unsupported, or failed transfers.

Explicit logout removes the pending ticket and suppresses automatic restore locally, including after reload. Account deletion removes pending tickets. Already-established sessions on other devices retain normal Firebase logout behavior; this is not a global logout feature.

## Real-device acceptance test (required before declaring the handoff verified)

Use a test account on an iPhone running iOS 17.2 or later. Apple documents cookie copying on installation; it does not copy Firebase's browser storage. Desktop emulation cannot verify this OS behavior.

1. Deploy the changes to a same-host HTTPS environment. Remove only the test installation, if present (this removes that installation's local state, not the account).
2. Open Safari, sign in, and log the first skip. Tap **Add to Home Screen** and wait for preparation to finish before following the Share-menu instructions.
3. Add the app, then open its new Home Screen icon within 30 minutes. Do not merely return to Safari. Verify the same account opens without entering credentials and all goals/skips are unchanged.
4. Verify **Get one weekly reminder?** opens automatically, without another skip. Tap **Allow one weekly reminder**; only then should the OS permission dialog appear.
5. Grant permission. Verify the profile is opted in and the device token is registered. Test notification delivery separately; permission acceptance alone does not prove delivery.
6. Close and reopen: no sign-in or reminder prompt should repeat. Repeat with **Maybe later** and OS **Don't Allow** and verify those choices are respected. Profile settings remain available for opting in later.
7. Test a fresh account through a fundraiser invitation as well as direct reward signup. First-skip onboarding must not be covered by the reminder popup.
8. Test existing signed-in Home Screen users and Android Chrome: no login regression; notifications appear only in the installed app when eligible.
9. Negative cases: missing cookie/older pre-update installation, expired transfer, offline launch, logout before first launch, and deleted account. These must fall back to ordinary sign-in without signing in as another account.

Existing installations cannot retroactively receive a cookie from Safari. To test the transfer, create a new Home Screen installation after loading the updated site. A missing/expired cookie may still require one manual login.

## References

- Apple cookie-copy behavior: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/
- Firebase custom-token sign-in: https://firebase.google.com/docs/auth/admin/create-custom-tokens
