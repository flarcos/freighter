# Soran recipient lookup

On Stellar Testnet, enter a Soran name such as `alice.nova` in **Send to**.
Freighter displays the canonical name with the resolved address, retains the
name on review and in recents, and locks the memo to the resolved instruction.
Mainnet and other network passphrases are rejected until a deployment is
explicitly configured for them.

## Reads

`src/popup/helpers/soran.ts` uses the selected network's Soroban RPC endpoint
and Stellar SDK 17. It checks Universal Lookup's Registry anchor, `version()`,
and `destination_version()`, then simulates `resolve_destination(name)` with an
unsigned read-only transaction. It does not contact Soran's HTTP API, install
a Soran SDK, submit transactions, or require a funded account for lookup.

This intentionally uses contract read methods rather than raw `getLedgerEntries`.
The Lookup contract validates namespace routing, current ownership generation,
expiry, and complete payment instructions in one invocation. Raw storage alone
can expose stale generations or omit archived memo records. Deployment addresses
and rules come from the [Soran contract reference](https://docs.soran.domains/api/onchain-resolution)
and [storage reference](https://docs.soran.domains/reference/contract-storage).
The Registry and ABI checks do not pin executable Wasm hashes; Soran governance
can upgrade its contracts, and reads trust the configured Stellar RPC.

## Payment handling

- Strict XDR decoding accepts direct G/C destinations and complete M destinations.
- Memo IDs and muxed IDs remain exact unsigned 64-bit decimal strings, including
  zero and the maximum value. Hash memo bytes are encoded as base64 for Freighter's
  existing memo builder. Text is kept verbatim and validated as UTF-8.
- Soran names share the existing `federationAddress`, `memo`, and `memoType` send
  fields. Existing federation and literal-address inputs keep their resolution paths.
- Lookup failures, restoration requirements, malformed data, and unsupported
  capabilities fail without an address-only fallback.
- Lookup is repeated while preparing the payment and before submission. Changed
  addresses, memo values, or memo types require selecting the recipient again.
  This detects changes at those reads; it does not lock a name on chain.
- Memo-bearing names are rejected for contract-token and collectible transfers:
  the existing token path cannot preserve all typed transaction memos. A direct
  G-plus-memo instruction is never silently converted to an M address.
- M destinations retain the full routing ID. Token transfers that cannot support
  M destinations fail rather than substituting the base G account.
  Soran M destinations are rejected for XLM account creation and collectible
  transfers because those flows cannot preserve the routing ID.
- `soranTransaction.ts` checks the actual envelope during simulation, before
  software or hardware signing, and again before submission. The complete
  destination and exact memo type/bytes must match the revalidated route.
  Only single-operation payment, path-payment, account-creation, and recognized
  contract `transfer` shapes are accepted. Contract transfers also check the
  contract, sender, argument types, and collectible token ID. Fee bumps and
  additional operations are rejected for Soran sends.

## Names in history

Account and asset history use Universal Lookup `primary_names`, checking the
Registry anchor, `version() == 2`, `batch_read_version() == 3`, the deployed
`primary_batch_limit()` (maximum 16), and `muxed_identity_version() == 1` for M.
The strict decoder distinguishes `Name`, `None`, and `Failed(code)` and retains
the batch observation ledger and timestamp. Only leading host budget failures
halve a batch. Restoration, transport, ABI and singleton failures retain failure
status and display the original address.

Rows rendered together share batched, deduplicated reads. The in-memory cache
holds at most 512 entries, partitioned by network passphrase, RPC, Lookup ID and
complete identity. Successful reads live for 60 seconds, failures for 5 seconds;
visible rows refresh. G/C names identify accounts, not memo-routed customers.
Muxed identities always include the full ID. Swaps and multi-party operations
are not assigned one counterparty name. Addresses remain visible and copyable
in transaction details.

After a successful Freighter send, the canonical name used is saved locally,
keyed by payer, network, transaction hash, complete destination, memo type and
memo. These immutable annotations are capped at the latest 1,000 records and
are separate from current Primary names. The hash and route come from the
validated submitted envelope. Saved-name reads and writes accept only trusted
extension pages or the configured development-server relay; ordinary webpage
senders are rejected even in development builds. A storage failure cannot change a
successful send to a failed send. Older payments, other devices and external
senders have no historical annotation; their display names are current only.
Names are never added to the on-chain memo. Starting another payment still
performs fresh forward resolution and destination revalidation.

History timestamps use locale date/time formatting without assuming an AM/PM
suffix.

## Verification

The Soran tests cover published XDR conformance vectors, name normalization,
network/Registry checks, unsigned reads, unavailable state, memo preservation,
self-sends, concurrent recipient lookups, and revalidation before submission.
Adversarial regressions cover altered unsigned/signed envelopes, hardware
signing, muxed ID loss, typed memo mismatches, and history-message sender
permissions. Fixtures are an attributed subset of Soran's published synthetic test vectors.

```sh
yarn test:ci --runInBand --selectProjects jsdom --testPathPattern=soran
yarn test:ci
yarn build:extension:translations
```

The full wallet needs `INDEXER_URL` and `INDEXER_V2_URL` in `extension/.env` as
explained in the extension README. For a compilation-only check, the repository's
CI uses `http://indexer.invalid` placeholders; those do not provide a working wallet
backend.

A read-only live test on 2026-09-12 resolved `nikcle.nova`, `robert.nova`,
`alice.nova`, `echo.nova`, `mux.nova`, and `cyclops.nova`, covering G without memo,
G with ID/text/hash memos, M, and C. These are demonstration records; testnet
state and their destinations can change.

A live batch read on 2026-09-12 returned elected names for `alice.nova`,
`nikcle.nova`, `robert.nova`, and the full M identity of `mux.nova` in one
observation; the C destination of `cyclops.nova` returned `None`.
