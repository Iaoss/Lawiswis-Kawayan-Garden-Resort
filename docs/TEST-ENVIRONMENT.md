# Test copy of the site

A separate copy of the website for trying changes with fake bookings and
PayMongo **test mode**, without touching real guests, payments or emails.
It uses its own Firebase project, so nothing it does reaches the live data.

## One-time setup (about 30 minutes)

1. **Firebase test project**
   - Firebase Console → Add project → name it e.g. `lawiswis-test`.
   - Build → Authentication → enable **Email/Password** and **Anonymous**.
   - Build → Firestore Database → create a database (Asia region).
   - Firestore → Rules → paste `firestore.rules` from this repository → Publish.
   - Project settings → General → "Your apps" → add a **Web** app and copy its
     config values (apiKey, authDomain, projectId, storageBucket,
     messagingSenderId, appId).
   - Project settings → Service accounts → **Generate new private key**.
2. **A staff account in the test project**: Authentication → Add user, then in
   Firestore create `users/<that user's UID>` with `role: "admin"`,
   `status: "active"`, `name`, `email`.
3. **PayMongo test keys**: PayMongo dashboard → switch to **Test mode** →
   Developers → copy the test secret key (`sk_test_…`) and create a test
   webhook pointing to `https://<test-site>.vercel.app/api/paymongo-webhook`.
4. **Second Vercel project**: Vercel → Add New → Project → import the same
   GitHub repository → name it e.g. `lawiswis-test`.
   - Settings → Git → **Production Branch**: `test` (create a `test` branch in
     GitHub). Pushing to `test` updates the test site; `main` stays the live site.
   - Settings → Environment Variables (same names as `.env.example`), with the
     **test** values:
     - `REACT_APP_SITE_MODE=test` (shows the red "TEST SITE" banner)
     - `REACT_APP_FIREBASE_API_KEY`, `REACT_APP_FIREBASE_AUTH_DOMAIN`,
       `REACT_APP_FIREBASE_PROJECT_ID`, `REACT_APP_FIREBASE_STORAGE_BUCKET`,
       `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`, `REACT_APP_FIREBASE_APP_ID`
       (from step 1; these are public web settings, not secrets)
     - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
       (from the test service-account key)
     - `PAYMONGO_SECRET_KEY` (`sk_test_…`) and `PAYMONGO_WEBHOOK_SECRET` (test webhook)
     - `GMAIL_USER` / `GMAIL_APP_PASSWORD`: use a separate Gmail for testing, so
       test emails don't come from the resort's address
     - `CRON_SECRET` (any random text), `PUBLIC_SITE_URL=https://<test-site>.vercel.app`

## Everyday use

- Try a change on the test site first: push it to the `test` branch, check it
  with fake bookings (PayMongo test cards and test GCash), then push the same
  change to `main` for the live site.
- PayMongo test payments never charge real money.
- Room data: add a few rooms in the test site's Room Management (or import the
  Excel file), since the test database starts empty.

## Firestore quota and service outages

The public availability API and staff account actions both read Firestore.
If Firestore returns `RESOURCE_EXHAUSTED` / `Quota exceeded`, availability
checks and staff verification can fail even when the staff accounts are valid.
Check the affected project's Firestore usage and Google Cloud quotas and billing.
Restore capacity by resolving the reported quota or billing issue, or wait for
the applicable quota to reset. Check server logs and retry both availability
and staff actions afterward. Do not reopen bookings by bypassing an availability
check: the current closure settings must still be checked.
