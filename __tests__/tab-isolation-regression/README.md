# Tab-isolation test support

The former standalone tab-isolation server and renderer harness were retired.
Their coverage now runs through the standard Chromium Playwright runner:

```powershell
npx playwright test e2e/component.same-type-tab-switching.isolation.spec.js --project=chromium
npx playwright test e2e/component.persistence-matrix.spec.js --project=chromium
npx playwright test e2e/component.same-type-parameter-isolation.spec.js --project=chromium
npx playwright test e2e/component.resize-exit-reenter.persistence.spec.js --project=chromium
```

The `e2e/helpers/ownerPayloadDriver.js` is an explicit in-page API driver used
only by the owner-payload mutation matrices. It runs inside the normal
Playwright page, uses the shared component catalog and owner-readiness APIs,
and is not a standalone server, renderer, or release gate. UI-originated
behavior remains in the strict UI contracts.

For the complete Chromium gate, use `npm run test:e2e:chromium`. Firefox is an
opt-in deferred lane for this refactor.
