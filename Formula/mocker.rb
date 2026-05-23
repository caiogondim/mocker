# Documentation
# - https://docs.brew.sh/Formula-Cookbook
# - https://rubydoc.brew.sh/Formula

require "language/node"

class Mocker < Formula
  desc "Reverse proxy with record/playback capabilities"
  homepage "https://github.com/caiogondim/mocker"
  url "https://github.com/caiogondim/mocker/archive/refs/tags/v1.2.0.tar.gz"
  version "1.2.0"
  sha256 "309dc650f3a84e762ad9f745586f99cc9143a9db067747813377a4445d45eb1e"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "mocker", shell_output("#{bin}/mocker --help")
  end
end
