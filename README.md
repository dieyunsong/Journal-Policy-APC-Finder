# Journal Policy & APC Finder

A static web tool that lets **Northwestern-affiliated authors** look up whether a journal is covered by an
open access (OA) or transformative agreement (TA) negotiated by **Northwestern University Libraries** and the
**Big Ten Academic Alliance (BTAA)**, and link to the agreement/policy details.

It shares its data with [TAFinder](https://github.com/dieyunsong/TAFinder) but uses a **reduced 5-column
schema** — it omits the discount/waiver amount, campuses covered, and coverage years, keeping just enough to
find a journal and route the author to the authoritative agreement page.

Adapted from the University of Michigan Libraries'
[article-processing-charge-list](https://github.com/mlibrary/article-processing-charge-list)
(BSD-3-Clause — see [`LICENSE.txt`](LICENSE.txt)).

## How it works

- `html/` is a fully static site (HTML + vanilla JS + DataTables + Bootstrap). No backend; all search and
  filtering happen in the browser.
- The site reads `html/data.json`, an object of the form `{ "header": [...], "version": "...", "data": [[...]] }`
  where each row is a positional array of 5 strings (eISSN / eISSN Link / Link may be `null`):

  `Publisher | Journal Title | eISSN | eISSN Link | Link to Agreement Info`

- `html/data.json` is **generated** from [`data/northwestern-agreements.csv`](data/northwestern-agreements.csv),
  the human-editable source of truth, by `bin/build_data`.

## Editing the data

1. Edit `data/northwestern-agreements.csv` (same 5 columns as the header above).
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
University Press, IOP Publishing, Springer Nature, and Wiley. Where a value could not be verified it is left
blank. See [TAFinder](https://github.com/dieyunsong/TAFinder) for the full-detail version with waiver amounts,
campuses, and coverage years.
