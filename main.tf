# Terraform Main

terraform {
  backend "s3" {
    region = "ap-northeast-2"
    bucket = "terraform-nalbam-seoul"
    key    = "dev-s3-resize.tfstate"
  }
  required_version = ">= 0.12"
}

provider "aws" {
  region = var.region
}

module "dev-lambda" {
  source = "github.com/nalbam/terraform-aws-lambda-s3?ref=v0.12.2"
  region = var.region

  name        = var.name
  stage       = var.stage
  description = "s3 > lambda > resize : #2"
  runtime     = "nodejs8.10"
  handler     = "index.handler"
  memory_size = 2048
  timeout     = 10
  s3_bucket   = var.s3_bucket
  s3_source   = "target/lambda.zip"
  s3_key      = "lambda/${var.name}/${var.name}-${var.build_no}.zip"

  source_bucket = var.SOURCE_BUCKET
  filter_prefix = "origin/"
  filter_suffix = ""

  env_vars = {
    PROFILE = var.stage
  }
}
