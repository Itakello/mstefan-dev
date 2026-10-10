# Offline visual-review artwork

These test-only fixtures pin actual SVG bodies returned by the official [Iconify API](https://iconify.design/docs/api/) on 2026-10-10. They are not production publication data. Each JSON file retains its upstream dimensions, aliases and modification timestamp. Requests for an icon absent from the fixture fail the browser review rather than substituting or hiding artwork.

- `simple-icons.json`: [Simple Icons](https://github.com/simple-icons/simple-icons), CC0; upstream license in `simple-icons.LICENSE`. Brand trademarks remain with their respective owners.
- `logos.json`: [SVG Logos](https://github.com/gilbarbara/logos), CC0; upstream license in `logos.LICENSE`. Brand logos are for identification and retain their respective trademark rights.
- `lucide.json`: [Lucide](https://github.com/lucide-icons/lucide), ISC; upstream license and Feather attribution in `lucide.LICENSE`.

Refresh only the requested icons through `https://api.iconify.design/<prefix>.json?icons=<comma-separated-names>` and inspect the resulting artwork before accepting updated screenshot baselines.
