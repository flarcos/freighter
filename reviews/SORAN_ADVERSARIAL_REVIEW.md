# Soran adversarial review

Reviewed the current working-tree implementation on 2026-09-12. Two confirmed
findings, originally reproduced by four isolated probes. Both findings have
now been fixed in the working tree. The descriptions below record the original
defects; the probes were converted into regression tests that require rejection.

## Fixed: P1 — Bind the transaction being signed to the verified Soran route

The original submission check compared Universal Lookup against Redux fields
(`destination`, `memo`, `memoType`). It did not compare the lookup result with
the actual transaction XDR supplied to signing/submission. The main review label
also comes from Redux. A successful name lookup therefore does not establish
that the transaction pays that route.

Three probes reproduced this gap:

1. **Unfunded XLM destination:** a valid Soran M address with a uint64 routing
   ID reaches the existing account-creation branch. That branch constructs
   `createAccount` for the base G address, discarding the ID. A custodian could
   receive funds without the intended customer's routing information.
2. **Collectibles:** a valid Soran M destination is converted by
   `getBaseAccount()` before it is passed to collectible simulation. The
   simulator receives G, not the complete M identity. The selection guard
   rejects memos, but accepts memo-free M instructions.
3. **Mismatched envelope:** with the real Soran decoder/revalidation operating
   on mocked valid RPC responses for recipient A, the submit hook accepts XDR
   paying recipient B, passes it to the mocked signer, and broadcasts it to the
   mocked submit endpoint. It then attempts to save the name with recipient A
   from Redux. This is a missing integrity check; exploiting this variant
   requires a stale/mismatched prepared transaction or an altered
   transaction-producing backend response.

Relevant locations:

- [Soran submission check](../extension/src/popup/components/InternalTransaction/SubmitTransaction/hooks/useSubmitTxData.tsx)
- [XLM account-creation conversion](../extension/src/popup/components/send/SendAmount/hooks/useSimulateTxData.tsx)
- [Collectible destination passed to simulation](../extension/src/popup/components/sendCollectible/SelectedCollectible/hooks/useSimulateTxData.ts)

**Fix:** validate the actual envelope's recipient, full muxed ID, and exact memo
type/value against the freshly resolved route before signing and submission.
Reject Soran M destinations in flows that cannot preserve them, including
account creation and unsupported collectible transfers. Derive the persisted
payment reference from the validated transaction. Add regression tests that
require these mismatches to be rejected.

## Fixed: P2 — Restrict payment-name storage messages to trusted extension callers

`SAVE_SORAN_PAYMENT_NAME` and `GET_SORAN_PAYMENT_NAME` originally did not enforce the
`isFromExtensionPage` / authorized development-server checks available in the
same listener. In a `DEV_EXTENSION` build, the content-script bridge forwards
internal service types from ordinary webpages.

A probe supplied an unrelated webpage sender and the active account's public
key. The real listener accepted a fabricated `forged.nova` annotation for a
valid transaction reference and returned it to that sender. A later attempt to
store `alice.nova` could not replace it because annotations are immutable. The
existing protected analytics handler rejected the same sender, confirming that
the new routes omit the intended boundary check.

**Exposure:** the reproduced webpage route applies to development/unpacked
builds with `DEV_EXTENSION` enabled, including the build used for testing. The
attacker needs the active public key and the transaction reference; both can be
public. The production content-script filter blocks these internal message
types, so this review does not establish the same webpage exploit against
production builds.

- [Payment-name handlers](../extension/src/background/messageListener/popupMessageListener.ts)
- [Development content-script forwarding](../extension/src/contentScript/helpers/redirectMessagesToBackground.ts)

**Fix:** apply the listener's trusted-caller guard to both new message types,
admitting only the extension and the explicit development-server relay where
needed. Test an unrelated tab and an authorized popup separately.

## Fix validation

The normal test suite now includes
[adversarial regressions](../extension/src/popup/helpers/__tests__/soranAdversary.test.tsx)
for unrelated and misleading sender URLs, trusted popup/fullscreen/dev-server
callers, muxed account creation, collectible muxed routes, and changed unsigned,
signed, and hardware envelopes. The tests use real transaction XDR and the real
Soran decoder against mocked contract responses.

[Envelope validation tests](../extension/src/popup/helpers/__tests__/soranTransaction.test.ts)
cover complete G/M destinations, typed memos, source overrides, extra operations,
contract/function/argument checks, collectible token IDs, malformed envelopes,
and fee bumps. Hardware overlay tests check rejection before contacting a device
and allow a matching route. Recipient selection tests reject unsupported
collectible muxed routes before loading balances.

The validator runs during simulation, before signing (including the hardware
overlay), and on the signed envelope before submission. Payment-name snapshots
use the validated envelope's hash and route. Both storage messages now apply the
existing trusted-caller guard.

Validation on 2026-09-12: the full suite passed **2,067 tests across 241 suites**
(51 tests / 6 suites skipped). Standalone TypeScript checking and translation
generation also passed, and the final extension build completed successfully.

Run the converted adversarial suite alone from the repository root:

```sh
node node_modules/jest/bin/jest.js --config reviews/soran-adversary.jest.cjs --runInBand
```

Signing, submission, contract responses, and storage are mocked. No real
transaction is submitted or wallet data modified by these tests. The review
covers Freighter's integration and does not audit Soran's deployed contracts.
