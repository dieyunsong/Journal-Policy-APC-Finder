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

  def test_tied_counts_are_ordered_by_subfield_id
    # Ruby's sort_by is not stable, so ties must be broken explicitly or the committed
    # html/data.json is not byte-reproducible across Ruby versions.
    tied = [["1606", 500], ["1312", 500], ["1605", 500]]
    assert_equal [
      "life-sciences-earth-sciences/molecular-biology", # 1312
      "chemical-material-sciences/organic-chemistry",   # 1605
      "chemical-material-sciences/general",             # 1606
    ], Disciplines.topics_for(tied, CROSSWALK)
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
