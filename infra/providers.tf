# Credentials are never written here. Each provider reads its own from the
# environment, which infra/terraform.sh fills from .env: CLOUDFLARE_API_TOKEN,
# RENDER_API_KEY with RENDER_OWNER_ID, and NEON_API_KEY.

provider "render" {
  # Make apply wait until Render has deployed the image and the health check
  # passes, so a broken deploy fails the apply instead of failing silently.
  wait_for_deploy_completion = true
}
