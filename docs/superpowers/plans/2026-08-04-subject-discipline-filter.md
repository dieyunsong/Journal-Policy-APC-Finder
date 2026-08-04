# Subject/Discipline Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let researchers narrow the 6,147 transformative-agreement rows to journals in their own discipline, using subject topics derived from OpenAlex.

**Architecture:** A manual, network-using Ruby script fetches OpenAlex subject data for the CSV's eISSNs into a committed snapshot. The existing offline Ruby build joins that snapshot to the CSV, applies a 10%-article-share rule with a safety net and two publisher-level fallbacks, and writes topics plus a taxonomy into `html/data.json`. The front end gains a two-level discipline picker (ported from the sibling Journal-Policy-Finder repo) wired into the existing DataTables custom search callback.

**Tech Stack:** Ruby 3.3 (stdlib only — no gems), Minitest, Rake, vanilla JS, jQuery 3.7, DataTables 2.x, Bootstrap 5.3.

**Spec:** `docs/superpowers/specs/2026-08-04-subject-discipline-filter-design.md`

## Global Constraints

- Branch: `subject-filter` (already created off `origin/main` @ bfa871b). Do not merge to `main`; the plan ends at an open PR.
- `bin/build_data` must stay **offline and deterministic**: no network, no clock, no randomness. CI runs it then asserts `git diff --exit-code html/data.json`.
- **Ruby stdlib only.** No new gems. `Gemfile` is being emptied of its last two gems in Task 1, not added to.
- Threshold constant: `0.10`. Safety-net cap: `3` topics. Fallback topics: ACM → `engineering-computer-science/general`, Royal Society of Chemistry → `chemical-material-sciences/general`.
- Coverage floor asserted by the build: **98%** of rows must be discipline-reachable (measured: 99.4%).
- `html/data.json` row length becomes **9**; `header` length becomes **9** (9th name: `Disciplines`). Existing indices 0–7 must not move.
- The discipline picker allows **unlimited** selections (deliberate divergence from the sibling repo's cap of 3).
- Empty discipline selection means **show everything** (opposite of the Publisher filter, where empty means show nothing).
- Every commit message ends with: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Never commit `IOP-ACS-ACM.xlsx` or `master list of ACS subscriptions.xls` — data quality still in progress; `.gitignore` must cover them.

## Verification targets (assert these once data is built)

| Check | Expected |
|---|---|
| Total rows | 6,147 |
| Discipline-reachable | ≥ 6,050 (measured 6,108 = 99.4%) |
| Topics populated | ~164 of 172 |
| Organic Chemistry | ~95 rows |
| Finance | ~108 rows |
| Engineering & Computer Science area | ~2,958 rows |

Counts are approximate because OpenAlex article counts drift between fetches (observed: a JACS subfield moved 75,003 → 75,007 in a week). Assert *topic identity* exactly and *row counts* loosely.

---

### Task 1: Repo hygiene and handover setup

Removes the dead Google-Sheets importer, aligns Ruby versions, and adds the test harness the later tasks need. No feature code.

**Files:**
- Delete: `bin/update`
- Modify: `Gemfile`, `Gemfile.lock`, `Dockerfile:35`, `.gitignore`, `.github/workflows/build-data.yml`, `.github/workflows/deploy-pages.yml`
- Create: `.ruby-version`, `Rakefile`, `test/test_helper.rb`

**Interfaces:**
- Consumes: nothing.
- Produces: `rake` (default task = `rake test` then `rake build`), `rake test`, `rake build`. `test/test_helper.rb` puts `lib/` on the load path for all later test files.

- [ ] **Step 1: Confirm the legacy gems are used only by `bin/update`**

```bash
grep -rn "json-schema\|JSON::Validator\|google_drive\|GoogleDrive\|bundler/setup\|Bundler.require" bin/ html/ .github/
```

Expected: every hit is in `bin/update`. If anything outside `bin/update` appears, STOP and report — the deletion below is unsafe.

- [ ] **Step 2: Delete the dead importer**

```bash
git rm bin/update
```

- [ ] **Step 3: Empty the Gemfile of the gems only `bin/update` used**

Replace the whole of `Gemfile` with:

```ruby
# Copyright (c) 2026, Regents of the University of Michigan. All rights reserved.
# See LICENSE.txt for details.

source "https://rubygems.org"

# Intentionally empty. The build (bin/build_data), the OpenAlex fetch
# (bin/fetch_openalex), and the tests all use the Ruby standard library only, so a
# clone needs no `bundle install`. The google_drive and json-schema gems were
# dropped with bin/update, the retired Google-Sheets importer.
```

- [ ] **Step 4: Regenerate the lockfile**

```bash
bundle lock
git diff --stat Gemfile.lock
```

Expected: `Gemfile.lock` shrinks, losing `google_drive`, `json-schema`, and their transitive dependencies. If `bundle` is unavailable, delete `Gemfile.lock` instead (`git rm Gemfile.lock`) — nothing in the repo requires Bundler now.

- [ ] **Step 5: Repoint the Dockerfile's data stage**

In `Dockerfile`, change the data-stage command:

```dockerfile
CMD ["bin/build_data"]
```

(replacing `CMD ["bin/update"]` on line 35)

- [ ] **Step 6: Declare one Ruby version**

Create `.ruby-version`:

```
3.3
```

In **both** `.github/workflows/build-data.yml` and `.github/workflows/deploy-pages.yml`, replace:

```yaml
        with:
          ruby-version: "3.2"
```

with:

```yaml
        with:
          ruby-version-file: .ruby-version
```

- [ ] **Step 7: Extend `.gitignore`**

Replace the whole of `.gitignore` with:

```
.DS_Store

# Raw publisher spreadsheets: data quality still in progress, and this repo is
# public. Revisit once the underlying data settles.
IOP-ACS-ACM.xlsx
master list of ACS subscriptions.xls
```

(The previous sole entry, `/credentials.json64`, went with `bin/update`.)

- [ ] **Step 8: Add the test harness**

Create `test/test_helper.rb`:

```ruby
# Shared setup for the Minitest suite. Minitest ships with Ruby, so there is no
# gem to install; `rake test` loads this first to put lib/ on the load path.

require "minitest/autorun"

$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))
```

Create `Rakefile`:

```ruby
# Single entry point for maintainers:
#
#   rake          tests, then rebuild html/data.json from committed inputs
#   rake test     unit tests only
#   rake build    rebuild html/data.json only (offline, deterministic)
#
# Refreshing the OpenAlex subject data is deliberately NOT a rake task: it needs
# network access and should be a conscious act. Run `ruby bin/fetch_openalex`.

require "rake/testtask"

Rake::TestTask.new(:test) do |t|
  t.libs << "test" << "lib"
  t.test_files = FileList["test/test_*.rb"]
  t.warning = false
end

desc "Rebuild html/data.json from the committed CSV and subject data"
task :build do
  ruby "bin/build_data"
end

task default: %i[test build]
```

- [ ] **Step 9: Verify the harness runs with no tests yet**

```bash
rake test
```

Expected: PASS with `0 runs, 0 assertions, 0 failures, 0 errors` (Rake reports no test files or an empty run — either is fine). If it errors on a missing `lib/` directory, create it with `mkdir -p lib` and re-run.

- [ ] **Step 10: Verify the build still works untouched**

```bash
ruby bin/build_data && git diff --exit-code html/data.json && echo "data.json unchanged as expected"
```

Expected: prints the row count, then `data.json unchanged as expected`. Task 1 changes no data.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: retire bin/update and add a test harness

bin/update was the inherited U-M Google-Sheets/S3 importer that bin/build_data
replaced. It was not inert: the Dockerfile's data stage ran it, so the documented
`docker compose run data` died on a missing credentials.json64. It was also the
only reason the Gemfile carried google_drive and json-schema, so every bundle
install pulled a Google API stack this project never runs. The Gemfile is now
empty and a clone needs no bundle install at all.

Also aligns Ruby versions (workflows pinned 3.2, Dockerfile built 3.3, nothing
declared one for local dev), adds a Rakefile so a maintainer's first command is
`rake`, and gitignores the two publisher spreadsheets whose data quality is still
being worked on.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The tagging rule as pure functions

The heart of the feature, isolated from all I/O so it can be tested directly.

**Files:**
- Create: `lib/disciplines.rb`
- Test: `test/test_disciplines.rb`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Disciplines::THRESHOLD` → `0.10`
  - `Disciplines::NET_LIMIT` → `3`
  - `Disciplines.topics_for(subfields, crosswalk)` → `Array<String>` of topic slugs. `subfields` is `[[subfield_id_string, article_count_integer], ...]` in any order; `crosswalk` is `{ subfield_id_string => topic_slug_string }`.
  - `Disciplines.publisher_fallback(publisher)` → `Array<String>` (0 or 1 slug).
  - `Disciplines.tags_for(subfields, crosswalk, publisher)` → `[Array<String>, Symbol]` — the full rule, returning the topics **and** which branch produced them: `:openalex`, `:publisher_fallback`, or `:unreachable`. Task 5 needs the branch to report coverage, and returning it here keeps one code path for the rule instead of letting the build re-derive it.

- [ ] **Step 1: Write the failing tests**

Create `test/test_disciplines.rb`:

```ruby
require "test_helper"
require "disciplines"

class TestTopicsFor < Minitest::Test
  # Two chemistry subfields and a long tail, mirroring how OpenAlex describes a
  # focused journal. Only the two clearing 10% should survive.
  CROSSWALK = {
    "1605" => "chemical-material-sciences/organic-chemistry",
    "1606" => "chemical-material-sciences/general",
    "1312" => "life-sciences-earth-sciences/molecular-biology",
    "2202" => "engineering-computer-science/aviation-aerospace-engineering",
    "9999" => "physics-mathematics/general",
  }.freeze

  def test_keeps_only_subfields_at_or_above_ten_percent
    subfields = [["1605", 500], ["1606", 300], ["2202", 150], ["1312", 50]]
    # total 1000 => 50%, 30%, 15%, 5%
    assert_equal [
      "chemical-material-sciences/organic-chemistry",
      "chemical-material-sciences/general",
      "engineering-computer-science/aviation-aerospace-engineering",
    ], Disciplines.topics_for(subfields, CROSSWALK)
  end

  def test_exactly_ten_percent_is_kept
    subfields = [["1605", 900], ["1606", 100]]
    assert_includes Disciplines.topics_for(subfields, CROSSWALK),
                    "chemical-material-sciences/general"
  end

  def test_orders_topics_by_article_count_regardless_of_input_order
    subfields = [["1606", 300], ["1605", 700]]
    assert_equal [
      "chemical-material-sciences/organic-chemistry",
      "chemical-material-sciences/general",
    ], Disciplines.topics_for(subfields, CROSSWALK)
  end

  def test_collapses_duplicate_slugs_preserving_first_position
    # Two subfield ids crosswalking to the same topic must yield it once.
    crosswalk = CROSSWALK.merge("1607" => "chemical-material-sciences/general")
    subfields = [["1606", 500], ["1607", 400], ["1605", 100]]
    assert_equal [
      "chemical-material-sciences/general",
      "chemical-material-sciences/organic-chemistry",
    ], Disciplines.topics_for(subfields, crosswalk)
  end

  def test_ignores_subfields_missing_from_the_crosswalk
    subfields = [["1605", 600], ["0000", 400]]
    assert_equal ["chemical-material-sciences/organic-chemistry"],
                 Disciplines.topics_for(subfields, CROSSWALK)
  end

  def test_no_subfields_yields_nothing
    assert_equal [], Disciplines.topics_for([], CROSSWALK)
    assert_equal [], Disciplines.topics_for(nil, CROSSWALK)
  end

  def test_zero_counts_yield_nothing_without_dividing_by_zero
    assert_equal [], Disciplines.topics_for([["1605", 0], ["1606", 0]], CROSSWALK)
  end
end

class TestSafetyNet < Minitest::Test
  CROSSWALK = TestTopicsFor::CROSSWALK

  # A megajournal spread across 12 subfields so evenly that the largest is only
  # 8.7% of its output. Without the net this journal would carry no topics at all
  # and would vanish from every discipline filter. The trailing 80xx ids are
  # deliberately absent from CROSSWALK: they dilute the total without adding
  # topics, which is what real unmapped OpenAlex subfields do.
  EVENLY_SPREAD = [
    ["1605", 100], ["1606", 99], ["1312", 98], ["2202", 97], ["9999", 96],
    ["8001", 95], ["8002", 95], ["8003", 95], ["8004", 95], ["8005", 95],
    ["8006", 95], ["8007", 95],
  ].freeze

  def test_the_fixture_really_has_no_subfield_clearing_ten_percent
    # Guards the guard: if this fixture ever drifts above the threshold, the test
    # below would silently stop exercising the safety net at all.
    total = EVENLY_SPREAD.sum { |(_, count)| count }
    largest = EVENLY_SPREAD.map { |(_, count)| count }.max
    assert_operator largest.to_f / total, :<, 0.10,
                    "fixture's largest subfield is #{largest}/#{total}"
  end

  def test_falls_back_to_the_three_largest_mapped_subfields
    assert_equal [
      "chemical-material-sciences/organic-chemistry",
      "chemical-material-sciences/general",
      "life-sciences-earth-sciences/molecular-biology",
    ], Disciplines.topics_for(EVENLY_SPREAD, CROSSWALK)
  end

  def test_net_does_not_fire_when_the_threshold_produced_something
    subfields = [["1605", 500], ["1606", 200], ["1312", 150], ["2202", 150]]
    result = Disciplines.topics_for(subfields, CROSSWALK)
    assert_equal 4, result.length, "all four clear 10%; the net must not cap to 3"
  end

  def test_net_returns_nothing_when_no_subfield_is_mapped
    assert_equal [], Disciplines.topics_for([["7777", 10], ["6666", 10]], CROSSWALK)
  end
end

class TestPublisherFallback < Minitest::Test
  def test_acm_maps_to_engineering_and_computer_science
    assert_equal ["engineering-computer-science/general"],
                 Disciplines.publisher_fallback("Association of Computing Machinery (ACM)")
  end

  def test_royal_society_of_chemistry_maps_to_chemistry
    assert_equal ["chemical-material-sciences/general"],
                 Disciplines.publisher_fallback("Royal Society of Chemistry")
  end

  def test_other_publishers_get_nothing
    assert_equal [], Disciplines.publisher_fallback("Wiley")
    assert_equal [], Disciplines.publisher_fallback("Springer Nature")
    assert_equal [], Disciplines.publisher_fallback(nil)
  end
end

class TestTagsFor < Minitest::Test
  CROSSWALK = TestTopicsFor::CROSSWALK

  def test_openalex_topics_win_over_the_publisher_fallback
    # An ACM journal with real subject data must get its real topics, not the
    # publisher-level area.
    slugs, source = Disciplines.tags_for([["1605", 900], ["1606", 100]], CROSSWALK,
                                         "Association of Computing Machinery (ACM)")
    assert_equal [
      "chemical-material-sciences/organic-chemistry",
      "chemical-material-sciences/general",
    ], slugs
    assert_equal :openalex, source
  end

  def test_fallback_applies_when_there_is_no_subject_data
    assert_equal [["engineering-computer-science/general"], :publisher_fallback],
                 Disciplines.tags_for([], CROSSWALK,
                                      "Association of Computing Machinery (ACM)")
    assert_equal [["chemical-material-sciences/general"], :publisher_fallback],
                 Disciplines.tags_for(nil, CROSSWALK, "Royal Society of Chemistry")
  end

  def test_fallback_applies_when_subject_data_maps_to_nothing
    # Real subfields that the crosswalk does not cover must still reach the
    # fallback, and must be reported as a fallback rather than as OpenAlex data.
    assert_equal [["engineering-computer-science/general"], :publisher_fallback],
                 Disciplines.tags_for([["7777", 10]], CROSSWALK,
                                      "Association of Computing Machinery (ACM)")
  end

  def test_unmatched_row_from_another_publisher_is_unreachable
    assert_equal [[], :unreachable], Disciplines.tags_for(nil, CROSSWALK, "Wiley")
  end
end
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
rake test
```

Expected: FAIL — `cannot load such file -- disciplines` (LoadError) for every test class.

- [ ] **Step 3: Write the implementation**

Create `lib/disciplines.rb`:

```ruby
# Assigns subject topics to journals from OpenAlex subfield article counts.
#
# Pure functions only: counts and a crosswalk in, topic slugs out. No file or
# network access, so bin/build_data stays a thin caller and this logic is testable
# on its own (see test/test_disciplines.rb).
#
# The rule deliberately differs from the sibling Journal-Policy-Finder repo, which
# keeps every mapped subfield (~11.6 topics per journal). That tool searches 52,714
# journals and optimizes recall. This one filters 6,147 rows that are all
# actionable, so it needs precision: uncapped, "Aviation & Aerospace Engineering"
# matched 1,458 of the taggable rows here. Do not "fix" the two into agreement.
module Disciplines
  # A subfield must account for at least this share of a journal's articles to
  # become one of its topics.
  THRESHOLD = 0.10

  # When nothing clears THRESHOLD, keep at most this many of the largest subfields.
  NET_LIMIT = 3

  FALLBACKS = [
    # ACM conference proceedings have no OpenAlex source record at all — OpenAlex
    # does not model proceedings as journals — and ACM is a computing society, so
    # the area is not a guess.
    ["ACM", "engineering-computer-science/general"],
    # RSC rows are title-only with no eISSN to join on. Backfilling those eISSNs
    # would retire this entry.
    ["Royal Society of Chemistry", "chemical-material-sciences/general"],
  ].freeze

  # subfields: [[subfield_id, article_count], ...] in any order
  # crosswalk:  { subfield_id => topic_slug }
  def self.topics_for(subfields, crosswalk)
    ranked = (subfields || []).sort_by { |(_, count)| -count.to_i }
    total = ranked.sum { |(_, count)| count.to_i }
    return [] if total <= 0

    kept = ranked.select { |(_, count)| count.to_f / total >= THRESHOLD }
    topics = slugs_for(kept, crosswalk)
    return topics unless topics.empty?

    # Safety net: a journal spread evenly enough that nothing clears the threshold
    # would otherwise carry no topics and drop out of every discipline filter.
    slugs_for(ranked, crosswalk).first(NET_LIMIT)
  end

  def self.publisher_fallback(publisher)
    name = publisher.to_s
    FALLBACKS.each { |needle, slug| return [slug] if name.include?(needle) }
    []
  end

  # The full rule: real subject data when we have it, publisher-level area when we
  # do not. Rows that get neither are excluded while a discipline filter is active.
  #
  # Returns [slugs, source], where source is :openalex, :publisher_fallback, or
  # :unreachable. The caller reports those counts, and returning the branch here
  # keeps this the only place the rule is expressed.
  def self.tags_for(subfields, crosswalk, publisher)
    topics = topics_for(subfields, crosswalk)
    return [topics, :openalex] unless topics.empty?

    fallback = publisher_fallback(publisher)
    return [fallback, :publisher_fallback] unless fallback.empty?

    [[], :unreachable]
  end

  def self.slugs_for(subfields, crosswalk)
    out = []
    subfields.each do |(id, _)|
      slug = crosswalk[id.to_s]
      out << slug if slug && !out.include?(slug)
    end
    out
  end
  private_class_method :slugs_for
end
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
rake test
```

Expected: PASS. All test classes green, roughly 17 runs, 0 failures, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/disciplines.rb test/test_disciplines.rb
git commit -m "$(cat <<'EOF'
feat: add the discipline tagging rule

Keeps every OpenAlex subfield accounting for at least 10% of a journal's
articles, which averages 2.2 topics per journal against the sibling repo's 11.6.
Precision matters more here: every row in this dataset is actionable, so a filter
that returns a third of the table is not filtering.

Includes a safety net for journals spread so evenly that nothing clears 10% (The
Scientific World Journal and Comparative Clinical Pathology today) and
publisher-level fallbacks for ACM proceedings and Royal Society of Chemistry
titles, which OpenAlex cannot describe.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Vendor the taxonomy and crosswalk

Copies two small committed files out of the sibling repo so this repo stops depending on it.

**Files:**
- Create: `data/taxonomy.json` (~50 KB after stripping the sibling repo's `tag_counts` and `publisher_homepages`), `data/crosswalk.json` (~14 KB)
- Test: `test/test_reference_data.rb`

**Interfaces:**
- Consumes: nothing.
- Produces: `data/taxonomy.json` with keys `areas` (`{ area_id => { "label" => String, "subcategories" => { slug => String } } }`) and `tag_list` (`Array<String>` of `"area_id/slug"`); `data/crosswalk.json` as `{ subfield_id_string => "area_id/slug" }`.

- [ ] **Step 1: Copy the files**

```bash
JPF=../Journal-Policy-Finder
test -f "$JPF/html/data/taxonomy.json" || { echo "sibling repo not found at $JPF"; exit 1; }
cp "$JPF/html/data/taxonomy.json" data/taxonomy.json
cp "$JPF/scripts/crosswalk.json"  data/crosswalk.json
ls -la data/taxonomy.json data/crosswalk.json
```

If the sibling checkout is missing, get the two files from
<https://github.com/dieyunsong/Journal-Policy-Finder> at `html/data/taxonomy.json`
and `scripts/crosswalk.json` — both are committed there. This is the last step in
the project that needs the sibling repo at all.

- [ ] **Step 2: Strip the sibling repo's own concerns from the taxonomy**

The file arrives carrying two keys that belong to that project, not this one, and
both must go:

- `tag_counts` — row counts computed against its 52,714 journals. Ours must come from
  the TA rows or the number beside each topic in the picker means nothing.
- `publisher_homepages` — 4,844 publisher-ID-to-URL pairs serving a feature this site
  does not have. It is 196 KB of the source file's 250 KB and nothing here reads it.
  Leaving it would hand a maintainer a file that is three-quarters irrelevant.

```bash
ruby -rjson -e '
  t = JSON.parse(File.read("data/taxonomy.json"))
  dropped = ["tag_counts", "publisher_homepages"].select { |k| !t.delete(k).nil? }
  File.write("data/taxonomy.json", JSON.pretty_generate(t) + "\n")
  puts "areas=#{t["areas"].length} tag_list=#{t["tag_list"].length} " \
       "keys=#{t.keys.sort.inspect} dropped=#{dropped.sort.inspect}"
'
ls -la data/taxonomy.json
```

Expected: `areas=8 tag_list=172 keys=["areas", "tag_list"] dropped=["publisher_homepages", "tag_counts"]`,
and a file around 50 KB rather than 250 KB.

- [ ] **Step 3: Write the failing test**

Create `test/test_reference_data.rb`:

```ruby
require "test_helper"
require "json"

# Guards the two vendored reference files. They are copies, so the risk is not
# logic but a bad or partial copy: a crosswalk pointing at a topic the taxonomy
# does not define would silently produce tags the picker can never show.
class TestReferenceData < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  def taxonomy
    @taxonomy ||= JSON.parse(File.read(File.join(ROOT, "data", "taxonomy.json")))
  end

  def crosswalk
    @crosswalk ||= JSON.parse(File.read(File.join(ROOT, "data", "crosswalk.json")))
  end

  def test_taxonomy_has_eight_areas_and_172_topics
    assert_equal 8, taxonomy["areas"].length
    assert_equal 172, taxonomy["tag_list"].length
  end

  def test_taxonomy_carries_no_foreign_row_counts
    refute taxonomy.key?("tag_counts"),
           "tag_counts must be computed from this repo's rows by bin/build_data"
  end

  def test_taxonomy_carries_only_the_keys_this_repo_uses
    # Pinning the key set is what catches an over-inclusive copy. The first copy
    # of this file also brought 196 KB of publisher homepage data the sibling repo
    # uses for its own features, and a test that only refuted `tag_counts` let it
    # straight through.
    assert_equal Set["areas", "tag_list"], taxonomy.keys.to_set
  end

  def test_every_tag_list_entry_resolves_to_an_area_and_a_subcategory
    taxonomy["tag_list"].each do |slug|
      area_id, sub = slug.split("/", 2)
      area = taxonomy["areas"][area_id]
      refute_nil area, "tag_list entry #{slug} names unknown area #{area_id}"
      assert area["subcategories"].key?(sub),
             "tag_list entry #{slug} names unknown subcategory #{sub}"
    end
  end

  def test_every_crosswalk_target_exists_in_the_taxonomy
    known = taxonomy["tag_list"].to_set
    crosswalk.each do |subfield_id, slug|
      assert_includes known, slug,
                      "crosswalk maps subfield #{subfield_id} to unknown topic #{slug}"
    end
  end

  def test_crosswalk_keys_are_bare_numeric_subfield_ids
    crosswalk.each_key do |id|
      assert_match(/\A\d+\z/, id, "crosswalk key #{id.inspect} is not a bare subfield id")
    end
  end

  def test_crosswalk_is_not_trivially_small
    assert_operator crosswalk.length, :>=, 200
  end
end
```

Add `require "set"` to `test/test_helper.rb` (the test above uses `to_set`):

```ruby
require "minitest/autorun"
require "set"

$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))
```

- [ ] **Step 4: Run the tests**

```bash
rake test
```

Expected: PASS. If `test_every_crosswalk_target_exists_in_the_taxonomy` fails, the two files came from different versions of the sibling repo — recopy both from the same commit.

- [ ] **Step 5: Commit**

```bash
git add data/taxonomy.json data/crosswalk.json test/test_reference_data.rb test/test_helper.rb
git commit -m "$(cat <<'EOF'
feat: vendor the subject taxonomy and OpenAlex crosswalk

