# Contributing

Thanks for helping improve the SharpAPI TypeScript SDK. This page says where to
take a question, how to report a bug, and how to send a change.

## Questions and account help

- **How do I use the SDK or the API?** Start with the [documentation](https://docs.sharpapi.io/sdks/typescript)
  and the [API reference](https://docs.sharpapi.io/api-reference).
- **Your account, plan, billing or API key:** use the [contact page](https://sharpapi.io/contact)
  or email support@sharpapi.io. Please do not open a public issue for these.
- **Is the API up?** See the [status page](https://status.sharpapi.io).

## Reporting a bug

Open an issue with the bug report form. It asks for:

- the SDK version (`npm ls @sharp-api/client`),
- the runtime and its version (for example Node.js 22),
- the smallest piece of code that shows the problem,
- what you expected and what happened instead.

Remove API keys and personal data from anything you paste. If a key was posted by
mistake, rotate it from your dashboard.

## Security issues

Do not open a public issue for a security problem. Follow [SECURITY.md](SECURITY.md).

## Working on the code

You need Node.js 20 or later.

```bash
git clone https://github.com/Sharp-API/SharpAPI-TS.git
cd SharpAPI-TS
npm ci
npm run lint        # code style
npm run typecheck   # TypeScript
npm test            # unit tests
npm run build       # build dist/
npm run test:demo   # tests for the example app (run after the build)
```

The tests use recorded fixtures and stubbed requests. They need no API key and
make no network calls.

## Sending a pull request

- Small fixes are welcome as they are. For a larger change, open an issue first so
  we can agree on the approach before you spend time on it.
- Keep one change per pull request, and add a test that fails without it.
- Types use the API's own field names (snake_case), as the API sends them.
- If a user of the SDK would notice the change, add a line to `CHANGELOG.md`.
- Do not change the version number. Maintainers set it when they cut a release.

Every pull request runs the tests on Node.js 20, 22 and 24, a code scan and an
automated review. A maintainer then reviews it and merges it. A pull request from
a fork is merged by hand, so it can take a little longer.

## License

By contributing you agree that your contribution is released under the
[MIT License](LICENSE).
