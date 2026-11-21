# The app's production database: a Neon project in its own organisation, apart
# from the project that holds Terraform's state.
resource "neon_project" "app" {
  name       = "sentinelops"
  org_id     = var.neon_org_id
  region_id  = "aws-ap-southeast-1" # Singapore, next to the API on Render
  pg_version = 17                   # the same major version as local development

  # The Free plan's maximum point-in-time restore window is 6 hours. The
  # provider's default of 1 day would be refused.
  history_retention_seconds = 21600

  # The default database and its owner role, created with the project.
  database_name = "sentinelops"
  database_user = "sentinelops"

  # Destroying this resource deletes every user, incident and audit entry, and
  # Neon keeps no copy. Terraform refuses any plan that would do it; removing
  # this line first is the deliberate step that allows it.
  lifecycle {
    prevent_destroy = true
  }
}