Copies of two small files committed in Journal-Policy-Finder: the Google
Scholar-derived taxonomy (8 areas, 172 topics) and the OpenAlex subfield to topic
crosswalk. Vendoring them is what lets this repo stand alone — after this it
shares no files with the sibling repo and neither can break the other.

The sibling repo's tag_counts are stripped: ours must count this dataset's rows,
not its 52,714 journals, so the number beside a topic in the picker means "TA
journals available here".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fetch OpenAlex subject data into a committed snapshot

The only script in the project that touches the network. Run manually, rarely.

**Files:**
- Create: `bin/fetch_openalex`
- Create (generated, committed): `data/openalex-subfields.json` (~769 KB)
- Test: `test/test_openalex_snapshot.rb`

**Interfaces:**
- Consumes: `data/northwestern-agreements.csv` (column `eISSN`).
- Produces: `data/openalex-subfields.json`:
  ```json
  { "fetched_from": "https://api.openalex.org/sources",
    "eissns_requested": 4617,
    "by_eissn": { "1520-5126": [["1605", 75007], ["1606", 32702]] } }
  ```
  Keys are the eISSNs **as they appear in the CSV**; each value is `[[subfield_id, article_count], ...]` sorted by count descending. Task 5 reads `by_eissn`.

- [ ] **Step 1: Write the script**

