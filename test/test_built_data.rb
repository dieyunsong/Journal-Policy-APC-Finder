require "test_helper"
require "csv"
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

  # Derived from the CSV, not pinned to a literal, for two reasons. It is the stronger
  # invariant — bin/build_data emits exactly one row per CSV row, so this asserts the
  # artifact matches its source rather than matching a number someone wrote down. And a
  # pinned count broke the documented maintenance loop: adding a CSV row and running
  # `rake` passed locally against the stale committed data.json, then failed in CI on a
  # figure the README never mentioned.
  def test_one_output_row_per_csv_row
    expected = CSV.read(File.join(ROOT, "data", "northwestern-agreements.csv"),
                        headers: true, encoding: "UTF-8").length
    assert_equal expected, rows.length,
                 "html/data.json has #{rows.length} rows but the CSV has #{expected}; " \
                 "run `rake build`"
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
