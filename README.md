# TAFinder — Northwestern Open Access & Transformative Agreement Finder

A static web tool that lets **Northwestern-affiliated authors** look up whether a journal is covered by an
open access (OA) or transformative agreement (TA) negotiated by **Northwestern University Libraries** and the
**Big Ten Academic Alliance (BTAA)**, and what APC discount or waiver applies.

It is adapted from the University of Michigan Libraries'
[article-processing-charge-list](https://github.com/mlibrary/article-processing-charge-list)
(BSD-3-Clause — see [`LICENSE.txt`](LICENSE.txt)). The front end (DataTables search/filter UI in `html/`) is
substantially the U-M code, rebranded for Northwestern; the data and build pipeline are Northwestern-specific.

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

Serve the `html/` directory with any static server, e.g.:

```sh
ruby -run -e httpd html -p 8000
# then open http://localhost:8000/
```

## Data coverage notes

Northwestern publishes its agreements at the **publisher** level. This dataset expands them to the journal
level where a complete, authoritative list is available; otherwise it uses a single **publisher-level row**
that points authors to the publisher's own journal finder.

| Publisher | Granularity | eISSNs |
|---|---|---|
| Cogitatio Press | Journal-level (5) | Yes |
| Cold Spring Harbor Laboratory Press | Journal-level (4) | Yes |
| The Company of Biologists | Journal-level (5, Evanston only) | Yes |
| Microbiology Society | Journal-level (6) | Yes |
| Royal Society of Chemistry | Journal-level (56; excludes *RSC Advances*) | Title only |
| American Chemical Society | Publisher-level row | — |
| Association for Computing Machinery | Publisher-level row | — |
| Cambridge University Press | Publisher-level row | — |
| IOP Publishing | Publisher-level row | — |
| Springer Nature (BTAA) | Publisher-level row | — |
| Wiley (BTAA) | Publisher-level row | — |

Agreement terms (waiver amount, coverage years, eligible campuses, exclusions) were sourced from
[Open Access Publishing at Northwestern](https://www.library.northwestern.edu/use-the-libraries/research-teaching/open-access-publishing/),
the Galter Health Sciences Library, and the [ESAC registry](https://esac-initiative.org/about/transformative-agreements/agreement-registry/).
Where a value could not be verified it is left blank.

**To upgrade a publisher-level row to journal level**, drop the publisher's official agreement journal list
(title + eISSN) into the CSV and rerun `bin/build_data`. This is the single biggest accuracy improvement,
especially for the large Springer Nature and Wiley portfolios.

## Deployment

The site is published with **GitHub Pages** at <https://dieyunsong.github.io/TAFinder/>.
`.github/workflows/deploy-pages.yml` rebuilds `data.json` and deploys `html/` on every push to `main`.

## Out of scope (not yet configured)

- Deployment to Northwestern-owned hosting (the original U-M S3/CloudFront and Google-Sheets workflows were removed).
- An automated refresh from a Northwestern-maintained spreadsheet (the legacy `bin/update` Google-Sheets path
  remains in the repo for reference but is not wired up).
