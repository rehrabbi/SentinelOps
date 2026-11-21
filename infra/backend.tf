# Terraform's state, its record of everything it manages, lives in the separate
# sentinelops-tfstate Neon project rather than on one machine (see issue #30).
#
# The pg backend reads its connection string from the PG_CONN_STR environment
# variable, kept in the git-ignored .env, so no credential is ever written here.
# It locks the state with Postgres advisory locks during every plan and apply.
# Those locks live for a database session, which Neon's -pooler endpoint does
# not keep, so PG_CONN_STR must be the direct connection string.
terraform {
  backend "pg" {
    schema_name = "sentinelops"
  }
}