Create `bin/fetch_openalex`:

```ruby
#!/usr/bin/env ruby

# Fetches OpenAlex subject data for the journals in data/northwestern-agreements.csv
# and writes data/openalex-subfields.json, which is committed.
#
# This is the ONLY script here that uses the network, and it is deliberately not a
# rake task: bin/build_data must stay offline and deterministic (CI rebuilds
# html/data.json and asserts git diff is clean), so refreshing subject data is a
# separate, conscious act.
#
# Run it when the CSV gains journals, or to pick up OpenAlex's newer article counts:
#
#   ruby bin/fetch_openalex
#
# Roughly 93 requests at 50 eISSNs each, about two minutes. No API key is needed —
# OpenAlex asks only for a mailto so it can put you on its polite pool.
#
# Each OpenAlex source describes its output as `topics`, each topic belonging to a
# broader `subfield`. We aggregate topic article counts up to the subfield and keep
# that, because the crosswalk in data/crosswalk.json is keyed by subfield.

require "csv"
require "json"
require "net/http"
require "set"
require "uri"

CSV_FILE = File.join(__dir__, "..", "data", "northwestern-agreements.csv")
OUT_FILE = File.join(__dir__, "..", "data", "openalex-subfields.json")

API = "https://api.openalex.org/sources"
MAILTO = ENV.fetch("OPENALEX_MAILTO", "scholarlycommunication@northwestern.edu")
BATCH_SIZE = 50          # OpenAlex caps an OR filter at 50 values
PAUSE_SECONDS = 0.2      # be polite even though the pool allows more
ISSN_PATTERN = /\A\d{4}-\d{3}[\dX]\z/

def abort_with(message)
  warn "fetch_openalex: #{message}"
  exit 1
end

# Collect the well-formed eISSNs. ACM proceedings rows carry the placeholder
# "[conference proceedings]" and a few titles are blank; both are skipped here and
# picked up by the publisher fallback in lib/disciplines.rb.
eissns = CSV.read(CSV_FILE, headers: true, encoding: "UTF-8")
             .map { |row| row["eISSN"].to_s.strip }
             .select { |v| v.match?(ISSN_PATTERN) }
             .uniq
             .sort
abort_with("no well-formed eISSNs found in #{CSV_FILE}") if eissns.empty?
puts "fetch_openalex: #{eissns.length} distinct eISSNs to look up"

def get_json(url)
  3.times do |attempt|
    response = Net::HTTP.get_response(URI(url))
    return JSON.parse(response.body) if response.is_a?(Net::HTTPSuccess)

    warn "\n  HTTP #{response.code}, retrying (#{attempt + 1}/3)"
    sleep(2 * (attempt + 1))
  end
  abort_with("gave up on #{url}")
end

# Aggregate a source's topic counts up to their subfields, largest first.
def subfields_of(source)
  totals = Hash.new(0)
  (source["topics"] || []).each do |topic|
    subfield = topic.dig("subfield", "id")
    next unless subfield

    totals[subfield.split("/").last] += topic["count"].to_i
  end
  totals.sort_by { |_, count| -count }.map { |id, count| [id, count] }
end

by_eissn = {}
requested = Set.new(eissns)

eissns.each_slice(BATCH_SIZE).with_index do |batch, index|
  # %7C rather than a literal "|": pipes are not legal in a URI, and while Ruby's
  # default parser tolerates them, encoding is correct and version-proof.
  url = "#{API}?filter=issn:#{batch.join('%7C')}" \
        "&select=id,display_name,issn_l,issn,topics&per-page=#{BATCH_SIZE}" \
        "&mailto=#{MAILTO}"
  body = get_json(url)

  (body["results"] || []).each do |source|
    subfields = subfields_of(source)
    next if subfields.empty?

    # A source is reachable by several ISSNs (print, electronic, linking). Key the
    # result under whichever ones we actually asked for, so Task 5 can look a row
    # up by the eISSN printed in the CSV.
    ((source["issn"] || []) + [source["issn_l"]]).compact.uniq.each do |issn|
      by_eissn[issn] = subfields if requested.include?(issn)
    end
  end

  printf("\r  batch %d/%d, %d journals matched", index + 1,
         (eissns.length.to_f / BATCH_SIZE).ceil, by_eissn.length)
  sleep(PAUSE_SECONDS)
end
puts

output = {
  "fetched_from" => API,
  "eissns_requested" => eissns.length,
  "by_eissn" => by_eissn.sort.to_h, # sorted so the committed diff is readable
}
File.write(OUT_FILE, JSON.generate(output))

matched = by_eissn.length
puts "fetch_openalex: matched #{matched} of #{eissns.length} eISSNs " \
     "(#{(100.0 * matched / eissns.length).round(1)}%)"
puts "fetch_openalex: wrote #{File.expand_path(OUT_FILE)} " \
     "(#{(File.size(OUT_FILE) / 1024.0).round} KB)"
puts "fetch_openalex: now run `rake` to rebuild html/data.json"
```

