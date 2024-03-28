# mocker 🥸

Mocker is a [self-initializing fake](https://martinfowler.com/bliki/SelfInitializingFake.html)
implemented as a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy) that supports
different record/playback modes.

It records HTTP interactions in a file-system so they can be later replayed during local development or in [broad stack tests](https://martinfowler.com/bliki/BroadStackTest.html), precluding the need for access to real external services.

Mocker is implemented in JavaScript, it has zero dependencies, and can be used either as a command-line tool or as a library.

More info on [docs](./docs).
