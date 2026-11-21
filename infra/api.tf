locals {
  # The exact API image to run, by its immutable commit tag. It lives in its own
  # file so infra/migrate.sh reads the same value, and a deploy is a one-line
  # diff. Bump it, run migrate.sh, then apply.
  api_image_tag = trimspace(file("${path.module}/api-image-tag.txt"))

  # Known before anything exists, which avoids a cycle: the API needs the
  # site's address and the site needs the API's. The Pages project checks below
  # that Cloudflare really gave it this address.
  frontend_origin = "https://${var.pages_project_name}.pages.dev"
}

# Shared by the Pages proxy and the API. Only requests carrying it reach the
# API's routes. Generated here, so no person ever sees or types it.
resource "random_password" "proxy_secret" {
  length  = 48
  special = false # letters and digits only, about 285 bits; safe in any header
}

resource "render_web_service" "api" {
  name              = var.api_service_name
  plan              = "free"
  region            = "singapore"
  health_check_path = "/healthz"

  runtime_source = {
    image = {
      image_url = "ghcr.io/rehrabbi/sentinelops-api"
      tag       = local.api_image_tag
    }
  }

  env_vars = {
    DATABASE_URL    = { value = var.prod_database_url }
    PROXY_SECRET    = { value = random_password.proxy_secret.result }
    FRONTEND_ORIGIN = { value = local.frontend_origin }
    SECURE_COOKIES  = { value = "true" }
    # The port the API listens on; Render routes public traffic to it.
    PORT = { value = "8080" }
  }

  lifecycle {
    precondition {
      condition     = var.prod_database_url != ""
      error_message = "PROD_DATABASE_URL is empty. Create the database first (apply -target=neon_project.app), copy its direct connection string into .env, and run migrate.sh."
    }
    precondition {
      condition     = can(regex("^sha-[0-9a-f]{40}$", local.api_image_tag))
      error_message = "infra/api-image-tag.txt must hold one immutable tag, sha-<40-character commit>, never a moving tag such as main."
    }
    postcondition {
      condition     = startswith(self.url, "https://")
      error_message = "Render returned an API address that is not https; the proxy would send the secret in clear."
    }
  }
}
