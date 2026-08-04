# Shared setup for the Minitest suite. Minitest ships with Ruby, so there is no
# gem to install; `rake test` loads this first to put lib/ on the load path.

require "minitest/autorun"

$LOAD_PATH.unshift(File.expand_path("../lib", __dir__))
