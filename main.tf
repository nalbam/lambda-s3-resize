# Terraform Main

module "dev-lambda" {
  source = "git::https://github.com/nalbam/terraform-aws-lambda-s3.git"
  region = var.region

  name        = var.name
  stage       = var.stage
  description = "s3 > lambda > resize"
  runtime     = "nodejs10.x"
  handler     = "index.handler"
  memory_size = 512
  timeout     = 5
  s3_bucket   = var.s3_bucket
  s3_source   = "target/lambda.zip"
  s3_key      = "lambda/${var.name}/${var.name}.zip"

  source_bucket = var.SOURCE_BUCKET
  filter_prefix = "origin/"
  filter_suffix = ""

  env_vars = {
    PROFILE = var.stage
  }
}
