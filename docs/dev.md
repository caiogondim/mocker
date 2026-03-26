# Development

## Homebrew

The Homebrew formula lives in the [caiogondim/homebrew-tap](https://github.com/caiogondim/homebrew-tap) repo.

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

Releases are created via GitHub Actions. The workflow runs CI checks, creates
a git tag, and publishes a GitHub Release with your changelog.

```bash
gh workflow run release.yml \
  -f version=1.2.0 \
  -f changelog="## Changes
- feat: some new feature
- fix: some bug fix"
```

After the release, manually update the formula in
[caiogondim/homebrew-tap](https://github.com/caiogondim/homebrew-tap) with the
new version, URL, and sha256:

```bash
# Get the sha256 of the release tarball
curl -sL https://github.com/caiogondim/mocker/archive/refs/tags/v1.2.0.tar.gz | shasum -a 256
```

## Docker

### Build

```bash
docker build -t mocker .
```

### Run

```bash
docker run --rm -p 8273:8273 mocker --origin http://example.com --mode pass
```
