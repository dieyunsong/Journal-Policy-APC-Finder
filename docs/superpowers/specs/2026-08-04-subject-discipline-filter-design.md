# Subject/Discipline Filter for the TA Finder — Design

Date: 2026-08-04
Branch: `subject-filter` (off `origin/main` @ bfa871b)

## Goal

Let Northwestern faculty and researchers narrow the 6,147 transformative-agreement
rows to journals in their own discipline.

Today the only ways in are free-text search on title and eISSN, and the Publisher
filter. Both assume the author already has a title in mind. The question this feature
answers is the one researchers actually arrive with: *which journals in my field can I
publish in under a Northwestern or BTAA agreement?*

## Non-goals

- No visible Disciplines column in the results table (it is already seven columns wide).
- No fine-grained subject tagging of ACM conference proceedings; they are classified
  at the publisher level. Curating the 1,470 series names is separate future work.
- No change to the CSV schema, the search box, or the existing filters' behavior.
- No network access from `bin/build_data` or from the page. Fetching subject data is
  a separate, manual, rarely-run script whose output is committed.
- No dependency on any other repo or on any one person's machine (see Pipeline and
  Setup fixes).

## Verified data findings

Measured against `data/northwestern-agreements.csv` (6,147 rows) joined to the OpenAlex
subject data this repo actually commits, via `bin/fetch_openalex`. These are observed
figures, not estimates.

The design was first drafted against a local dump of OpenAlex belonging to the sibling
repo, and the in-repo fetch turned out **better**: 4,606 of the 4,617 well-formed
eISSNs match, where the dump reached 4,572. The dump had been fetched with a minimum
article count, so it omitted smaller journals that a direct ISSN query returns. That
is why unreachable rows fell from the 39 of the first draft to 8. Article counts drift
between fetches — one JACS subfield moved 75,003 → 75,007 inside a week — so treat
exact counts as a snapshot and topic identity as the stable thing. The coverage
assertion in Validation is what keeps this honest over time.

| How a row gets its topics | Rows |
|---|---:|
| The 10%-share rule, from OpenAlex subject data | 4,608 |
| Safety net — matched OpenAlex, but no subfield cleared 10% | 2 |
| ACM publisher-level fallback | 1,473 |
| Royal Society of Chemistry publisher-level fallback | 56 |
| **Reachable by a discipline filter** | **6,139 (99.9%)** |
| Unreachable: Wiley 3, Cambridge 2, ACS 2, Springer Nature 1 | 8 |

1,537 rows have no OpenAlex match at all: 1,470 ACM proceedings placeholders, 56
blank RSC eISSNs, and 11 real eISSNs absent from OpenAlex. The ACM and RSC
fallbacks absorb all but 8 of those. With the safety net in place the residue has
a clean definition: a row is unreachable exactly when it has no OpenAlex match and
is not an ACM or RSC title.

Topics populated: 164 of 172. Mean 2.25 topics per row (median 2, max 6).

Journals a researcher would see per broad area:

| Area | Journals | | Sample topic | Journals |
|---|---:|---|---|---:|
| Engineering & Computer Science | 2,976 | | Artificial Intelligence | 289 |
| Health & Medical Sciences | 1,686 | | Oncology | 163 |
| Life Sciences & Earth Sciences | 1,101 | | Ecology | 275 |
| Social Sciences | 1,082 | | Sociology | 548 |
| Business, Economics & Management | 591 | | Finance | 108 |
| Physics & Mathematics | 576 | | Pure & Applied Mathematics | 108 |
| Chemical & Material Sciences | 419 | | Organic Chemistry | 97 |
| Humanities, Literature & Arts | 334 | | History | 54 |

## Data layer

### Taxonomy

Reuse the Google Scholar-derived taxonomy already committed in the Journal Policy
Finder (`html/data/taxonomy.json`): 8 broad areas, 172 topics, each topic keyed by
an `area-slug/topic-slug` pair. Sharing the taxonomy is what makes the two sites feel
like one family of tools; what they must *not* share is the tag-assignment rule
(below).

