import json
import os
import urllib.parse
import boto3
import logging
from decimal import Decimal
from google.cloud import documentai_v1 as documentai
from google.oauth2 import service_account

# -----------------------
# Logging
# -----------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# -----------------------
# AWS Clients
# -----------------------
s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")
dynamodb = boto3.resource("dynamodb")
bedrock = boto3.client("bedrock-runtime", region_name="ap-southeast-2")

TABLE_NAME = "OCRResults"
table = dynamodb.Table(TABLE_NAME)

# -----------------------
# Google DocAI Config
# -----------------------
GCP_PROJECT_ID = "ocrdocai-479704"
PROCESSOR_ID = "b453ab1a6b475d7d"   # Invoice Parser
LOCATION = "us"
SECRET_NAME = "googledocaikey"
S3_BUCKET = "invoice-storage1209"

# -----------------------
# Bedrock Model
# -----------------------
MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

# -----------------------
# Helpers
# -----------------------
def get_google_credentials():
    secret = secrets.get_secret_value(SecretId=SECRET_NAME)
    return service_account.Credentials.from_service_account_info(
        json.loads(secret["SecretString"])
    )

SUPPORTED_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".tif": "image/tiff"
}

def get_mime_type(key):
    return SUPPORTED_MIME_TYPES.get(
        os.path.splitext(key.lower())[1],
        "application/pdf"
    )

def process_document_with_docai(file_bytes, key):
    client = documentai.DocumentProcessorServiceClient(
        credentials=get_google_credentials()
    )

    request = documentai.ProcessRequest(
        name=f"projects/{GCP_PROJECT_ID}/locations/{LOCATION}/processors/{PROCESSOR_ID}",
        raw_document=documentai.RawDocument(
            content=file_bytes,
            mime_type=get_mime_type(key)
        )
    )

    return client.process_document(request=request).document

def convert_floats_to_decimal(obj):
    if isinstance(obj, list):
        return [convert_floats_to_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    else:
        return obj

# -----------------------
# Claude Extraction
# -----------------------
def extract_with_claude(raw_text):
    prompt = f"""
You are an expert invoice analysis system.

RULES:
- Return VALID JSON ONLY
- No markdown
- No commentary
- If unknown use null

JSON SCHEMA:
{{
  "documentType": "invoice",
  "confidence": number,
  "parties": {{
    "sender": string|null,
    "recipient": string|null
  }},
  "dates": {{
    "issueDate": "YYYY-MM-DD"|null,
    "dueDate": "YYYY-MM-DD"|null
  }},
  "financials": {{
    "currency": string|null,
    "subtotal": number|null,
    "tax": number|null,
    "total": number|null
  }},
  "lineItems": [
    {{
      "description": string,
      "quantity": number|null,
      "unitPrice": number|null,
      "amount": number|null
    }}
  ],
  "summary": string
}}

Document text:
{raw_text[:12000]}
"""

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "temperature": 0,
            "max_tokens": 900,
            "messages": [{"role": "user", "content": prompt}]
        })
    )

    body = json.loads(response["body"].read())
    return json.loads(body["content"][0]["text"])

# -----------------------
# Lambda Handler
# -----------------------
def lambda_handler(event, context):
    logger.info("OCR Lambda triggered")

    for record in event.get("Records", []):
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        bucket = record["s3"]["bucket"]["name"]

        if bucket != S3_BUCKET:
            continue

        try:
            user_id, filename = key.split("/", 1)
        except ValueError:
            logger.error("Invalid S3 key format: %s", key)
            continue

        try:
            file_bytes = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            document = process_document_with_docai(file_bytes, key)

            # ✅ Extract text from Invoice Parser entities
            raw_text = "\n".join(
                e.mention_text for e in document.entities if e.mention_text
            )

            summary_obj = extract_with_claude(raw_text)
            summary_obj = convert_floats_to_decimal(summary_obj)

        except Exception:
            logger.exception("Processing failed for %s", key)
            summary_obj = {
                "documentType": "unknown",
                "confidence": Decimal("0"),
                "summary": "Failed to process document."
            }

        # ✅ Store REAL JSON (Decimal-safe)
        table.put_item(
            Item={
                "userId": user_id,
                "filename": filename,
                "summary": summary_obj
            }
        )

        logger.info("Stored OCR result for %s", key)

    return {"statusCode": 200}
