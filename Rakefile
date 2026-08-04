# Single entry point for maintainers:
#
#   rake          rebuild html/data.json from committed inputs, then test it
#   rake test     unit tests only
#   rake build    rebuild html/data.json only (offline, deterministic)
#
# Build before test, deliberately: the golden checks in test/test_built_data.rb read
# html/data.json, so testing first would validate whatever is committed rather than what
# the maintainer just built. Editing the CSV and running `rake` used to pass locally
# against the stale artifact and only fail in CI.
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

task default: %i[build test]
