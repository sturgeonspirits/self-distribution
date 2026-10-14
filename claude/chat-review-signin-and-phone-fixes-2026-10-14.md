# Review request: Zoho sign-in recovery and phone fixes (Claude, 2026-10-14)

Chat: read PROJECT_STATUS.md first.

Range: `97792db..a53fd24` on `codex/work`. Five commits, three changes. Only `netlify/functions/auth.js`, `index.html`, two test files and `PROJECT_STATUS.md` changed. No Apps Script or proxy changes.

**Deploy state:** Karl asked for these first two items to go out immediately, so `2026.10.14.49-WEB` (`a008e5b`, `db00115`, `2a258d2`) is **already in production** (promoted 2026-10-14, live site reports `.49`). This is a post-deploy review of those. Item 3 (`a53fd24`, `.50-WEB`) is **not deployed**; review before promotion.

`node --test tests/*.mjs tests/*.cjs`: 93 pass.

## 1. Zoho sign-in callback recovery — `a008e5b` (live)

Problem (Karl, on his Android phone): the callback returned raw JSON `{"ok":false,"error":"This Zoho sign-in link is invalid or expired."}`. `finishLogin` rejects any callback whose `state` does not equal the `distribution_zoho_state` cookie. That happens when sign-in starts in one browser or app (e.g. a Hub link tapped inside the Zoho Mail app) and Zoho returns to another (Chrome), and when the callback URL is revisited (Back, restored tab) after the cookie was cleared. Confirmed the live login already sends `redirect_uri=https://distribution.sturgeonspirits.com/api/auth?action=callback`, so this is not a host mismatch.

Change in `finishLogin`:
- State is decoded by signature/expiry first (`statePayload`); `payload` is set only when the cookie also matches. **The cookie check is unchanged: a code is never exchanged without a matching cookie.**
- `params.error` with a matching cookie → HTML "Zoho sign-in was cancelled" page (no auto-retry).
- No matching cookie or no code:
  - valid staff session cookie already present → 302 to `returnTo`;
  - validly signed, unexpired state without `retried` → 302 to `/api/auth?action=login&retried=1&return_to=…` (restarts once in the current browser);
  - otherwise (second failure, forged/garbled/expired state) → HTML page with a "Sign in with Zoho again" link.
- `beginLogin` stores `retried:true` in the new state when `retried=1` is passed, so at most one automatic restart.
- All other callback failures (token exchange, `verifyIdToken` throw, roster unavailable, not on roster) now return the same HTML page instead of JSON, with the same message text. `verifyIdToken` throws were previously unhandled (500).
- `returnTo` always goes through `safeReturnTo`; page text and href are HTML-escaped.
- `auth.js` gains `// App version` / `APP_VERSION` and an `X-App-Version` header on redirects and pages.

Please check:
- Login-CSRF: can the auto-restart or the "already signed in → redirect" path let an attacker's code be accepted, or bounce a victim somewhere off-site? (Restart only uses `returnTo` from a state we signed; the redirect target is `safeReturnTo`.)
- Loop bound: any path that restarts more than once (expired state with no cookie skips the restart and shows the page).
- `session` / `logout` actions and `requireStaffSession` are untouched; confirm.

Test: `tests/security-workflow.test.mjs` "Zoho callback without the matching state cookie recovers instead of showing raw JSON" covers restart, second-failure page, already-signed-in redirect, forged state, cancellation, and that a matching cookie still reaches the token exchange (and that no exchange happens otherwise).

## 2. Phone count mode: section menu label — `db00115`, `2a258d2` (live)

Problem (Karl): on a phone, Inventory's compact count mode hides `.appNav` with the other extra tools, and he couldn't tell how to reach Outreach or Orders & Accounts. `db00115` made the menu always visible; Karl then preferred the original layout, so `2a258d2` restores the hidden menu and only relabels the toggle: **"Outreach, Accounts & more tools"** (closed) / **"Back to simple counting"** (open). Net diff vs `97792db` is the label text plus a CSS comment. Test in `tests/inventory-counts.test.mjs` asserts the label.

Please check: the label fits on one or two lines at 360–412 px and the toggle still restores everything compact mode hides.

## 3. Phone redraw load reductions — `a53fd24` (not deployed, `.50-WEB`)

Problem (Karl, Android Chrome, Outreach > Campaigns): smeared tiles, a blank band, black blocks, and badge text with missing pixels. Karl reports no other site or app does this, so the Hub is the trigger. Claude loaded the page at 412 px with sample data in headless Chromium: layer tree was normal (root scroller ~412×7250, sticky header, 3 px busy bar), so no single bad layer was found. Two habits that keep the phone redrawing were changed:
- `#apiBusyBar::before` animation now runs only under `body.api-busy`; before, the infinite animation ran while the bar was invisible.
- `renderOutreachCampaigns()` builds the HTML string first and skips `innerHTML` + `refreshIcons()` when it equals the last render and `#outreachList` still has `data-view="campaigns"`. The outreach dispatcher deletes `dataset.view` whenever a non-campaign view is about to use the list.

Please check:
- Any other code path that writes `#outreachList` while the campaigns marker is set (would leave a stale list). Claude found only the replies (`panel + body`), newsletter, and directory renderers, all reached through the dispatcher after the marker is cleared.
- After create/review/approve actions, campaign data changes, so the list redraws; confirm nothing relies on a forced redraw with identical data (e.g. resetting button disabled states or busy spinners inside cards).
- Whether you see other always-on or repeated full redraws on Outreach that would matter on a phone (background refresh frequency, `refreshIcons()` scanning the whole document).

Not reproducible from here; the real test is whether the glitch stops on Karl's phone after `.50`. If it doesn't, the next step under discussion is showing recent campaigns first with older ones behind "Show older" at the bottom of the list.

Please report findings at P1/P2 (P3 only if trivial).