Make it executable:

```bash
chmod +x bin/fetch_openalex
```

- [ ] **Step 2: Run it**

```bash
ruby bin/fetch_openalex
```

Expected, taking about two minutes:

```
fetch_openalex: 4617 distinct eISSNs to look up
  batch 93/93, 4572 journals matched
fetch_openalex: matched 4572 of 4617 eISSNs (99.0%)
fetch_openalex: wrote /…/data/openalex-subfields.json (769 KB)
```

The match count may drift by a few either way as OpenAlex adds records. If it comes
in far lower (say under 4,400), STOP and report — something is wrong with the query,
not the data.

- [ ] **Step 3: Write the snapshot test**

Create `test/test_openalex_snapshot.rb`:

```ruby
require "test_helper"
require "json"
require "csv"

# Guards the committed OpenAlex snapshot. It is generated by a network script, so
# the failure mode is a partial or malformed fetch getting committed — which would
# look like a successful build with a filter that quietly matches fewer journals.
class TestOpenAlexSnapshot < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  def snapshot
    @snapshot ||= JSON.parse(File.read(File.join(ROOT, "data", "openalex-subfields.json")))
  end

  def by_eissn
    snapshot["by_eissn"]
  end

  def test_matches_the_vast_majority_of_csv_eissns
    wanted = CSV.read(File.join(ROOT, "data", "northwestern-agreements.csv"),
                      headers: true, encoding: "UTF-8")
                .map { |r| r["eISSN"].to_s.strip }
                .select { |v| v.match?(/\A\d{4}-\d{3}[\dX]\z/) }
                .uniq
    matched = wanted.count { |issn| by_eissn.key?(issn) }
    assert_operator matched.to_f / wanted.length, :>=, 0.95,
                    "only #{matched} of #{wanted.length} eISSNs have subject data; " \
                    "re-run `ruby bin/fetch_openalex`"
  end

  def test_every_key_is_a_well_formed_eissn
    by_eissn.each_key do |issn|
      assert_match(/\A\d{4}-\d{3}[\dX]\z/, issn)
    end
  end

  def test_every_entry_is_subfield_id_and_positive_count_pairs
    by_eissn.first(200).each do |issn, subfields|
      refute_empty subfields, "#{issn} has an empty subfield list"
      subfields.each do |pair|
        assert_equal 2, pair.length, "#{issn} has a malformed pair #{pair.inspect}"
        assert_match(/\A\d+\z/, pair[0], "#{issn} has a non-numeric subfield id")
        assert_operator pair[1], :>, 0, "#{issn} has a non-positive article count"
      end
    end
  end

  def test_subfields_are_sorted_largest_first
    # The safety net in lib/disciplines.rb takes "the three largest", and while it
    # re-sorts defensively, a snapshot that is not already sorted means the fetch
    # script changed behaviour.
    by_eissn.first(200).each do |issn, subfields|
      counts = subfields.map { |(_, count)| count }
      assert_equal counts.sort.reverse, counts, "#{issn} is not sorted by count"
    end
  end

  def test_a_known_journal_resolves_to_its_expected_subject
    # JACS, whose largest subfield is Organic Chemistry (1605) by a wide margin.
    jacs = by_eissn["1520-5126"]
    refute_nil jacs, "JACS (1520-5126) missing from the snapshot"
    assert_equal "1605", jacs.first[0]
  end
end
```

- [ ] **Step 4: Run the tests**

```bash
rake test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/fetch_openalex data/openalex-subfields.json test/test_openalex_snapshot.rb
git commit -m "$(cat <<'EOF'
feat: fetch OpenAlex subject data into a committed snapshot

Queries OpenAlex for the CSV's 4,617 eISSNs in batches of 50 and aggregates each
source's topic article counts up to their subfields. About 93 requests, two
minutes, no API key.

An earlier draft joined against the sibling repo's 136 MB sources.jsonl, which is
gitignored there and existed on one laptop. Fetching by ISSN reaches the same
records and lives here instead.

The snapshot is committed rather than fetched at build time for two reasons: CI
rebuilds html/data.json and asserts git diff is clean, which rules out a network
call, and a maintainer can retune the 10% threshold offline.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Emit topics and taxonomy from the build

Extends the existing offline build. After this task the data layer is complete and the front end has something to read.

**Files:**
- Modify: `bin/build_data`
- Modify: `.github/workflows/build-data.yml`
- Regenerate: `html/data.json`
- Test: `test/test_built_data.rb`

**Interfaces:**
- Consumes: `Disciplines.tags_for` (Task 2), `data/taxonomy.json` + `data/crosswalk.json` (Task 3), `data/openalex-subfields.json` (Task 4).
- Produces: `html/data.json` with `header` of 9 names (9th `"Disciplines"`), rows of 9 elements (9th an `Array<Integer>` of tag ids), and a top-level `taxonomy` object `{ "areas" => …, "tag_list" => Array<String>, "tag_counts" => { id_string => Integer } }`. Tag ids index into `tag_list`. Task 6 reads `taxonomy`; Task 7 reads row index 8.

- [ ] **Step 1: Extend `bin/build_data`**

Add to the requires at the top of `bin/build_data` (after `require "digest"`):

```ruby
require_relative "../lib/disciplines"
```

Add these constants next to the existing `CSV_FILE` / `JSON_FILE` pair:

```ruby
TAXONOMY_FILE  = File.join(__dir__, "..", "data", "taxonomy.json")
CROSSWALK_FILE = File.join(__dir__, "..", "data", "crosswalk.json")
SUBFIELDS_FILE = File.join(__dir__, "..", "data", "openalex-subfields.json")

# Abort rather than ship a build where the discipline filter reaches less of the
# data than expected. Measured at 99.4%; the floor catches a broken join, which
# would otherwise look like a successful build with a filter that finds nothing.
MIN_REACHABLE_SHARE = 0.98
```

Append `"Disciplines"` to `OUT_HEADER`, so it reads:

```ruby
OUT_HEADER = [
  "Publisher",
  "Journal Title",
  "eISSN",
  "eISSN Link",
  "Discount or Waiver",
  "Campuses Covered",
  "Coverage Years",
  "Link to Agreement Info",
  # Data only — the front end filters on this and renders no column for it.
  "Disciplines",
]
```

Replace the line that builds each row:

```ruby
  data << [publisher, title, eissn, eissn_link, discount, campuses, years, link]
```

with a version that also collects the row's topic slugs (interning happens after
the loop, once every slug is known):

```ruby
  # Subject topics. The eISSN key is the raw CSV value, which is why this reads
  # `cells[2]` rather than the `eissn` local — that has already been rewritten to
  # the "conference proceedings" label for ACM proceedings rows.
  slugs, tag_source = Disciplines.tags_for(subfields_by_eissn[cells[2]], crosswalk,
                                           publisher)
  tag_stats[tag_source] += 1

  data << [publisher, title, eissn, eissn_link, discount, campuses, years, link, slugs]
```

Before the `rows.each_with_index` loop, load the reference data and set up the
counters:

```ruby
taxonomy  = JSON.parse(File.read(TAXONOMY_FILE))
crosswalk = JSON.parse(File.read(CROSSWALK_FILE))
subfields_by_eissn = JSON.parse(File.read(SUBFIELDS_FILE)).fetch("by_eissn")

known_topics = taxonomy.fetch("tag_list")
crosswalk.each do |subfield_id, slug|
  unless known_topics.include?(slug)
    abort_with("crosswalk maps subfield #{subfield_id} to #{slug.inspect}, " \
               "which is not in #{TAXONOMY_FILE}")
  end
end

