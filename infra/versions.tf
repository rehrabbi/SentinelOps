terraform {
  # Written and tested with 1.17. A 2.0 release could change the language, so
  # moving to it is a deliberate upgrade rather than something that just happens.
  required_version = ">= 1.17, < 2.0"

  # Each provider is a plugin that talks to one service's API. "~> X.Y" allows
  # newer compatible releases but never the next major version. The exact build
  # chosen, and a checksum of its download, is recorded in .terraform.lock.hcl,
  # which is committed so every machine uses the same verified plugin.
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.29"
    }
    render = {
      source  = "render-oss/render"
      version = "~> 1.9"
    }
    # Neon's own provider, which replaced the archived kislerdm/neon. Only
    # pre-releases exist so far, and "~>" never selects a pre-release, so it is
    # pinned exactly. Raise it deliberately once a stable release ships.
    neon = {
      source  = "neondatabase/neon"
      version = "0.19.0-beta.4"
    }
    # Generates PROXY_SECRET, so no person ever has to create or copy it.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}
