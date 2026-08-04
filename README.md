# TA-Finder — Northwestern Open Access & Transformative Agreement Finder

A static web tool that lets **Northwestern-affiliated authors** look up whether a journal is covered by an
open access (OA) or transformative agreement (TA) negotiated by **Northwestern University Libraries** and
the **Big Ten Academic Alliance (BTAA)** — and, for each covered title, what APC discount or waiver applies,
which campuses are eligible, and when the agreement runs.

Live site: <https://dieyunsong.github.io/TA-Finder/>

Adapted from the University of Michigan Libraries'
[article-processing-charge-list](https://github.com/mlibrary/article-processing-charge-list)
(BSD-3-Clause — see [`LICENSE.txt`](LICENSE.txt)). The front end (DataTables search/filter UI in `html/`) is
substantially the U-M code, rebranded for Northwestern; the data and build pipeline are Northwestern-specific.

## What the data is

Each row is one journal (or ACM conference-proceedings series) covered by an agreement — **6,147 rows across
12 publishers**, enumerated from each publisher's official agreement journal list. Agreement terms (waiver,
campuses, coverage window) were sourced from
[Open Access Publishing at Northwestern](https://www.library.northwestern.edu/use-the-libraries/research-teaching/open-access-publishing/),
the publishers' own agreement pages, and the
[ESAC registry](https://esac-initiative.org/about/transformative-agreements/agreement-registry/).

The source CSV, [`data/northwestern-agreements.csv`](data/northwestern-agreements.csv), has 7 columns:

| Column | Meaning |
|---|---|
| `Publisher` | Publisher whose agreement covers the title (drives the site's publisher filter). |
| `Journal Title` | The covered journal or proceedings series. |
| `eISSN` | Electronic ISSN (`NNNN-NNNN`). ACM proceedings series carry the placeholder `[conference proceedings]`; a few titles have no registered eISSN and are blank. |
| `Discount or Waiver` | What the agreement pays. `100% APC waiver` / `100% covered` = no APC charged to the author; other values give discounted prices or per-license terms (ACS lists rates by license type on multiple lines). |
| `Campuses Covered` | Comma-separated list of eligible Northwestern campuses (`Evanston, Chicago`). |
| `Coverage Years` | The agreement's active window (e.g., `1/1/2026 - 12/31/2027`, or `- ongoing`). Eligibility usually keys on acceptance/submission date falling in this window. |
| `Link to Agreement Info` | URL of the publisher's page describing the agreement (eligible article types, workflow, exclusions). |

The build step derives an eighth column, **`eISSN Link`** (an ISSN-portal URL,
`https://portal.issn.org/resource/ISSN/<eISSN>`), and turns the `[conference proceedings]` placeholder into a
plain, unlinked `conference proceedings` label.

### Coverage snapshot

| Publisher | Rows | Notes |
|---|---:|---|
| Springer Nature | 2,010 | BTAA agreement, hybrid journals |
| Wiley | 1,873 | BTAA agreement; 602 titles are waived only for manuscripts submitted by 8/31/2026 |
| Association of Computing Machinery (ACM) | 1,631 | 161 journals/magazines + 1,470 conference-proceedings series |
| Cambridge University Press | 412 | Gold OA waiver |
| Institute of Physics (IOP) | 73 | |
| American Chemical Society (ACS) | 72 | Per-license discounted rates from 1/1/2026 |
| Royal Society of Chemistry | 56 | Title-only (no eISSNs); excludes *RSC Advances* |
| Microbiology Society | 6 | |
| Cogitatio Press | 5 | |
| The Company of Biologists | 5 | Evanston campus only |
| Cold Spring Harbor Laboratory Press | 4 | |

Coverage is not a guarantee of funding — some agreements have annual caps or article-type restrictions.
Where a value could not be verified it is left blank.

## How it works

- `html/` is a fully static site (HTML + vanilla JS + DataTables + Bootstrap). No backend; all search and
  filtering happen in the browser.
- The site reads `html/data.json`, an object of the form
  `{ "header": [...], "version": "...", "taxonomy": {...}, "data": [[...]] }`
  where each row is a positional array of 9 elements — the 8 columns below
  (`eISSN` / `eISSN Link` may be `null`) plus an array of discipline topic ids:

  `Publisher | Journal Title | eISSN | eISSN Link | Discount or Waiver | Campuses Covered | Coverage Years | Link to Agreement Info | Disciplines`

- `html/data.json` is **generated** from the CSV by `bin/build_data`. The `version` field is a short content
  hash of the data, so rebuilding unchanged data is byte-for-byte reproducible.

## Subject data (the discipline filter)

Each row carries subject topics, which drive the **Filter by Discipline** control.
The site holds no discipline column; the topics exist only to filter.

Topics come from [OpenAlex](https://openalex.org/), not from publishers. For each
journal, OpenAlex reports the subject areas its articles fall into; a subject
becomes a topic when it accounts for **at least 10% of that journal's articles**.
Journals spread so evenly that nothing clears 10% keep their three largest subjects
instead. ACM conference-proceedings series and Royal Society of Chemistry titles are
classified at the publisher level, because OpenAlex has no per-title record for
them — proceedings are not journals to OpenAlex, and the RSC rows carry no eISSN to
join on. **6,139 of the 6,147 rows (99.9%) end up reachable by a discipline filter**;
the remaining 8 carry no classification and appear only when no discipline is selected.

The vocabulary is a Google Scholar-derived taxonomy of 8 broad areas and 172 topics,
in `data/taxonomy.json`. `data/crosswalk.json` maps OpenAlex subject ids onto it.
Both are vendored copies of files from the companion Journal-Policy-Finder repo,
stripped of that project's own keys. Of the 172 topics, 164 have at least one covered
journal; the build offers only those, so no topic in the picker returns nothing.

### Files

| File | Committed? | What it is |
|---|---|---|
| `data/openalex-subfields.json` | yes | Snapshot of OpenAlex subject counts per eISSN (~774 KB) |
| `data/taxonomy.json` | yes | The 8 areas and 172 topics (~26 KB) |
| `data/crosswalk.json` | yes | OpenAlex subject id → topic |
| `lib/disciplines.rb` | yes | The tagging rule (threshold, safety net, fallbacks) |
| `bin/fetch_openalex` | yes | Refreshes the snapshot. **The only script that uses the network.** |

### Refreshing it

Only needed when the CSV gains journals, or to pick up newer OpenAlex counts:

```sh
ruby bin/fetch_openalex   # ~93 requests, about 2 minutes, no API key
rake                      # tests, then rebuild html/data.json
```

Then commit `data/openalex-subfields.json` together with `html/data.json`.

`bin/build_data` never touches the network — it reads only committed files, so CI
can rebuild `data.json` and assert the result is byte-for-byte identical.

### A deliberate difference from the companion site

[Journal-Policy-Finder](https://github.com/dieyunsong/Journal-Policy-Finder) shares
this taxonomy but tags journals differently: it keeps **every** subject a journal
touches (about 12 topics per journal), while this site keeps only those above 10%
(about 2). That is not an inconsistency to fix. That tool searches 52,714 journals
and needs recall, so no journal is ever unfindable. This one filters 6,147 rows that
are all actionable and needs precision: under the uncapped rule, "Aviation &
Aerospace Engineering" matched 1,458 of the taggable rows here, which makes the
filter useless. See `lib/disciplines.rb` for the reasoning in context.

## Editing the data

1. Edit `data/northwestern-agreements.csv` (7 columns as above). The file must be **UTF-8** — if you export
   from Excel, use "CSV UTF-8", not the plain "CSV" format (which writes a legacy encoding and breaks the build).
2. Regenerate the JSON:

   ```sh
   ruby bin/build_data
   ```

   The build validates the header, requires every column except `eISSN` to be non-blank, and rejects
   malformed eISSNs. A maintainer's entry point is `rake` (run from the repo root): it runs the test
   suite first, then this same build step.

3. Commit both the CSV and the regenerated `html/data.json`. CI (`.github/workflows/build-data.yml`) rebuilds
   and validates on every push and fails if `data.json` is out of date with the CSV.

## Running locally

Serve the `html/` directory with any static server, e.g.:

```sh
ruby -run -e httpd html -p 8000
# then open http://localhost:8000/
```

## Deployment

The site is published with **GitHub Pages** at <https://dieyunsong.github.io/TA-Finder/>.
`.github/workflows/deploy-pages.yml` rebuilds `data.json` and deploys `html/` on every push to `main`.

## Related project

[Journal-Policy-Finder](https://github.com/dieyunsong/Journal-Policy-Finder) is a companion site built
from the same codebase with its own copy of the data. The two repos do not share a data source; changes made
here must be re-applied there.

## Out of scope (not yet configured)

- Deployment to Northwestern-owned hosting (the original U-M S3/CloudFront and Google-Sheets workflows were removed).
- An automated refresh from a Northwestern-maintained spreadsheet. The legacy
  `bin/update` Google-Sheets importer was removed (see git history) — it required
  credentials that were never configured, and `bin/build_data` replaced it.
