# mocker 🥸

Mocker is a [self-initializing fake](https://martinfowler.com/bliki/SelfInitializingFake.html)
implemented as a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy) that supports
different record/playback modes.

It records HTTP interactions in a file-system so they can be later replayed during local development or in [broad stack tests](https://martinfowler.com/bliki/BroadStackTest.html), precluding the need for access to real external services.

Mocker is similar to [mock-server](https://mock-server.com/),
[hoverfly](https://docs.hoverfly.io/en/latest/pages/keyconcepts/proxyserver.html)
or [killgrave](https://github.com/friendsofgo/killgrave) but is
implemented as in JavaScript and can be used either as a command-line
tool or as a library.

<!-- For example, mocker can piggy-back onto Apollo's MockedProvider. -->

More info on [docs](./docs).
