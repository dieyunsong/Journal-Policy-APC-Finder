# Northwestern University Transformative Agreement Finder

A static web tool that lets **Northwestern-affiliated authors** look up whether a journal is covered by an
open access (OA) or transformative agreement (TA) negotiated by **Northwestern University Libraries** and the
**Big Ten Academic Alliance (BTAA)**, and link to the agreement/policy details.

It shares its data with [TAFinder](https://github.com/dieyunsong/TAFinder) but uses a **7-column schema** that
carries the discount/waiver amount, campuses covered, and coverage years, and omits the agreement-info link
(that column lives in TAFinder instead).

Adapted from the University of Michigan Libraries'
[article-processing-charge-list](https://github.com/mlibrary/article-processing-charge-list)
(BSD-3-Clause — see [`LICENSE.txt`](LICENSE.txt)).

## How it works

- `html/` is a fully static site (HTML + vanilla JS + DataTables + Bootstrap). No backend; all search and
  filtering happen in the browser.
- The site reads `html/data.json`, an object of the form `{ "header": [...], "version": "...", "data": [[...]] }`
  where each row is a positional array of 7 strings (eISSN / eISSN Link / Coverage Years may be `null`):

  `Publisher | Journal Title | eISSN | eISSN Link | Discount or Waiver | Campuses Covered | Coverage Years`

- `html/data.json` is **generated** from [`data/northwestern-agreements.csv`](data/northwestern-agreements.csv),
  the human-editable source of truth, by `bin/build_data`.

## Editing the data

1. Edit `data/northwestern-agreements.csv` (same 7 columns as the header above; `Campuses Covered` is a
   comma-separated list, e.g. `Evanston, Chicago`).
2. Regenerate the JSON:

   ```sh
   ruby bin/build_data
   ```

3. Commit both the CSV and the regenerated `html/data.json`. CI (`.github/workflows/build-data.yml`) rebuilds
   and validates on every push and fails if `data.json` is out of date with the CSV.

## Running locally

```sh
ruby -run -e httpd html -p 8000
# then open http://localhost:8000/
```

## Deployment

Published with **GitHub Pages** at <https://dieyunsong.github.io/Journal-Policy-APC-Finder/>.
`.github/workflows/deploy-pages.yml` rebuilds `data.json` and deploys `html/` on every push to `main`.

## Data coverage

82 rows across 11 publishers. Journal-level with verified eISSNs for Cogitatio Press, Cold Spring Harbor
Laboratory Press, The Company of Biologists, and Microbiology Society; journal-level titles for the Royal
Society of Chemistry (excludes *RSC Advances*); and single publisher-level rows for ACS, ACM, Cambridge
University Press, IOP Publishing, Springer Nature, and Wiley. Every row carries the discount/waiver amount,
campuses covered, and coverage years. Where a value could not be verified it is left blank. See
[TAFinder](https://github.com/dieyunsong/TAFinder) for the companion version that instead links out to each
agreement's policy page.