# Counts per branch of the tagging rule, reported at the end so a coverage
# regression is visible in the build log and in CI.
tag_stats = Hash.new(0)
```

After the loop and the existing `abort_with("no data rows found …")` guard, intern
the slugs, count them, and check coverage:

```ruby
# Intern topic slugs to integer ids indexing into tag_list, so 6,147 rows carry
# small integers instead of repeating long strings.
tag_ids = {}
tag_counts = Hash.new(0)
data.each do |row|
  row[8] = row[8].map do |slug|
    id = (tag_ids[slug] ||= tag_ids.length)
    tag_counts[id] += 1
    id
  end
end

tag_ids.each_key do |slug|
  unless known_topics.include?(slug)
    abort_with("row tagged with #{slug.inspect}, which is not in #{TAXONOMY_FILE}")
  end
end

reachable = data.count { |row| !row[8].empty? }
share = reachable.to_f / data.length
if share < MIN_REACHABLE_SHARE
  abort_with(format("only %.1f%% of rows (%d of %d) can be reached by a discipline " \
                    "filter; floor is %.0f%%. Re-run `ruby bin/fetch_openalex`?",
                    share * 100, reachable, data.length, MIN_REACHABLE_SHARE * 100))
end

# tag_list must be ordered so that tag_list[id] is the slug for that id.
ordered_tag_list = tag_ids.keys
taxonomy_out = {
  "areas" => taxonomy.fetch("areas"),
  "tag_list" => ordered_tag_list,
  "tag_counts" => tag_counts.transform_keys(&:to_s),
}
```

Replace the `output` hash and the closing `puts` with:

```ruby
output = {
  "header"   => OUT_HEADER,
  "version"  => Digest::SHA256.hexdigest(JSON.generate([data, taxonomy_out]))[0, 12],
  "taxonomy" => taxonomy_out,
  "data"     => data,
}

File.write(JSON_FILE, JSON.generate(output))
puts "build_data: wrote #{data.length} rows to #{File.expand_path(JSON_FILE)}"
puts format("build_data: disciplines — %d from OpenAlex, %d from a publisher " \
            "fallback, %d unreachable (%.1f%% reachable, %d topics in use)",
            tag_stats[:openalex], tag_stats[:publisher_fallback],
            tag_stats[:unreachable], share * 100, ordered_tag_list.length)
```

Note on `tag_list`: it now holds only the topics this dataset actually uses (~164),
not all 172. Task 6's option builder drops topics with no rows anyway, and keeping
ids dense makes the interning trivial.

- [ ] **Step 2: Run the build and read the summary**

```bash
ruby bin/build_data
```

Expected, give or take a few rows as OpenAlex drifts:

```
build_data: wrote 6147 rows to /…/html/data.json
build_data: disciplines — 4576 from OpenAlex, 1532 from a publisher fallback, 39 unreachable (99.4% reachable, 164 topics in use)
```

If it aborts on the coverage floor, the snapshot from Task 4 is incomplete — re-run
the fetch. If it aborts on an unknown topic, Task 3's two files came from different
commits of the sibling repo.

- [ ] **Step 3: Write the failing test**

Create `test/test_built_data.rb`:

```ruby
require "test_helper"
require "json"

# End-to-end guard on the built artifact the site actually loads. The eISSN join is
# the part that can break silently: a broken join still produces a valid data.json,
# just one where the discipline filter finds nothing. These are the golden checks.
class TestBuiltData < Minitest::Test
  ROOT = File.expand_path("..", __dir__)

  def built
    @built ||= JSON.parse(File.read(File.join(ROOT, "html", "data.json")))
  end

  def rows
    built["data"]
  end

  def tag_list
    built["taxonomy"]["tag_list"]
  end

  # Topic slugs for the row whose Journal Title matches exactly.
  def topics_for_title(title)
    row = rows.find { |r| r[1] == title }
    refute_nil row, "no row titled #{title.inspect}"
    row[8].map { |id| tag_list[id] }
  end

  def test_header_and_rows_agree_on_nine_columns
    assert_equal 9, built["header"].length
    assert_equal "Disciplines", built["header"].last
    rows.each_with_index do |row, i|
      assert_equal 9, row.length, "row #{i} has #{row.length} elements"
    end
  end

  def test_existing_column_order_is_unchanged
    assert_equal ["Publisher", "Journal Title", "eISSN", "eISSN Link",
                  "Discount or Waiver", "Campuses Covered", "Coverage Years",
                  "Link to Agreement Info", "Disciplines"], built["header"]
  end

  def test_row_count
    assert_equal 6147, rows.length
  end

  def test_at_least_98_percent_of_rows_are_reachable_by_discipline
    reachable = rows.count { |r| !r[8].empty? }
    assert_operator reachable.to_f / rows.length, :>=, 0.98,
                    "only #{reachable} of #{rows.length} rows carry topics"
  end

  def test_every_tag_id_indexes_into_tag_list
    rows.each_with_index do |row, i|
      row[8].each do |id|
        assert_kind_of Integer, id, "row #{i} has a non-integer tag id"
        refute_nil tag_list[id], "row #{i} references unknown tag id #{id}"
      end
    end
  end

  def test_tag_counts_match_the_rows
    counted = Hash.new(0)
    rows.each { |r| r[8].each { |id| counted[id.to_s] += 1 } }
    assert_equal counted, built["taxonomy"]["tag_counts"]
  end

  def test_every_taxonomy_topic_in_use_has_a_nonzero_count
    built["taxonomy"]["tag_counts"].each do |id, count|
      assert_operator count, :>, 0, "topic id #{id} is listed with a count of #{count}"
    end
  end

  def test_all_eight_areas_are_represented
    areas = rows.flat_map { |r| r[8].map { |id| tag_list[id].split("/").first } }.uniq
    assert_equal 8, areas.length, "areas present: #{areas.sort.inspect}"
  end

  # --- Golden spot-checks: a broken join shows up here first -----------------

  def test_jacs_resolves_to_chemistry
    topics = topics_for_title("Journal of the American Chemical Society")
    assert_includes topics, "chemical-material-sciences/organic-chemistry"
    assert_includes topics, "chemical-material-sciences/general"
  end

  def test_journal_of_finance_resolves_to_finance
    topics = topics_for_title("The Journal of Finance")
    assert_includes topics, "business-economics-management/finance"
    assert_includes topics, "business-economics-management/economics"
  end

  def test_american_journal_of_political_science_resolves_to_political_science
    assert_includes topics_for_title("American Journal of Political Science"),
                    "social-sciences/political-science"
  end

  def test_psychological_medicine_resolves_to_psychiatry
    assert_includes topics_for_title("Psychological Medicine"),
                    "health-medical-sciences/psychiatry"
  end

  def test_acm_proceedings_fall_back_to_engineering_and_computer_science
    proceedings = rows.select { |r| r[2] == "conference proceedings" }
    assert_operator proceedings.length, :>=, 1400,
                    "expected ~1,470 ACM proceedings rows"
    proceedings.each do |row|
      assert_equal ["engineering-computer-science/general"],
                   row[8].map { |id| tag_list[id] },
                   "proceedings row #{row[1].inspect} was tagged unexpectedly"
    end
  end

  def test_acm_journals_with_real_subject_data_keep_it
    # ACM rows that DO have an eISSN must get their real topics, not the
    # publisher-level area — proof the fallback fires only as a last resort.
    acm_journals = rows.select do |r|
      r[0].include?("ACM") && r[2] != "conference proceedings" && !r[2].nil?
    end
    assert_operator acm_journals.length, :>=, 100,
                    "expected ~161 ACM journals and magazines with eISSNs"
    specific = acm_journals.count do |row|
      row[8].map { |id| tag_list[id] } != ["engineering-computer-science/general"]
    end
    assert_operator specific, :>=, 100,
                    "only #{specific} ACM journals got topics more specific than the " \
                    "publisher-level area; the eISSN join may be broken"
  end

  def test_royal_society_of_chemistry_rows_fall_back_to_chemistry
    rsc = rows.select { |r| r[0] == "Royal Society of Chemistry" }
    refute_empty rsc
    rsc.each do |row|
      assert_equal ["chemical-material-sciences/general"],
                   row[8].map { |id| tag_list[id] }
    end
  end

  def test_a_focused_journal_is_not_tagged_with_everything
    # The whole point of the 10% threshold: no row should carry a dozen topics the
    # way the sibling repo's uncapped rule produces.
    widest = rows.map { |r| r[8].length }.max
    assert_operator widest, :<=, 8, "some row carries #{widest} topics"
  end
end
```

- [ ] **Step 4: Run the tests**

```bash
rake test
```

Expected: PASS. If a golden spot-check fails on a missing title, confirm the exact
`Journal Title` string in the CSV — do not weaken the assertion to make it pass.

- [ ] **Step 5: Update the CI shape assertions**

In `.github/workflows/build-data.yml`, replace the `Validate data.json shape` step's
script with:

```yaml
      - name: Validate data.json shape
        run: |
          ruby -rjson -e '
            d = JSON.parse(File.read("html/data.json"))
            header = ["Publisher","Journal Title","eISSN","eISSN Link","Discount or Waiver","Campuses Covered","Coverage Years","Link to Agreement Info","Disciplines"]
            raise "header mismatch" unless d["header"] == header
            raise "no rows" if d["data"].empty?
            d["data"].each_with_index { |r,i| raise "row #{i} wrong length" unless r.length == 9 }
            raise "no taxonomy" unless d.dig("taxonomy","tag_list")&.any?
            tagged = d["data"].count { |r| !r[8].empty? }
            raise "discipline coverage too low: #{tagged}/#{d["data"].length}" if tagged < d["data"].length * 0.98
            puts "OK: #{d["data"].length} rows, #{tagged} with disciplines, #{d["taxonomy"]["tag_list"].length} topics"
          '
```

Add a test step immediately before the build step in the same workflow:

```yaml
      - name: Run the unit tests
        run: rake test
