# Development

## Homebrew

The Homebrew formula lives in the
[caiogondim/homebrew-tap](https://github.com/caiogondim/homebrew-tap) repo.

### Install

```bash
brew tap caiogondim/tap
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

After the release, manually update the formula in
[caiogondim/homebrew-tap](https://github.com/caiogondim/homebrew-tap) with the
new version, URL, and sha256:

```bash
curl -sL https://github.com/caiogondim/mocker/archive/refs/tags/v1.2.0.tar.gz | shasum -a 256
```

## Docker

See [Docker](./docker.md).
