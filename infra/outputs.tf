# Printed after every apply, and readable with `infra/terraform.sh output`.
# Nothing secret is output; the database URL and the proxy secret stay inside.

output "site_url" {
  description = "The public address of SentinelOps."
  value       = local.frontend_origin
}

output "api_url" {
  description = "The API's own address. Without the proxy secret it answers 403, apart from /healthz."
  value       = render_web_service.api.url
}

output "api_image" {
  description = "The API image Render runs."
  value       = "ghcr.io/rehrabbi/sentinelops-api:${local.api_image_tag}"
}

output "neon_project_id" {
  description = "Neon project of the app database, for finding it in the console."
  value       = neon_project.app.id
}