```

- [ ] **Step 6: Verify the whole default task**

```bash
rake && git diff --exit-code html/data.json && echo "build is reproducible"
```

Expected: tests pass, build prints its summary, then `build is reproducible`. That
last check is what CI enforces — if `data.json` differs after a rebuild, the build
is not deterministic.

- [ ] **Step 7: Commit**

```bash
git add bin/build_data html/data.json test/test_built_data.rb .github/workflows/build-data.yml
git commit -m "$(cat <<'EOF'
feat: emit discipline topics and taxonomy from the build

Each row gains a ninth element holding its topics as integer ids into a new
top-level tag_list; taxonomy counts are computed from these rows, so the number
beside a topic in the picker means "TA journals available here". Indices 0-7 are
untouched.

The build now aborts rather than shipping bad data: crosswalk targets and row tags
must exist in the taxonomy, and at least 98% of rows must be reachable by a
discipline filter (currently 99.4%). It prints which branch of the rule tagged how
many rows, so a regression is visible in the CI log.

Coverage: 4,576 rows from OpenAlex, 1,532 from a publisher fallback, 39
unreachable, 164 topics in use.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Port the discipline picker

Front-end control only, with no wiring yet — it renders and reports selections.

**Files:**
- Create: `html/js/discipline-picker.js`
- Modify: `html/css/styles.css` (append), `html/index.html:151`

**Interfaces:**
- Consumes: `html/data.json`'s `taxonomy` object (Task 5).
- Produces two globals on `window.NUDiscipline`:
  - `buildDisciplineOptions(taxonomy)` → `Array<{ areaId, areaLabel, topics: Array<{ id: Number, label: String, count: Number }> }>`, areas sorted by label, topics sorted by count descending then label, topics with no rows dropped.
  - `createDisciplinePicker(container, groups, { triggerId, onChange })` → `{ getSelected(): Array<Number>, clear(): void }`. `onChange` receives the selected tag-id array on every change.

- [ ] **Step 1: Write the picker**

Create `html/js/discipline-picker.js`:

```javascript
/**
 * discipline-picker.js
 *
 * Two-level discipline picker: closed it reads as a text box holding the chosen
 * topics as removable pills; opening shows the eight broad areas, and choosing one
 * drills into its topics with a count of covered journals beside each.
 *
 * Ported from the companion Journal-Policy-Finder repo. Two deliberate changes:
 * that version is an ES module and caps selections at 3, while this one is a
 * classic script (script.js relies on jQuery and $(document).ready, and making it
 * a module would change load timing around DataTables for no benefit) and allows
 * unlimited selections, because an interdisciplinary author filtering a table
 * should not be blocked at four topics.
 *
 * Owns its own keyboard and screen-reader behaviour because a custom panel gets
 * none for free: Escape closes and returns focus, arrows move between rows, and
 * the trigger reports aria-expanded.
 *
 * Exposes window.NUDiscipline.{buildDisciplineOptions, createDisciplinePicker}.
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * Shape the taxonomy into the two-level structure the picker shows: broad areas
   * first, each holding the topics that actually have journals.
   *
   * @param {Object} taxonomy - data.json's taxonomy: { areas, tag_list, tag_counts }
   * @returns {Array} groups
   */
  function buildDisciplineOptions(taxonomy) {
    var areas = (taxonomy && taxonomy.areas) || {};
    var tagList = (taxonomy && taxonomy.tag_list) || [];
    var counts = (taxonomy && taxonomy.tag_counts) || {};

    var idOf = {};
    tagList.forEach(function (slug, i) { idOf[slug] = i; });

    var groups = [];
    Object.keys(areas).forEach(function (areaId) {
      var area = areas[areaId];
      var subcategories = area.subcategories || {};
      var topics = [];

      Object.keys(subcategories).forEach(function (subSlug) {
        var id = idOf[areaId + "/" + subSlug];
        if (id === undefined) return;
        var count = counts[String(id)] || 0;
        // Drop topics no journal carries: offering one means clicking a topic that
        // returns nothing.
        if (count <= 0) return;
        topics.push({ id: id, label: subcategories[subSlug], count: count });
      });

      if (!topics.length) return;
      topics.sort(function (a, b) {
        return b.count - a.count || a.label.localeCompare(b.label);
      });
      groups.push({ areaId: areaId, areaLabel: area.label, topics: topics });
    });

    groups.sort(function (a, b) { return a.areaLabel.localeCompare(b.areaLabel); });
    return groups;
  }

  /**
   * @param {HTMLElement} container
   * @param {Array} groups - from buildDisciplineOptions
   * @param {Object} options - { triggerId, onChange }
   */
  function createDisciplinePicker(container, groups, options) {
    var opts = options || {};
    var onChange = opts.onChange;
    var labels = {};
    groups.forEach(function (g) {
      g.topics.forEach(function (t) { labels[t.id] = t.label; });
    });

    var selected = [];
    var area = null; // null = showing the area list

    container.innerHTML =
      '<div class="picker-control">' +
      '<span class="picker-pills"></span>' +
      '<button type="button" class="picker-open"' +
      (opts.triggerId ? ' id="' + escapeHtml(opts.triggerId) + '"' : "") +
      ' aria-expanded="false" aria-haspopup="listbox">' +
      '<span class="picker-open-text">Select disciplines and topics</span>' +
      '<span class="picker-caret" aria-hidden="true">▾</span>' +
      "</button></div>" +
      '<div class="picker-panel" hidden></div>';

    var control = container.querySelector(".picker-control");
    var pillsEl = container.querySelector(".picker-pills");
    var openBtn = container.querySelector(".picker-open");
    var openText = container.querySelector(".picker-open-text");
    var panel = container.querySelector(".picker-panel");

    function isOpen() { return !panel.hidden; }

    function renderPills() {
      pillsEl.innerHTML = selected.map(function (id) {
        var label = escapeHtml(labels[id] || "");
        return '<span class="pill">' + label +
          '<button type="button" class="pill-x" data-id="' + id +
          '" aria-label="Remove ' + label + '">×</button></span>';
      }).join("");
      openText.textContent = selected.length ? "Add another"
                                            : "Select disciplines and topics";
      control.classList.toggle("has-pills", selected.length > 0);
    }

    function renderPanel() {
      if (!area) {
        panel.innerHTML = '<ul class="picker-list" role="list">' +
          groups.map(function (g) {
            return '<li><button type="button" class="picker-area" data-area="' +
              escapeHtml(g.areaId) + '"><span>' + escapeHtml(g.areaLabel) +
              '</span><span class="picker-meta">' + g.topics.length +
              " topics ›</span></button></li>";
          }).join("") + "</ul>";
        return;
      }

      var g = groups.filter(function (x) { return x.areaId === area; })[0];
      panel.innerHTML =
        '<div class="picker-crumb">' +
        '<button type="button" class="picker-back">‹ All areas</button>' +
        '<span class="picker-crumb-area">' + escapeHtml(g.areaLabel) + "</span></div>" +
        '<ul class="picker-list" role="list">' +
        g.topics.map(function (t) {
          var on = selected.indexOf(t.id) !== -1;
          return '<li><label class="picker-topic">' +
            '<input type="checkbox" value="' + t.id + '"' + (on ? " checked" : "") +
            '><span>' + escapeHtml(t.label) + '</span>' +
            '<span class="picker-meta">' + t.count.toLocaleString() +
            "</span></label></li>";
        }).join("") + "</ul>";
    }

    function open() {
      panel.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
      renderPanel();
      var first = panel.querySelector("button, input:not([disabled])");
      if (first) first.focus();
    }

    function close(focusTrigger) {
      panel.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
      area = null;
      if (focusTrigger) openBtn.focus();
    }

    function toggle(id, on) {
      var at = selected.indexOf(id);
      if (on && at === -1) {
        selected.push(id);
      } else if (!on && at !== -1) {
        selected.splice(at, 1);
      }
      renderPills();
      renderPanel();
      if (onChange) onChange(selected.slice());
    }

    openBtn.addEventListener("click", function () {
      if (isOpen()) { close(false); } else { open(); }
    });

    pillsEl.addEventListener("click", function (e) {
      var x = e.target.closest(".pill-x");
      if (x) toggle(Number(x.dataset.id), false);
    });

    panel.addEventListener("click", function (e) {
      var areaBtn = e.target.closest(".picker-area");
      if (areaBtn) {
        area = areaBtn.dataset.area;
        renderPanel();
        var back = panel.querySelector(".picker-back");
        if (back) back.focus();
        return;
      }
      if (e.target.closest(".picker-back")) {
        area = null;
        renderPanel();
        var firstArea = panel.querySelector(".picker-area");
        if (firstArea) firstArea.focus();
      }
    });

    panel.addEventListener("change", function (e) {
      var box = e.target.closest("input[type=checkbox]");
      if (box) toggle(Number(box.value), box.checked);
    });

    // Escape closes from anywhere inside; arrows walk the rows.
    container.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        e.stopPropagation();
        close(true);
        return;
      }
      if (!isOpen() || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;

      var items = Array.prototype.slice.call(
        panel.querySelectorAll("button, input:not([disabled])"));
      if (!items.length) return;
      e.preventDefault();
      var at = items.indexOf(document.activeElement);
      var next = e.key === "ArrowDown" ? at + 1 : at - 1;
      items[(next + items.length) % items.length].focus();
    });

    document.addEventListener("mousedown", function (e) {
      if (isOpen() && !container.contains(e.target)) close(false);
    });

    renderPills();

    return {
      getSelected: function () { return selected.slice(); },
      clear: function () {
        selected.length = 0;
        renderPills();
        if (isOpen()) renderPanel();
      },
    };
  }

  global.NUDiscipline = {
    buildDisciplineOptions: buildDisciplineOptions,
    createDisciplinePicker: createDisciplinePicker,
  };
}(window));
```

- [ ] **Step 2: Append the picker styles**

Append to `html/css/styles.css`:

