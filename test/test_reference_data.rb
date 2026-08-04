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
