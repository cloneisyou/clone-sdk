# Contributing

Use Node 22.13+ and pnpm 11.19.0. Run `pnpm install --frozen-lockfile` from this repository. The default demo and all CI tests use synthetic data and need no API credentials.

Before proposing a change, run:

```sh
pnpm generate:types
git diff --exit-code -- src/generated/api-types.ts
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:package
pnpm check:public
```

For API contract changes, update `openapi.json` and regenerate the public types. Coordinate deployed service compatibility separately. Never copy an entire private service schema or implementation into this repository.

Keep existing composer submission behavior intact. Test candidate insertion, Undo, dismissal, focus traversal, stale results, account/context changes, and composition handling when relevant. Browser composition events do not substitute for testing a native input method.

Use synthetic examples. Do not submit credentials, private prompts, user conversations, customer names, internal links, screenshots of real accounts, or private repository history. Review your staged diff and author identity before pushing; public pull requests and workflow logs are public artifacts too. The automated checks are aids, not a complete disclosure review.

Contributions are provided under this repository's MIT license. Declare any imported third-party code and preserve its license notices. Runtime dependencies retain their own licenses; no third-party runtime source is vendored here.

This is the canonical SDK repository. Consume built, versioned package archives (or npm releases when available) in downstream applications. For local changes, build and pack this repository, then install the tarball in a consumer; do not maintain a second SDK source copy or add a Git submodule just to use the package.

## Repository layout

```text
src/                    SDK implementation and stable entry points
  generated/            Types generated from openapi.json
examples/react/         Runnable React and assistant-ui demo, loopback backend
scripts/                Build, package verification and example generator
  lib/                  Shared publication checks
tests/                  Unit tests for controller, HTTP and server boundaries
  browser/              Composer interaction tests
  scripts/              Build and publication regression tests
docs/                   Integration, account, data and release guides
.github/workflows/      Validation and opt-in release workflows
```

Keep the four package entry points stable. The controller owns prediction state; React owns native input interaction; HTTP decoding is shared by browser and server transports. Generated API types have one source of truth: `openapi.json`.

The demo's loopback backend belongs under `examples/react`; it is not part of the runtime library. Build output is disposable and is cleaned before every build. The release manifest follows npm's actual file selection and checks each included file. `pnpm typecheck` also checks examples and test code. `pnpm test:scripts` checks cleanup and rejection of unintended package contents. Keep audit reports outside the repository.

After moving source modules, regenerate and test the packed consumer. Update example-generator import mappings whenever example imports change. Never edit generated types directly.

## Public documentation boundary

Document the SDK, public request/response contract, customer-visible behavior and data-use commitments. Keep the hosted service implementation out of this repository, including model choices, internal prompts, algorithms, storage design, infrastructure and operational procedures. Treat service-issued identifiers and revisions as opaque values. A required payment or consent disclosure must remain accurate.

Secret scanning does not establish that content is suitable for publication. Review prose, comments, generated files and the packed archive as well as code. Before making an existing repository public, review every branch and tag, Git history, pull requests, releases, Actions artifacts and logs. A clean latest commit does not sanitize those earlier records. Keep detailed audit findings in the private review location, not in public commits or release notes.