```css
/* ---- Discipline picker ----------------------------------------------------
   Ported with the picker from the companion Journal-Policy-Finder repo. That
   stylesheet uses semantic custom properties; rather than rewrite every rule
   (which would make the two hard to re-sync), the five it needs are aliased here
   onto this site's Northwestern palette. The sibling's dark-mode rule is omitted
   deliberately: this site is light-only, and a dark panel on a light page reads
   as a bug. */
:root {
  --accent: var(--color-teal-400);
  --muted: var(--color-neutral-300);
  --rule: var(--color-neutral-100);
  --surface: #fff;
  --surface-2: var(--color-teal-100);
}

.picker { position: relative; }

.picker-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.9rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: var(--surface);
}
.picker-control:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(78, 42, 132, 0.14);
}

.picker-open {
  flex: 1 1 8rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: 0;
  padding: 0.3rem 0.2rem;
  font: inherit;
  color: var(--muted);
  cursor: pointer;
  text-align: left;
}
.picker-control.has-pills .picker-open { flex-basis: 6rem; }
.picker-caret { opacity: 0.6; }

/* Pills sit directly in the control's flex flow rather than in a nested box. */
.picker-pills { display: contents; }

.picker-open-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.3rem 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.4;
}
.pill-x {
  border: 0;
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  line-height: 1;
  cursor: pointer;
  font-size: 0.9rem;
  display: grid;
  place-items: center;
}
.pill-x:hover { background: rgba(255, 255, 255, 0.4); }

.picker-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 19rem;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
}

.picker-list { list-style: none; margin: 0; padding: 0.25rem; }

.picker-area,
.picker-topic {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 6px;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.picker-area { justify-content: space-between; }
.picker-area:hover,
.picker-topic:hover,
.picker-area:focus-visible,
.picker-topic:focus-within { background: var(--surface-2); }

.picker-topic span:first-of-type { flex: 1 1 auto; }

.picker-meta {
  font-size: 0.82rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.picker-crumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--rule);
  position: sticky;
  top: 0;
  background: var(--surface);
}
.picker-back {
  border: 0;
  background: none;
  padding: 0.15rem 0.3rem;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  border-radius: 4px;
}
.picker-back:hover { text-decoration: underline; }
.picker-crumb-area { font-weight: 600; font-size: 0.9rem; }
```

- [ ] **Step 3: Load the picker before `script.js`**

In `html/index.html`, insert before the existing `<script src="js/script.js"></script>` on line 151:

```html
  <script src="js/discipline-picker.js"></script>
```

- [ ] **Step 4: Verify the picker renders in isolation**

Start a static server and check the module loaded and can shape the real taxonomy:

```bash
ruby -run -e httpd html -p 8000 &
sleep 2
curl -s http://localhost:8000/js/discipline-picker.js | head -3
curl -s http://localhost:8000/data.json | ruby -rjson -e '
  t = JSON.parse($stdin.read)["taxonomy"]
  puts "areas=#{t["areas"].length} tag_list=#{t["tag_list"].length} counts=#{t["tag_counts"].length}"
'
```

Expected: the file's opening comment, then `areas=8 tag_list=164 counts=164`.

Then open <http://localhost:8000/> in a browser, and in the console:

```javascript
const t = await (await fetch('data.json')).json();
const groups = NUDiscipline.buildDisciplineOptions(t.taxonomy);
console.log(groups.length, groups.map(g => `${g.areaLabel}: ${g.topics.length}`));
```

Expected: `8` groups, each with a topic count, areas in alphabetical order starting
with "Business, Economics & Management". Leave the server running for Task 7; stop
it later with `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add html/js/discipline-picker.js html/css/styles.css html/index.html
git commit -m "$(cat <<'EOF'
feat: port the two-level discipline picker

Closed it reads as a text box of removable pills; opening shows the eight broad
areas and drills into each area's topics with a count of covered journals. A flat
164-topic checkbox list would be unusable, which is why the sibling repo built
this in the first place.

Ported from Journal-Policy-Finder with two changes: it is a classic script rather
than an ES module, since script.js relies on jQuery and $(document).ready, and it
allows unlimited selections rather than capping at three — that cap existed
because a flat grid pushed results off screen, which is not a constraint here.

Not wired to the table yet.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire the picker into the table

Makes the filter live, and updates the surrounding copy.

**Files:**
- Modify: `html/js/script.js`, `html/index.html`

**Interfaces:**
- Consumes: `window.NUDiscipline` (Task 6), row index 8 and `json.taxonomy` (Task 5).
- Produces: a working filter. No new exports.

- [ ] **Step 1: Update the data-shape comment**

In `html/js/script.js`, extend the header comment's row-index list (after the `[7]` line):

```
 *       [8] Disciplines (array of integer topic ids indexing json.taxonomy.tag_list)
```

- [ ] **Step 2: Add the filter state**

After the existing `var allPublishersCount = 0;` declaration, add:

```javascript
    // Discipline filter state.  selectedTopics holds integer topic ids from the
    // picker; disciplinePicker is the picker handle, created once data has loaded.
    // Note the asymmetry with publishers: an empty publisher selection hides every
    // row (all boxes start checked, so empty means the user unchecked them all),
    // but an empty discipline selection is the DEFAULT and must show everything.
    var selectedTopics = [];
    var disciplinePicker = null;
```

- [ ] **Step 3: Extend the custom search callback**

In the `$.fn.dataTable.ext.search.push(...)` callback, replace the final `return true;` with:

```javascript
        // Discipline filter: no selection means no discipline filtering.  With a
        // selection, a row matches if it carries ANY selected topic (OR within
        // disciplines, AND against the publisher filter above).  Rows with no
        // topics at all — 39 titles OpenAlex does not describe — drop out here.
        if (selectedTopics.length > 0) {
            var topics = rawData[dataIndex] ? rawData[dataIndex][8] : null;
            if (!topics || topics.length === 0) {
                return false;
            }
            var matches = topics.some(function (id) {
                return selectedTopics.indexOf(id) !== -1;
            });
            if (!matches) {
                return false;
            }
        }
        return true;
```

- [ ] **Step 4: Create the picker once data has loaded**

In the `ajax.dataSrc` callback, immediately before `return json.data;`, add:

```javascript
                // Build the discipline picker from the taxonomy in data.json.  It
                // has to happen here rather than at page load because the topic
                // counts beside each option come from the data.
                buildDisciplinePicker(json.taxonomy);
```

- [ ] **Step 5: Add the builder and clearing helper**

After the `populatePublisherFilters` function, add:

```javascript
    /**
     * buildDisciplinePicker
     * Creates the two-level discipline picker inside #disciplinePicker and wires its
     * selection changes to a table redraw.
     *
     * @param {Object} taxonomy - json.taxonomy: { areas, tag_list, tag_counts }
     */
    function buildDisciplinePicker(taxonomy) {
        var container = document.getElementById('disciplinePicker');
        if (!container || !window.NUDiscipline || !taxonomy) {
            return;
        }
        var groups = window.NUDiscipline.buildDisciplineOptions(taxonomy);
        disciplinePicker = window.NUDiscipline.createDisciplinePicker(container, groups, {
            triggerId: 'disciplineDropdown',
            onChange: function (topics) {
                selectedTopics = topics;
                renderFilterSummary();
                table.draw();
            }
        });
    }

    /**
     * clearDisciplineFilter
     * Empties the discipline picker and its filter state.  Called from both
     * "Clear all filters" paths.
     */
    function clearDisciplineFilter() {
        selectedTopics = [];
        if (disciplinePicker) {
            disciplinePicker.clear();
        }
    }
```

- [ ] **Step 6: Include disciplines in the filter summary**

Replace the whole of `renderFilterSummary` with:

```javascript
    function renderFilterSummary() {
        var pubCount = selectedPublishers.length;
        var topicCount = selectedTopics.length;
        var show = (pubCount !== allPublishersCount || topicCount > 0);
        if (show) {
            var parts = [];
            if (pubCount !== allPublishersCount) {
                parts.push(pubCount + ' publisher' + (pubCount !== 1 ? 's' : ''));
            }
            if (topicCount > 0) {
                parts.push(topicCount + ' discipline' + (topicCount !== 1 ? 's' : ''));
            }
            $('#filterSummaryText').text('Filtering by ' + parts.join(' and '));
            $('#filterSummaryContainer').css('visibility', 'visible');
        } else {
            $('#filterSummaryText').text('');
            $('#filterSummaryContainer').css('visibility', 'hidden');
        }
    }
```

- [ ] **Step 7: Clear disciplines from both "Clear all filters" paths**

In the `#clearAllFiltersBtn` handler, add `clearDisciplineFilter();` before `filterTable();`:

```javascript
    $(document).on('click', '#clearAllFiltersBtn', function () {
        $('.publisher-checkbox').prop('checked', true);
        clearDisciplineFilter();
        filterTable();
    });
```

And in the `#clearAllFiltersFromEmpty` handler, likewise:

```javascript
    $(document).on('click', '#clearAllFiltersFromEmpty', function (e) {
        e.preventDefault();
        $('.publisher-checkbox').prop('checked', true);
        clearDisciplineFilter();
        table.search('').draw();
        filterTable();
    });
```

- [ ] **Step 8: Add the picker's field to the filter row**

In `CreateFilterContainer`, add a second field after the publisher `<div class="d-flex flex-column">…</div>` block, inside the same flex row:

```javascript
            <div class="d-flex flex-column" style="min-width: 22rem; flex: 1 1 22rem;">
                <label for="disciplineDropdown">Filter by Discipline:</label>
                <div id="disciplinePicker" class="picker"></div>
            </div>
```

- [ ] **Step 9: Mention the discipline filter in the empty state**

In `CreateNoResultsMessage`, replace the "Too Many Filters" list item with:

```html
                <li style="color: var(--color-neutral-300); margin-bottom: 1rem;">
                    <strong>Too Many Filters:</strong> You may have selected a publisher or discipline filter that excludes the journal you're searching for.
                    A few titles carry no discipline classification at all and appear only when no discipline is selected.
                    Try removing all active filters and searching again.
                </li>
```

