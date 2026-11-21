# Inputs. None of these is committed with a real value: infra/terraform.sh reads
# them out of the git-ignored .env and hands them to Terraform as TF_VAR_<name>.

variable "neon_org_id" {
  description = "Neon organisation that owns the app database (the SentinelOps App org, not the state org)."
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the Pages project."
  type        = string
}

# Neon's provider only exposes a role's password as an ephemeral value, which
# Render's provider cannot accept, so the connection string is copied once from
# the Neon console into .env as PROD_DATABASE_URL. It is empty on the very first
# apply, which creates only the database; the API's precondition refuses to
# deploy without it.
variable "prod_database_url" {
  description = "Direct (non-pooled) connection string of the app database."
  type        = string
  default     = ""
  sensitive   = true
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name; the site is served at https://<name>.pages.dev."
  type        = string
  default     = "sentinelops"
}

variable "api_service_name" {
  description = "Render service name; the API is served at https://<name>.onrender.com when the name is free."
  type        = string
  default     = "sentinelops-api"
}