Copy it to `data/taxonomy.json` keeping only the keys this repo uses — `areas` and
`tag_list` — and drop the rest of what the sibling repo keeps in that file. Two keys
need dropping, for the same reason: they are that project's concerns, not ours.
`tag_counts` holds row counts computed against its 52,714 journals, and ours must be
computed from the TA rows or the numbers beside each topic in the picker would be
meaningless. `publisher_homepages` is 4,844 publisher-ID-to-URL pairs serving a
feature this site does not have — 196 KB of the source file's 250 KB, and nothing
here reads it. Stripping both leaves 26 KB that is all taxonomy.

### Tag assignment rule: 10% article share

For each row with a well-formed eISSN, find the OpenAlex source record and keep
every subfield accounting for **at least 10% of that journal's article count**,
mapped to a taxonomy topic through the Journal Policy Finder's committed
`scripts/crosswalk.json`. Duplicates collapse, order is preserved.

This deliberately diverges from the Journal Policy Finder, which keeps *every*
mapped subfield (11.6 topics per journal). That is correct there and wrong here.
That tool searches 52,714 journals, most of them not under any agreement, so its
job is recall — never make a journal unfindable. This tool holds 6,147 rows that
are all actionable, so its job is precision. Under the uncapped rule, "Aviation &
Aerospace Engineering" matches 1,458 of the taggable rows and "Economics" matches
1,928; a filter returning a third of the table has not filtered anything, and
teaches faculty the filter cannot be trusted.

The rule the Journal Policy Finder tried and reverted (see the comment in its
`scripts/tags.py`) was a *rank* cap — keep the leading N subfields. That failed
because OpenAlex's leading subfield labels are noisy, so a rank cap locks the noise
in and discards the real subject. A share threshold behaves differently: it is
self-adjusting. A focused journal keeps two or three topics; a genuinely
interdisciplinary one keeps more because its distribution really is spread out.

Spot-checked output:

- Journal of the American Chemical Society → Organic Chemistry, Chemical & Material Sciences (general), Molecular Biology
- Angewandte Chemie International Edition → Organic Chemistry, Chemical & Material Sciences (general), Sustainable Energy, Inorganic Chemistry
- The Journal of Finance → Finance, Accounting & Taxation, Economics
- American Journal of Political Science → Political Science, Economics, Sociology
- Psychological Medicine → Psychiatry, Psychology
- Advanced Science → Electrical & Electronic Engineering, Biomedical Technology, Molecular Biology, Chemical & Material Sciences (general)

### Safety net for evenly-spread journals

A share threshold has one structural weakness: a multidisciplinary megajournal can
be spread so evenly across subfields that none clears 10%, leaving it with no topics
at all. This is rare in the current dataset — the usual suspects (*Scientific
Reports*, *Nature Communications*, *PLOS ONE*, *Heliyon*) are all absent, because
Springer Nature's TA coverage here is hybrid titles — but it is not absent. Exactly
two rows hit it: *The Scientific World Journal* (Wiley, 20 subfields, top share 9.0%)
and *Comparative Clinical Pathology* (Springer Nature, 19 subfields, top share 9.3%).

So when a matched journal has subfields but none clears the threshold, keep its
**three largest mapped subfields** instead. *Comparative Clinical Pathology* then
resolves to Tropical Medicine & Parasitology, Veterinary Medicine, and Agronomy &
Crop Science; *The Scientific World Journal* to Botany, Toxicology, and Operations
Research — broad, but a fair description of a general-science journal.

This is worth specifying for its future value more than for these two rows. The net
fires only when the primary rule returns nothing, so it cannot reduce precision
anywhere else, and it means the rule degrades gracefully if the agreements later
add fully-OA megajournals — a live possibility as Wiley's Hindawi titles and
Springer's OA portfolio move in and out of coverage. The honest caveat is that rows
tagged this way carry less certain topics than the other 4,608.

### Publisher-level fallback

When neither the threshold nor the safety net yields anything — which means the row
had no OpenAlex match at all — assign at the publisher level where the subject is
unambiguous:

