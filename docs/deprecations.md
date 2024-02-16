# Deprecations

All deprecated APIs can be removed after 1 year of depreciation in a breaking
change release.

## 003 - CLI argument `--cache` was removed

CLI argument `--cache` and the featured related to it was removed. The behavior
of the application is still the same, but performance might be decreased.
Consider using a specialized application (Ngnix, Redis, ...) as the caching
layer.

- Deprecated: 2021-04-28
- Removed: yes

## 002 - CLI argument `--mode pass-through` renamed to `--mode pass`

CLI argument `--mode pass-through` renamed to `--mode pass` for better
consistency.

- Deprecated: 2020-01-15
- Removed: not

## 001 - CLI argument `--folder` renamed to `--responsesDir`

CLI argument `--folder` was renamed to `--responsesDir` for a more semantic
naming.

- Deprecated: 2020-01-15
- Removed: not
