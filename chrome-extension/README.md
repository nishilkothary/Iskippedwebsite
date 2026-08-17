# iSkipped Chrome Extension MVP

This folder is a standalone Chrome Manifest V3 extension. It lives in the same GitHub repository as the iSkipped web app, but it is intentionally separate from the Next.js build.

## How the MVP Works

1. The content script runs on selected shopping domains.
2. On cart or checkout-like URLs, it shows a small "Is there anything you can skip?" prompt.
3. The user chooses from a compact `I'm willing to skip` dropdown: entire cart, a detected cart item, or custom amount.
4. The extension opens the iSkipped web app at `/extension/skip`.
5. The web app uses the user's existing Firebase session to log the skip.

Users can dismiss the prompt for the current page, snooze all prompts for 24 hours, or mute prompts on a specific merchant. The popup settings panel can clear snoozes and site mutes during testing.

Amazon has a first-pass item parser: on Amazon cart pages, the dropdown includes the cart subtotal plus detected cart item rows when Amazon's markup exposes title and price. `Custom amount` is always available as the manual fallback. On generic sites where the extension cannot read a cart amount or items, it skips the dropdown and shows manual custom fields only.

Ticket platforms are supported generically for now: StubHub, Ticketmaster, SeatGeek, and Vivid Seats can trigger the checkout prompt, but they do not yet have platform-specific ticket parsing.

The extension does not authenticate with Firebase directly in v1. That keeps the first version small and makes the web app the source of truth for writes.

## Local Testing

1. Start the web app:

```bash
npm run dev
```

On Windows, if authenticated API calls fail locally with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, start the dev server with Node's system certificate store:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm.cmd run dev
```

2. Open Chrome and go to:

```txt
chrome://extensions
```

3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

```txt
chrome-extension
```

6. The extension defaults to production:

```txt
https://iskipped.com
```

For local testing, click the extension icon, expand `Settings`, set `iSkipped web app` to:

```txt
http://localhost:3000
```

7. Sign in to the selected iSkipped app in Chrome.
8. Visit a supported shopping cart page, or use the extension popup to manually log a skip from any active tab.

## Production Setup

The extension default app URL is:

```txt
https://iskipped.com
```

For local development, override it from the extension popup settings with `http://localhost:3000`.

## Next Iterations

- Add a first-run onboarding page for the extension.
- Add per-site prompt frequency settings.
- Improve cart total detection per major shopping site.
- Add direct Firebase auth inside the extension only after the handoff flow proves useful.
