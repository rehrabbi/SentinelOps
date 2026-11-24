# The frontend site. "Direct upload": Cloudflare never connects to GitHub. The
# deploy workflow builds the site and uploads it with wrangler.
resource "cloudflare_pages_project" "web" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = "main"

  # Settings for the Pages Function in frontend/functions/api, the proxy.
  # Preview deployments get neither value, so a preview's proxy cannot reach
  # the API: it fails closed.
  deployment_configs = {
    production = {
      compatibility_date = "2026-11-01"
      # If the free plan's daily Functions quota ran out, failing open would
      # answer /api calls with the site's HTML; fail with a clear error instead.
      fail_open = false
      env_vars = {
        API_ORIGIN = {
          type  = "plain_text"
          value = render_web_service.api.url
        }
        PROXY_SECRET = {
          type  = "secret_text" # encrypted; never shown again in the dashboard
          value = random_password.proxy_secret.result
        }
      }
    }
    # Cloudflare requires fail_open to match in both environments. Previews
    # still get no API_ORIGIN or PROXY_SECRET, so they cannot reach the API.
    preview = {
      compatibility_date = "2026-11-01"
      fail_open          = false
    }
  }

  lifecycle {
    # Terraform sets the proxy's secret when it creates the project, and never
    # writes it again: infra/set-pages-secret.sh (wrangler) is its only writer
    # from then on. Cloudflare never returns a secret's value, so Terraform
    # cannot see what is really stored, and on 2026-11-24 an apply of a new
    # value through this provider stored a wrong one; it went unnoticed until
    # the next frontend deployment, which refused every API call for about two
    # minutes. See docs/RUNBOOK.md §5.
    ignore_changes = [deployment_configs.production.env_vars["PROXY_SECRET"]]

    postcondition {
      condition     = self.subdomain == "${var.pages_project_name}.pages.dev"
      error_message = "Cloudflare gave this project a different address, so the API's FRONTEND_ORIGIN would be wrong. Choose another pages_project_name."
    }
  }
}