- Publisher contains `ACM` → `engineering-computer-science/general` (1,473 rows).
  These are the conference-proceedings rows carrying the `[conference proceedings]`
  eISSN placeholder. OpenAlex does not model conference proceedings as journal
  sources at all, so no better join exists — but ACM is a computing society, so the
  area is not a guess. Without this, a CS researcher filtering to their own field
  would lose a quarter of the dataset.
- Publisher contains `Royal Society of Chemistry` → `chemical-material-sciences/general`
  (56 rows). These are the known title-only rows with no eISSN. Backfilling those
  eISSNs (an existing project follow-up) would replace this fallback with real topics.

Rows still untagged after the fallback (8) carry no topics and are excluded while a
discipline filter is active. They remain fully visible in the default unfiltered
view and through search, publisher, and campus filters.

### Pipeline

The governing constraint is that this repo is being handed to developers and
technical teams to maintain. Someone who clones it — with no sibling checkout and
no access to the original author's machine — must be able to rebuild
`html/data.json` offline and refresh the subject data with one documented command.

The offline half is not merely nice to have: `build-data.yml` runs
`ruby bin/build_data` and then `git diff --exit-code html/data.json`, so the build
must be deterministic and network-free or CI flakes.

So the OpenAlex dependency splits in two, and every input lives in this repo:

```
OpenAlex API   (api.openalex.org/sources?filter=issn:…)
        │
        │  bin/fetch_openalex    (new · Ruby · network · run manually, rarely)
        ▼
  data/openalex-subfields.json   committed · 774 KB · eISSN → [[subfieldId, articleCount], …]
  data/crosswalk.json            committed ·  14 KB · OpenAlex subfield id → taxonomy topic
  data/taxonomy.json             committed ·  26 KB · 8 areas, 172 topics
        │
        │  bin/build_data        (existing, extended · offline · deterministic)
        ▼
  html/data.json                 topics per row + taxonomy with TA-derived counts
```

`bin/fetch_openalex` reads the eISSNs out of the CSV (4,617 distinct and
well-formed), queries `sources?filter=issn:A|B|C…` in batches of 50, and keeps each
source's subfield article counts. Verified against the live API: 50 ISSNs per
request in about a second, so 93 requests refresh everything in roughly two
minutes. No API key is needed — just a `mailto` for OpenAlex's polite pool.

This replaces an earlier draft that joined against the Journal Policy Finder's
`build/sources.jsonl`. That file is 136 MB, gitignored in that repo, and exists on
exactly one laptop — the precise dependency a handover cannot carry. Fetching by
ISSN reaches the same underlying records (both routes read OpenAlex's `topics`
array, which the API caps at 25 entries per source), so the measured figures in
this document hold for the new route.

`crosswalk.json` and `taxonomy.json` are copied out of the Journal Policy Finder,
where they are committed and small, and vendored here. After that the two repos
share no files, and neither can break the other.

Committing the subfield snapshot rather than only the derived topics is what keeps
the build offline and lets a maintainer retune the threshold or the safety net
without touching the network. It is 774 KB (about 210 KB gzipped over the wire), against
an `html/data.json` that is already 1.6 MB. The `data/discipline-tags.json` of the
earlier draft is dropped: with the snapshot in the repo, a separate derived-tags
file is a redundant artifact that could silently drift from it.

### `html/data.json` schema change

`bin/build_data` gains a ninth element per row (the row's topics as interned integer
ids) and a top-level `taxonomy` key:

```json
{
  "header": [ …8 existing names…, "Disciplines" ],
  "version": "<content hash>",
  "taxonomy": {
    "areas":     { "<areaId>": { "label": "…", "subcategories": { "<slug>": "…" } } },
    "tag_list":  [ "<areaId>/<slug>", … ],
    "tag_counts":{ "<id>": <number of TA rows> }
  },
  "data": [ [ …8 existing cells…, [<tagId>, …] ], … ]
}
```

`tag_counts` is computed from the TA rows, not copied from the Journal Policy
Finder, so the number beside each topic in the picker means "TA journals available
here." Topics with a count of zero are not offered.

