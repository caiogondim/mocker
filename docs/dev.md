# Development

## Homebrew

The Homebrew formula lives in this repo at `Formula/mocker.rb`. Because the
repo is not named `homebrew-mocker`, the tap must be added with its explicit
URL.

### Install

```bash
brew tap caiogondim/mocker https://github.com/caiogondim/mocker
brew install mocker
```

### Uninstall

```bash
brew uninstall mocker
```

## Releasing

Releases are cut by pushing a `vX.Y.Z` tag. The `Release` workflow runs CI
(lint, types, tests, fmt) and publishes a GitHub Release with auto-generated
notes.

```bash
npm version minor   # or: patch | major
git push --follow-tags
```

After the release, manually update `Formula/mocker.rb` with the new `version`,
`url`, and `sha256`. Compute the hash from the pushed tag's tarball (substitute
the version):

```bash
curl -sL https://github.com/caiogondim/mocker/archive/refs/tags/v1.2.0.tar.gz | shasum -a 256
```

## Docker

See [Docker](./docker.md).
