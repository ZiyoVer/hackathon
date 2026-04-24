from __future__ import annotations

import boto3

from backend.config import Settings


class WasabiStorage:
    def __init__(self, settings: Settings):
        self.settings = settings

    def upload_bytes(self, key: str, body: bytes, content_type: str) -> str | None:
        if not self.settings.has_wasabi:
            return None

        client = boto3.client(
            "s3",
            endpoint_url=self.settings.wasabi_endpoint_url,
            region_name=self.settings.wasabi_region,
            aws_access_key_id=self.settings.wasabi_access_key_id,
            aws_secret_access_key=self.settings.wasabi_secret_access_key,
        )
        client.put_object(
            Bucket=self.settings.wasabi_bucket,
            Key=key,
            Body=body,
            ContentType=content_type,
        )

        if self.settings.wasabi_public_base_url:
            return f"{self.settings.wasabi_public_base_url.rstrip('/')}/{key}"
        return f"{self.settings.wasabi_endpoint_url.rstrip('/')}/{self.settings.wasabi_bucket}/{key}"