`Disciplines` joins `header` to keep header length and row length in step for the CI
shape check; it is data only and renders no column. The version hash covers `data`
and `taxonomy` together so a taxonomy-only change still bumps it. Existing row
indices 0–7 are untouched, so `script.js`'s column definitions keep working.

Both assertions in `.github/workflows/build-data.yml` need updating: the expected
header gains `"Disciplines"` and the row-length check becomes 9.

## Front end

### Porting the picker

Copy the Journal Policy Finder's `discipline-picker.js` and
`discipline-options.js` into a single `html/js/discipline-picker.js`, and its
`.picker*` / `.pill*` rules (styles.css lines ~585–735) into
`html/css/styles.css`. The picker is genuinely self-contained — no framework, and
its keyboard and screen-reader behavior is already built — so this is close to a
copy.

Two mechanical changes: the source files are ES modules, but `script.js` is a
classic script relying on jQuery and `$(document).ready`. Converting it to a module
would change load and defer timing around DataTables for no benefit, so the port
drops `import`/`export`, inlines the small `escapeHtml` helper it took from
`render.js`, and exposes `createDisciplinePicker` and `buildDisciplineOptions` on a
single `window.NUDiscipline` namespace. It loads before `script.js`.

### Placement and wiring

A second field joins the Publisher dropdown in `CreateFilterContainer`: a
`Filter by Discipline:` label plus `<div id="disciplinePicker" class="picker">`.
The picker is created inside the `ajax.dataSrc` callback, after `data.json` arrives,
because its area and topic counts come from the data.

The label follows the existing pattern (`<label for>` pointing at the trigger
button), so the picker accepts a `triggerId` option to put the id on its own button.

### Filter semantics

Selected topics are OR'd: a row matches if it carries **any** selected topic. The
result AND's with the Publisher filter — the only other filter on this branch —
inside the same `$.fn.dataTable.ext.search` callback, reading the row's tags from
`rawData[dataIndex][8]`.

One asymmetry to implement deliberately: the Publisher filter treats an empty
selection as "no rows pass", which works because every box starts checked. The
discipline picker starts **empty**, and empty must mean "no discipline filtering,
show everything." So the discipline check short-circuits to `true` when nothing is
selected.

No cap on the number of selected topics. The Journal Policy Finder caps at 3
because a flat 172-checkbox grid pushed its results off screen; that constraint
does not exist here, and an interdisciplinary researcher wanting four topics should
not be blocked. Pills wrap.

### Surrounding UI

- `renderFilterSummary` gains an `N discipline(s)` clause and shows the banner
  whenever any topic is selected.
- Both "Clear all filters" paths (`#clearAllFiltersBtn` and
  `#clearAllFiltersFromEmpty`) call the picker's `clear()` and reset the selection.
- `CreateNoResultsMessage`'s "Too Many Filters" item mentions the discipline filter.
- A new `<li>` in the "About the data" list in `index.html`, following the existing
  `<strong id="eissnInfo">` / `<strong id="agreementInfo">` pattern. Faculty need to
  know these subjects are derived
  from publication data rather than assigned by publishers: topics come from OpenAlex
  subject data for each journal, keeping those accounting for at least 10% of its
  articles; ACM proceedings and Royal Society of Chemistry titles are classified at
  the publisher level; and 8 titles are unclassified, so they appear only when no
  discipline is selected.

## Validation

The join is the part that can break silently, so it gets the real tests.

The tagging rule lives in `lib/disciplines.rb` as pure functions — subfield counts
in, topic slugs out, no file or network access — so `bin/build_data` stays a thin
caller and the logic is testable directly. That is the seam the tests aim at.

1. **Unit tests for the tagging rule** (`test/test_disciplines.rb`, Ruby stdlib
   minitest — no new gems). Pure-function cases: a focused journal keeps few topics;
   an even spread keeps many; the below-threshold tail is dropped; unmapped subfield
   ids are ignored; a record with no subfields yields `[]`; duplicates collapse with
   order preserved; the safety net fires only when nothing clears 10% and caps at
   three topics; the ACM and RSC fallbacks fire only when both of those yield nothing.
