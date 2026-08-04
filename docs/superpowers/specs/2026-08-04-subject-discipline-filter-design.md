# Subject/Discipline Filter for the TA Finder — Design

Date: 2026-08-04
Branch: `subject-filter` (off `origin/main` @ bfa871b)

## Goal

Let Northwestern faculty and researchers narrow the 6,147 transformative-agreement
rows to journals in their own discipline.

Today the only ways in are free-text search on title/eISSN and the Publisher,
Campus, and "100% covered" filters. All of those assume the author already has a
title in mind. The question this feature answers is the one researchers actually
arrive with: *which journals in my field can I publish in under a Northwestern or
BTAA agreement?*

## Non-goals

- No visible Disciplines column in the results table (it is already six columns wide).
- No fine-grained subject tagging of ACM conference proceedings; they are classified
  at the publisher level. Curating the 1,470 series names is separate future work.
- No change to the CSV schema, the search box, or the existing filters' behavior.
- No network access at build time or page load. The OpenAlex join happens once,
  offline, and its result is committed.

## Verified data findings

Measured against `data/northwestern-agreements.csv` (6,147 rows) joined to the
OpenAlex source dump in the Journal-Policy-Finder checkout. These are the numbers
the design is built on, not estimates.

| How a row gets its topics | Rows |
|---|---:|
| The 10%-share rule, from OpenAlex subject data | 4,574 |
| Safety net — matched OpenAlex, but no subfield cleared 10% | 2 |
| ACM publisher-level fallback | 1,476 |
| Royal Society of Chemistry publisher-level fallback | 56 |
| **Reachable by a discipline filter** | **6,108 (99.4%)** |
| Unreachable: Wiley 21, Cambridge 11, Springer Nature 5, ACS 2 | 39 |

1,571 rows have no OpenAlex match at all: 1,470 ACM proceedings placeholders, 56
blank RSC eISSNs, and 45 real eISSNs absent from OpenAlex. The ACM and RSC
fallbacks absorb all but 39 of those. With the safety net in place the residue has
a clean definition: a row is unreachable exactly when it has no OpenAlex match and
is not an ACM or RSC title.

Topics populated: 164 of 172. Mean 2.24 topics per row (median 2, max 6).

Journals a researcher would see per broad area:

| Area | Journals | | Sample topic | Journals |
|---|---:|---|---|---:|
| Engineering & Computer Science | 2,958 | | Artificial Intelligence | 285 |
| Health & Medical Sciences | 1,674 | | Oncology | 161 |
| Life Sciences & Earth Sciences | 1,090 | | Ecology | 275 |
| Social Sciences | 1,079 | | Sociology | 546 |
| Business, Economics & Management | 587 | | Finance | 108 |
| Physics & Mathematics | 572 | | Pure & Applied Mathematics | 108 |
| Chemical & Material Sciences | 411 | | Organic Chemistry | 95 |
| Humanities, Literature & Arts | 334 | | History | 54 |

## Data layer

### Taxonomy

Reuse the Google Scholar-derived taxonomy already committed in the Journal Policy
Finder (`html/data/taxonomy.json`): 8 broad areas, 172 topics, each topic keyed by
an `area-slug/topic-slug` pair. Copied verbatim into TA-Finder as
`data/taxonomy.json`. Sharing the taxonomy is what makes the two sites feel like
one family of tools; what they must *not* share is the tag-assignment rule (below).

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
tagged this way carry less certain topics than the other 4,574.

### Publisher-level fallback

When neither the threshold nor the safety net yields anything — which means the row
had no OpenAlex match at all — assign at the publisher level where the subject is
unambiguous:

- Publisher contains `ACM` → `engineering-computer-science/general` (1,476 rows).
  These are the conference-proceedings rows carrying the `[conference proceedings]`
  eISSN placeholder. OpenAlex does not model conference proceedings as journal
  sources at all, so no better join exists — but ACM is a computing society, so the
  area is not a guess. Without this, a CS researcher filtering to their own field
  would lose a quarter of the dataset.
- Publisher contains `Royal Society of Chemistry` → `chemical-material-sciences/general`
  (56 rows). These are the known title-only rows with no eISSN. Backfilling those
  eISSNs (an existing project follow-up) would replace this fallback with real topics.

Rows still untagged after the fallback (39) carry no topics and are excluded while a
discipline filter is active. They remain fully visible in the default unfiltered
view and through search, publisher, and campus filters.

### Pipeline

`bin/build_data` must stay offline, deterministic, and Ruby-only — CI runs
`ruby/setup-ruby` and nothing else, and the `build-data.yml` workflow asserts
`html/data.json` is in sync with its inputs. The OpenAlex join cannot live there:
its largest input is `build/sources.jsonl` in the Journal-Policy-Finder checkout,
136 MB, gitignored there, and only regenerable by paging the OpenAlex API.

So the join runs once in its own script and its output is committed:

```
Journal-Policy-Finder (local checkout, not a dependency at build time)
  build/sources.jsonl        136 MB, gitignored, regenerable via its fetch_openalex
  scripts/crosswalk.json     committed there
  html/data/taxonomy.json    committed there
        │
        │  bin/build_discipline_tags   (new, Ruby, one-shot, manual)
        ▼
TA-Finder
  data/taxonomy.json         committed copy of the taxonomy
  data/discipline-tags.json  committed: eISSN → topic slugs, plus provenance
        │
        │  bin/build_data              (existing, extended)
        ▼
  html/data.json             tags per row + taxonomy with TA-derived counts
```

`bin/build_discipline_tags` is written in Ruby rather than Python to keep the repo
single-language and CI unchanged. It takes the path to the Journal-Policy-Finder
checkout, and records the SHA-256 of all three inputs plus the threshold in its
output, so a future refresh is a documented command rather than lost knowledge.

`data/discipline-tags.json`:

```json
{
  "threshold": 0.10,
  "source": "OpenAlex sources, joined by eISSN",
  "inputs": { "sources_jsonl": "sha256:…", "crosswalk": "sha256:…", "taxonomy": "sha256:…" },
  "by_eissn": { "1520-5126": ["chemical-material-sciences/organic-chemistry", "…"] }
}
```

Keeping `by_eissn` as slugs, not integers, makes the committed diff reviewable by a
human when the data is refreshed. Interning to integers happens at build time.

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

A third field joins the Publisher and Campus dropdowns in `CreateFilterContainer`:
a `Filter by Discipline:` label plus `<div id="disciplinePicker" class="picker">`.
The picker is created inside the `ajax.dataSrc` callback, after `data.json` arrives,
because its area and topic counts come from the data.

The label follows the existing pattern (`<label for>` pointing at the trigger
button), so the picker accepts a `triggerId` option to put the id on its own button.

### Filter semantics

Selected topics are OR'd: a row matches if it carries **any** selected topic. The
result AND's with Publisher, Campus, and the 100%-covered checkbox, inside the same
`$.fn.dataTable.ext.search` callback the other filters use, reading the row's tags
from `rawData[dataIndex][8]`.

One asymmetry to implement deliberately: Publisher and Campus treat an empty
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
- A new explanatory paragraph in the page's info section, matching the existing
  `eissnInfo` / `discountOrWaiverInfo` / `coverageYearsInfo` pattern and linked from
  the same "Learn more about…" line. Faculty need to know these subjects are derived
  from publication data rather than assigned by publishers: topics come from OpenAlex
  subject data for each journal, keeping those accounting for at least 10% of its
  articles; ACM proceedings and Royal Society of Chemistry titles are classified at
  the publisher level; and 39 titles are unclassified, so they appear only when no
  discipline is selected.

## Validation

The join is the part that can break silently, so it gets the real tests.

1. **Unit tests for the tagging rule** (`test/test_discipline_tags.rb`, Ruby stdlib
   minitest — no new gems). Pure-function cases: a focused journal keeps few topics;
   an even spread keeps many; the below-threshold tail is dropped; unmapped subfield
   ids are ignored; a record with no subfields yields `[]`; duplicates collapse with
   order preserved; the safety net fires only when nothing clears 10% and caps at
   three topics; the ACM and RSC fallbacks fire only when both of those yield nothing.
2. **Build-time assertions in `bin/build_data`** that abort rather than ship bad
   data: every slug in `discipline-tags.json` and every tag on a row resolves in the
   taxonomy `tag_list`; discipline-reachable coverage is at least 98% (currently
   99.4%). It prints a coverage summary — threshold, safety net, each fallback, and
   unreachable — so a regression is visible in the CI log.
3. **Golden spot-checks against the built `html/data.json`**, asserting the titles
   listed under the tagging rule above resolve to those exact topics. This is what
   catches a silently broken eISSN join, which would otherwise look like a
   successful build with an empty filter.
4. **CI** (`build-data.yml`): updated header and row-length assertions, plus a step
   running the minitest suite.
5. **Manual browser check** before merge: Organic Chemistry returns 95 rows, Finance
   108, the Engineering & Computer Science area 2,958; clearing returns all 6,147;
   discipline combined with a publisher narrows further; Escape closes the panel and
   returns focus, and arrow keys walk the rows.

## Rollout

Push `subject-filter` and open a PR so `build-data.yml` runs on it, then merge to
`main`, which deploys through the Pages workflow.

## Future work

- Curate the 1,470 ACM proceedings to real topics from their series names (KDD,
  ASPLOS, SIGGRAPH …), replacing the publisher-level area assignment.
- Backfill the 56 Royal Society of Chemistry eISSNs, which retires that fallback.
- Chase the 39 unreachable rows (Wiley 21, Cambridge 11, Springer Nature 5, ACS 2) —
  each has a real eISSN that OpenAlex does not carry, so each needs a look.
- Note in the README that the two sites intentionally use different tag rules, so
  the divergence is not later "fixed" into consistency.
