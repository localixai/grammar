# Security policy

## Supported versions

Security fixes are developed for the current Localix Grammar release line. Update to the newest
Chrome Web Store or repository release before reporting an issue that may already be fixed.

## Report privately

Do not open a public issue for a suspected vulnerability. Email `hello@localix.ai` with the subject
`Localix Grammar security report`.

Include:

- affected extension and Chrome versions;
- the relevant editor/site category without private document contents;
- clear reproduction steps and observed impact;
- whether the issue may expose an OpenRouter credential or submitted writing.

Do not send real API keys, OAuth callback codes, or private writing. Use synthetic values and
redacted screenshots. The maintainers may request additional details through the same private
channel.

## Security boundaries

Reports are especially useful when they concern:

- credential exposure outside trusted extension contexts;
- text read from an excluded or inactive editor;
- a correction applied to a stale or different DOM span;
- unauthorized settings/OAuth messages;
- remotely loaded executable code or unexpected network destinations.

OpenRouter and selected model-provider service issues should also be reported through those
providers' security channels when the extension is not the source of the behavior.