2. **Build-time assertions in `bin/build_data`** that abort rather than ship bad
   data: every crosswalk target and every tag assigned to a row resolves in the
   taxonomy `tag_list`; every eISSN in `openalex-subfields.json` is well-formed;
   discipline-reachable coverage is at least 98% (currently 99.9%). It prints a
   coverage summary — threshold, safety net, each fallback, and unreachable — so a
   regression is visible in the CI log.
3. **Golden spot-checks against the built `html/data.json`**, asserting the titles
   listed under the tagging rule above resolve to those exact topics. This is what
   catches a silently broken eISSN join, which would otherwise look like a
   successful build with an empty filter.
4. **CI** (`build-data.yml`): updated header and row-length assertions, plus a step
   running the minitest suite.
5. **Manual browser check** before merge: Organic Chemistry returns 97 rows, Finance
   108, the Engineering & Computer Science area 2,976; clearing returns all 6,147;
   discipline combined with a publisher narrows further; Escape closes the panel and
   returns focus, and arrow keys walk the rows.

## Setup fixes for handover

Audited while designing the pipeline. None of these block the filter, but they are
the things that would waste a new maintainer's first day, and they are cheapest to
fix while the pipeline is already being touched.

**1. `bin/update` is a booby trap.** It is the inherited U-M Google-Sheets/S3
importer, superseded by `bin/build_data`. The README says it "remains in the repo for
reference but is not wired up," but it is not inert: `Dockerfile`'s data stage ends
`CMD ["bin/update"]`, so `docker compose run data` — the documented Docker entry
point — dies on a missing `credentials.json64`. And `Gemfile` carries `google_drive`
and `json-schema` solely for it, so every `bundle install` pulls a Google API stack
this project never runs. Proposed: delete `bin/update`, drop both gems, repoint the
Dockerfile at `bin/build_data`, and drop the now-unused `/credentials.json64` from
`.gitignore`. Git history keeps the file recoverable. **Approved 2026-08-04.**

**2. Ruby version drift.** Both workflows pin 3.2, the Dockerfile builds on 3.3, and
nothing declares a version for local development. Add a `.ruby-version` and have the
workflows and Dockerfile read it, so all three agree.

**3. No test harness or single entry point.** There is no `test/` and no `Rakefile`.
Add a `Rakefile` whose default task runs the tests and the build, and a CI step that
calls it, so a maintainer's first command is `rake` rather than a guess.

**4. `.gitignore` is nearly empty** — one line, for the credentials file being
removed. Add `.DS_Store`, which is currently loose in the working tree.

**5. Two untracked spreadsheets sit in the repo root**: `IOP-ACS-ACM.xlsx` (103 KB)
and `master list of ACS subscriptions.xls` (26 KB) — raw publisher material behind
some CSV rows. **Decided 2026-08-04: leave them out.** Their data quality is still
being worked on, so they are not ready for a public repo. `.gitignore` covers them
by name so they cannot be committed by accident while in flux; revisit once the
underlying data settles, at which point `data/sources/` is the natural home.

**6. README needs a subject-data section**: what the topics are, that they are
derived from OpenAlex rather than publisher-assigned, the refresh command, and the
deliberate divergence from the Journal Policy Finder's tag rule — so the next
maintainer does not "fix" the two sites into agreement.

## Rollout

Push `subject-filter` and open a PR so `build-data.yml` runs on it, then merge to
`main`, which deploys through the Pages workflow.

A maintainer's loop after this lands:

```sh
rake                    # tests, then rebuild html/data.json from committed inputs
ruby bin/fetch_openalex # only to refresh subject data (network, ~2 min)
```

## Future work

- Curate the 1,470 ACM proceedings to real topics from their series names (KDD,
  ASPLOS, SIGGRAPH …), replacing the publisher-level area assignment.
- Backfill the 56 Royal Society of Chemistry eISSNs, which retires that fallback.
- Chase the 8 unreachable rows (Wiley 3, Cambridge 2, ACS 2, Springer Nature 1) —
  each has a real eISSN that OpenAlex does not carry, so each needs a look.
- Note in the README that the two sites intentionally use different tag rules, so
  the divergence is not later "fixed" into consistency.