- [ ] **Step 10: Document the disciplines in "About the data"**

In `html/index.html`, add this `<li>` to the "About the data" list, after the `Publisher` item and before `Discount or Waiver`:

```html
        <li class="mb-2"><strong id="disciplineInfo">Disciplines</strong> &mdash; used by the
          <em>Filter by Discipline</em> control above the table; there is no discipline column in the results.
          Subjects are <strong>derived from publication data, not assigned by publishers</strong>: each journal is
          described by the subject areas its articles fall into according to
          <a href="https://openalex.org/">OpenAlex</a>, and a subject is kept when it accounts for at least 10% of
          that journal's articles. ACM conference-proceedings series and Royal Society of Chemistry titles are
          classified at the publisher level, because OpenAlex does not describe them individually. A few dozen titles
          have no classification and appear only when no discipline is selected. Treat the subjects as a way to
          browse, not as an authoritative statement of a journal's scope.</li>
```

- [ ] **Step 11: Verify in the browser**

With the static server from Task 6 running (`ruby -run -e httpd html -p 8000 &` if not), open <http://localhost:8000/> and check:

```
[ ] The table loads 6,147 rows and "Filter by Discipline" appears beside "Filter by Publisher".
[ ] The picker opens to 8 areas, each showing a topic count.
[ ] Clicking "Chemical & Material Sciences" drills in; "‹ All areas" goes back.
[ ] Selecting "Organic Chemistry" (~95) filters the table to about that many rows.
[ ] The summary banner reads "Filtering by 1 discipline".
[ ] Adding "Finance" widens the result (OR), not narrows it.
[ ] A 4th and 5th selection are accepted — no cap.
[ ] Removing a pill with its × updates the table.
[ ] Selecting a discipline AND unchecking publishers narrows further (AND).
[ ] "Clear all filters" empties the pills and restores 6,147 rows.
[ ] Keyboard: Tab to the trigger, Enter opens, ArrowDown/ArrowUp walk rows, Escape closes and returns focus to the trigger.
[ ] Clicking outside the panel closes it.
[ ] No errors in the browser console.
```

Confirm the row counts numerically in the console:

```javascript
const dt = $('#apcTable').DataTable();
console.log('visible now:', dt.rows({ search: 'applied' }).count());
```

Expected: 6,147 with nothing selected; roughly 95 with only Organic Chemistry
selected. If a count is wildly off, do not adjust the test — find out why.

- [ ] **Step 12: Confirm the build is still clean, then commit**

```bash
rake && git diff --exit-code html/data.json && echo "still reproducible"
git add html/js/script.js html/index.html
git commit -m "$(cat <<'EOF'
feat: filter the table by discipline

Wires the picker into the existing DataTables custom search callback. Selected
topics are OR'd against each other and AND'd with the publisher filter.

An empty selection shows everything, which is the opposite of the publisher
filter, where empty hides everything — that asymmetry is deliberate: all
publisher boxes start checked, so empty means the user unchecked them, while an
empty picker is just the default state.

Also documents in "About the data" that subjects are derived from OpenAlex
publication data rather than assigned by publishers, since a researcher deciding
where to submit should know how much weight the classification carries.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Document the pipeline and open the PR

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a PR ready for review.

- [ ] **Step 1: Document the subject data in the README**

In `README.md`, after the "How it works" section, add:

```markdown
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
join on. About 99% of rows end up reachable by a discipline filter; the rest appear
only when no discipline is selected.

The vocabulary is a Google Scholar-derived taxonomy of 8 broad areas and 172 topics,
in `data/taxonomy.json`. `data/crosswalk.json` maps OpenAlex subject ids onto it.
Both are vendored copies of files from the companion Journal-Policy-Finder repo.

### Files

| File | Committed? | What it is |
|---|---|---|
| `data/openalex-subfields.json` | yes | Snapshot of OpenAlex subject counts per eISSN (~770 KB) |
| `data/taxonomy.json` | yes | The 8 areas and 172 topics |
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
```

- [ ] **Step 2: Correct the stale statements in the README**

Two claims are now out of date. Replace the "Out of scope (not yet configured)" bullet about `bin/update`:

```markdown
- An automated refresh from a Northwestern-maintained spreadsheet. The legacy
  `bin/update` Google-Sheets importer was removed (see git history) — it required
  credentials that were never configured, and `bin/build_data` replaced it.
```

And in the `html/data.json` description under "How it works", change the row shape
from 8 to 9 elements:

```markdown
- The site reads `html/data.json`, an object of the form
  `{ "header": [...], "version": "...", "taxonomy": {...}, "data": [[...]] }`
  where each row is a positional array of 9 elements — the 8 columns below
  (`eISSN` / `eISSN Link` may be `null`) plus an array of discipline topic ids:

  `Publisher | Journal Title | eISSN | eISSN Link | Discount or Waiver | Campuses Covered | Coverage Years | Link to Agreement Info | Disciplines`
```

- [ ] **Step 3: Full verification before the PR**

```bash
rake
git diff --exit-code html/data.json && echo "data.json reproducible"
git status --short
```

Expected: all tests pass, the build prints its coverage summary, `data.json`
reproducible, and `git status` shows only the two ignored spreadsheets (which should
now not appear at all, since `.gitignore` covers them) — nothing else uncommitted.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: document the subject-data pipeline

Explains where the topics come from, that they are derived from publication data
rather than publisher-assigned, how to refresh them, and why this site's tagging
rule deliberately differs from the companion site's — so the divergence is not
later "fixed" into consistency.

Also corrects two now-stale claims: bin/update is gone, and data.json rows carry
9 elements.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin subject-filter
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --base main --head subject-filter \
  --title "Add a subject/discipline filter" \
  --body "$(cat <<'EOF'
Lets researchers narrow the 6,147 agreement rows to journals in their own
discipline — the question authors actually arrive with, which title search and the
publisher filter cannot answer.

## How journals get their subjects

From OpenAlex publication data, keeping each subject that accounts for at least
10% of a journal's articles (about 2.2 topics per journal). Spot-checked: JACS →
Organic Chemistry, Chemical & Material Sciences, Molecular Biology; The Journal of
Finance → Finance, Accounting & Taxation, Economics.

This deliberately diverges from the companion Journal-Policy-Finder, which keeps
every subject a journal touches (~12 per journal). That tool searches 52,714
journals and needs recall; this one filters 6,147 actionable rows and needs
precision — uncapped, "Aviation & Aerospace Engineering" matched 1,458 of the
taggable rows. The README and `lib/disciplines.rb` both record why, so the two
sites are not later "fixed" into agreement.

Coverage: 99.4% of rows reachable by a discipline filter. ACM proceedings and RSC
titles are classified at the publisher level since OpenAlex has no per-title record
for them; 39 titles remain unclassified and appear only when no discipline is
selected.

## Self-sufficiency

The subject data is fetched by `bin/fetch_openalex` straight from the OpenAlex API
(93 requests, ~2 min, no API key) into a committed snapshot. `bin/build_data` stays
offline and deterministic, so CI can still rebuild `data.json` and assert it is
unchanged. Nothing depends on a sibling checkout or any one machine.

## Also in here

Repo hygiene for handover: removed `bin/update`, the inherited Google-Sheets
importer that still broke `docker compose run data` and was the only reason the
Gemfile carried `google_drive` and `json-schema` (the Gemfile is now empty — a
clone needs no `bundle install`). Aligned Ruby versions across CI, Docker, and
local. Added a Minitest suite and a `Rakefile`.

## Verifying

```sh
rake                       # tests, then rebuild html/data.json
ruby -run -e httpd html -p 8000
```

Design: `docs/superpowers/specs/2026-08-04-subject-discipline-filter-design.md`
Plan: `docs/superpowers/plans/2026-08-04-subject-discipline-filter.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

**Spec coverage.** Taxonomy → Task 3. 10% rule, safety net, publisher fallbacks → Task 2. Pipeline and `fetch_openalex` → Task 4. `data.json` schema, `tag_counts` from TA rows, CI shape assertions, build-time coverage floor → Task 5. Picker port, CSS, unlimited selections → Task 6. Filter semantics, empty-selection asymmetry, summary banner, both clear paths, empty-state copy, "About the data" entry → Task 7. Setup fixes 1–4 and 6 → Tasks 1 and 8. Setup fix 5 (spreadsheets) → Task 1, Step 7. Validation items 1–5 → Tasks 2, 3, 4, 5 tests plus Task 7's browser checklist.

**Deviations from the spec, resolved here.** The spec named a `test/test_discipline_tags.rb`; the file is `test/test_disciplines.rb`, matching `lib/disciplines.rb`. The spec left the CSS variable question open; Task 6 aliases the five semantic names onto the existing palette and omits the sibling's dark-mode rule, since this site is light-only. The spec described `tag_list` as all 172 topics; Task 5 emits only the ~164 in use so tag ids stay dense, and Task 6's builder drops zero-count topics regardless.

**Known approximations.** Row counts in expected output (4,576 / 1,532 / 39 / 164) will drift slightly as OpenAlex updates. Assertions are written as ranges or floors for counts and exact only for topic identity.

**Verified against real data while writing this plan**, so the numbers in assertions are not guesses: 161 ACM rows carry a real eISSN and 155 of them resolve to topics more specific than the publisher-level area (Task 5's precedence test asserts ≥100 for both); the widest row carries 6 topics (asserted ≤8); all 8 areas are represented; every topic slug and journal title named in a golden test exists; `URI()` tolerates literal `|` but the fetch encodes it as `%7C` anyway; and aggregating a live OpenAlex response reproduces the JACS topics exactly.

**One design change made during planning.** `Disciplines.tags_for` returns `[slugs, source]` rather than just `slugs`. The first draft had `bin/build_data` re-deriving which branch had fired in order to report coverage, which would have mis-labelled a row whose subfields exist but map to nothing. Returning the branch keeps the rule expressed in exactly one place.
