# variable

variable "region" {
  default = "ap-northeast-2"
}

variable "name" {
  default = "s3-resize"
}

variable "stage" {
  default = "dev"
}

variable "domain" {
  default = "nalbam.com"
}

variable "s3_bucket" {
  default = "repo.nalbam.com"
}

variable "build_no" {
  default = "0"
}

variable "SOURCE_BUCKET" {
  default = "upload.nalbam.com"
}
