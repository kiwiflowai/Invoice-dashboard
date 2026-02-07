import json
import os
import urllib.parse
import boto3
import logging
from decimal import Decimal
from google.cloud import documentai_v1 as documentai
from google.oauth2 import service_account
from datetime import datetime

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
PROCESSOR_ID = "b453ab1a6b475d7d"
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
    ext = os.path.splitext(key.lower())[1]
    return SUPPORTED_MIME_TYPES.get(ext, "application/pdf")

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

# -----------------------
# Convert floats → Decimal for DynamoDB
# -----------------------
def to_dynamodb_safe(value):
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_dynamodb_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_dynamodb_safe(v) for v in value]
    return value

# -----------------------
# Claude Extraction (NO retries, ALWAYS JSON)
# -----------------------
def extract_with_claude(raw_text):
    prompt = f"""
You are an intelligent document analyzer.

1. Determine what this document is.
2. If it is NOT an invoice, clearly say so.
3. Always return VALID JSON.
4. Never throw errors.

Return this schema exactly:

{{
  "document_type": "invoice" | "non-invoice",
  "confidence": number,
  "invoice_number": string|null,
  "supplier": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,
  "currency": string|null,
  "subtotal": number|null,
  "tax": number|null,
  "total": number|null,
  "category": "Utilities"|"Rent"|"SaaS"|"Cloud"|"Office"|"Other"|null,
  "summary": {{
    "description": string,
    "notes": string|null
  }}
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
            "max_tokens": 700,
            "messages": [{"role": "user", "content": prompt}]
        })
    )

    body = json.loads(response["body"].read())
    text = body["content"][0]["text"].strip()

    try:
        return json.loads(text)
    except Exception:
        # Absolute safety fallback
        return {
            "document_type": "non-invoice",
            "confidence": 0.0,
            "invoice_number": None,
            "supplier": None,
            "invoice_date": None,
            "due_date": None,
            "currency": None,
            "subtotal": None,
            "tax": None,
            "total": None,
            "category": None,
            "summary": {
                "description": "Unstructured document",
                "notes": text[:500]
            }
        }

# -----------------------
# Lambda Handler
# -----------------------
def lambda_handler(event, context):
    logger.info("Processing started")

    for record in event.get("Records", []):
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        bucket = record["s3"]["bucket"]["name"]
        user_id = key.split("/")[0] if "/" in key else "unknown"

        if bucket != S3_BUCKET:
            continue

        try:
            file_bytes = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            document = process_document_with_docai(file_bytes, key)
            raw_text = document.text or ""

            extracted = extract_with_claude(raw_text)

            item = {
                "userId": user_id,
                "invoiceId": extracted.get("invoice_number") or key,
                "filename": key,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "COMPLETE",
                "documentType": extracted.get("document_type"),
                "confidence": extracted.get("confidence"),
                "rawText": raw_text[:40000],

                "supplier": extracted.get("supplier"),
                "invoiceDate": extracted.get("invoice_date"),
                "dueDate": extracted.get("due_date"),
                "currency": extracted.get("currency"),
                "subtotal": extracted.get("subtotal"),
                "tax": extracted.get("tax"),
                "total": extracted.get("total"),
                "category": extracted.get("category"),
                "summary": extracted.get("summary")
            }

            table.put_item(Item=to_dynamodb_safe(item))
            logger.info("Stored %s", key)

        except Exception as e:
            logger.exception("Hard failure on %s", key)
            table.put_item(Item={
                "userId": user_id,
                "invoiceId": key,
                "filename": key,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "FAILED",
                "summary": {
                    "description": "Processing failure",
                    "notes": str(e)
                }
            })

    return {"statusCode": 200}

