<p align="center">
  <a href="https://localix.ai/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.svg">
      <img src="public/logo-light.svg" width="72" height="72" alt="Localix">
    </picture>
  </a>
</p>

<h1 align="center">Localix Grammar</h1>

<p align="center">
  A precise, privacy-aware writing assistant for Chrome.
</p>

Localix Grammar checks spelling, grammar, punctuation, and style directly in supported web
editors. It uses OpenRouter, preserves rich-text formatting, and keeps credentials away from page
scripts.

## Preview

<p align="center">
  <img src="store-assets/screenshots/05-corrected-text-closeup.jpg" width="820" alt="Corrected text with highlighted improvements">
</p>

<p align="center">
  <img src="store-assets/screenshots/01-connect-openrouter.jpg" width="49%" alt="Connect Localix Grammar to OpenRouter">
  <img src="store-assets/screenshots/03-settings.jpg" width="49%" alt="Localix Grammar settings">
</p>

## Features

- Manual and automatic checks in text fields and `contenteditable` editors
- One-click application of all suggested corrections
- Per-site and global pause controls
- Light, dark, and system themes
- OpenRouter OAuth or API-key connection

## Install from source

Requires Node.js 22.19+ and Chrome/Chromium 116+.

```sh
npm ci --ignore-scripts
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.

## Privacy

Editor text is sent only to the OpenRouter model selected by the user. API keys stay in
extension-only storage and are never exposed to webpage scripts. See the
[privacy policy](PRIVACY_POLICY.md) and [permissions rationale](docs/permissions-and-privacy.md).

## Development

```sh
npm run check
npm run test:e2e
npm run zip
```

[User guide](docs/user-guide.md) · [Contributing](CONTRIBUTING.md) ·
[Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
