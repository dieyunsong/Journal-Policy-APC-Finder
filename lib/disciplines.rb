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
    # Subfield id breaks ties: Ruby's sort_by is not stable, so without a secondary
    # key two subfields with equal counts can order either way between interpreter
    # versions — and html/data.json is committed and byte-checked by CI, which builds
    # on a different Ruby than a maintainer's laptop.
    ranked = (subfields || []).sort_by { |(id, count)| [-count.to_i, id.to_s] }
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
