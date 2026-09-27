# Releases

`cloneisyou/clone-sdk` is the canonical source. The SDK version is independent of Clone Desktop and the hosted API's schema version. Consumers install immutable package releases, not a Git submodule.

During 0.x, breaking public contract changes increment the minor version; compatible fixes increment the patch. Once 1.0 is reached, use SemVer major/minor/patch rules. The public contract includes exported types and documented behavior such as Tab insertion, events, cancellation, and submission ownership. Never overwrite a published version or move its tag.

## Download and install

The current release is [v0.3.1](https://github.com/cloneisyou/clone-sdk/releases/tag/v0.3.1). Download its `.tgz` and `.sha256` into `vendor/clone-sdk`.

When the repository is public, no GitHub credential is needed:

```sh
mkdir -p vendor/clone-sdk
release_url=https://github.com/cloneisyou/clone-sdk/releases/download/v0.3.1
curl --fail --location "$release_url/clone-ai-tab-completion-0.3.1.tgz" \
  --output vendor/clone-sdk/clone-ai-tab-completion-0.3.1.tgz
curl --fail --location "$release_url/clone-ai-tab-completion-0.3.1.tgz.sha256" \
  --output vendor/clone-sdk/clone-ai-tab-completion-0.3.1.tgz.sha256
```

If GitHub reports restricted access, use an account with repository read access:

```sh
gh release download v0.3.1 --repo cloneisyou/clone-sdk \
  --pattern 'clone-ai-tab-completion-0.3.1.tgz*' --dir vendor/clone-sdk
```

Then verify and install with your existing package manager:

```sh
(cd vendor/clone-sdk && shasum -a 256 -c clone-ai-tab-completion-0.3.1.tgz.sha256)
npm install ./vendor/clone-sdk/clone-ai-tab-completion-0.3.1.tgz
```

On Linux, use `sha256sum -c` in place of `shasum -a 256 -c`. Commit the lockfile. Do not put access tokens in package URLs or lockfiles.

## Prepare a release

1. Update `package.json`, `CHANGELOG.md`, and versioned download links in the README.
2. Generate types, run unit/browser/packaged consumer tests, and check dependencies.
3. Run `pnpm check:public` and review the full staged diff, author metadata, generated output, and tarball contents against the [public documentation boundary](../CONTRIBUTING.md#public-documentation-boundary). Secret scanning alone is insufficient. A visibility change also exposes earlier repository records; review all refs, pull requests, releases, Actions artifacts and logs before changing visibility. Never import private Git history into a new public repository.
4. Commit the SDK files, wait for CI, and create a matching `v<package version>` tag at that verified commit.
5. The release workflow repeats the checks and creates a GitHub prerelease with the installable `.tgz` and SHA-256 checksum. It downloads the uploaded archive using repository authentication, verifies its checksum, and tests installation. Verify the anonymous download separately after a visibility change.

`npm pack` starts from a clean `dist` build, checks the actual package file selection for disclosure hazards, and creates `release-manifest.json`, which records hashes of distributed files. The external tarball checksum covers the archive, including `package.json` and the manifest. Neither a hash nor the fixture tests prove suggestion quality.

## npm publication

Distribution uses versioned GitHub Releases. npm registry publication is disabled, and the npm workflow refuses to run while the repository is private. Do not describe `npm install @clone-ai/tab-completion` as available until a separate publication decision has been made and the package has been published and independently installed.

To enable npm releases, an owner must first confirm ownership of the `@clone-ai` scope, bootstrap the package, and configure its GitHub trusted publisher for this repository and `npm-publish.yml`. Set repository variable `NPM_PUBLISH_ENABLED=true` only after that configuration. The manual workflow accepts an existing release tag, repeats validation, and uses OIDC instead of a stored npm token. See [npm's trusted publisher documentation](https://docs.npmjs.com/trusted-publishers/).

## Build this checkout

For an unreleased checkout or local co-development, install dependencies with `pnpm install --frozen-lockfile` and pack the current source:

```sh
mkdir -p artifacts
npm pack --pack-destination artifacts
# In the consuming application, install the resulting versioned .tgz.
```

This local archive includes the current checkout, even when it still carries the existing package version. It is a test artifact, not a replacement for that published release. Assign a new version before publishing changes. Test the packaged application before updating downstream lockfiles. A dependency update does not migrate authentication, context storage, or server deployment.

## Release access and CI

For public releases, CI can use the anonymous download commands above. If repository access is restricted, use an authorized download or a verified archive delivered by your team.

If permitted by the customer's artifact policy, a checked-in, checksum-verified `.tgz` dependency makes CI independent of download credentials. Commit the archive, external checksum, package manifest and lockfile together. Refresh from a new immutable release using an authorized developer account. The canonical SDK source remains here; do not modify the archive or copy individual SDK implementation files.

If CI must fetch a restricted release directly, store a fine-grained token with read-only Contents access to this SDK repository as a CI secret and expose it only as `GH_TOKEN` to the download step. A consuming repository's default `GITHUB_TOKEN` is [limited to that repository](https://docs.github.com/en/actions/concepts/security/github_token) and cannot by itself read a different private repository. Do not copy a broad personal CLI token into CI. The SDK's own release workflow uses its same-repository `GITHUB_TOKEN` and needs no additional token.

The MIT license remains unchanged. Old release versions and tags stay immutable. Changing visibility does not publish the package to npm or activate hosted billing.
