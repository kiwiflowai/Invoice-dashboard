import json
import os
import urllib.parse
import boto3
import logging
from google.cloud import documentai_v1 as documentai
from google.oauth2 import service_account
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")
dynamodb = boto3.resource("dynamodb")
bedrock = boto3.client("bedrock-runtime", region_name="ap-southeast-2")
TABLE_NAME = "OCRResults"
table = dynamodb.Table(TABLE_NAME)

# DocAI config
GCP_PROJECT_ID = "ocrdocai-479704"
PROCESSOR_ID = "b453ab1a6b475d7d"
LOCATION = "us"
SECRET_NAME = "googledocaikey"
S3_BUCKET = "invoice-storage1209"

# Claude model
MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

# -----------------------
# Helpers
# -----------------------
def get_google_credentials():
    secret = secrets.get_secret_value(SecretId=SECRET_NAME)
    sa_key = json.loads(secret["SecretString"])
    credentials = service_account.Credentials.from_service_account_info(sa_key)
    return credentials

SUPPORTED_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp"
}

def get_mime_type_from_bytes(key: str, file_bytes: bytes) -> str:
    ext = os.path.splitext(key.lower())[1]
    if ext in SUPPORTED_MIME_TYPES:
        return SUPPORTED_MIME_TYPES[ext]
    if file_bytes.startswith(b"%PDF"): return "application/pdf"
    if file_bytes.startswith(b"\x89PNG"): return "image/png"
    if file_bytes.startswith(b"\xFF\xD8\xFF"): return "image/jpeg"
    if file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"): return "image/gif"
    if file_bytes[:2] == b"BM": return "image/bmp"
    return "application/pdf"  # default

def process_document_with_docai(file_bytes, key):
    """
    Extract text from PDF or images using DocAI
    """
    mime_type = get_mime_type_from_bytes(key, file_bytes)
    credentials = get_google_credentials()
    client = documentai.DocumentProcessorServiceClient(credentials=credentials)
    processor_name = f"projects/{GCP_PROJECT_ID}/locations/{LOCATION}/processors/{PROCESSOR_ID}"

    raw_document = documentai.RawDocument(content=file_bytes, mime_type=mime_type)
    request = documentai.ProcessRequest(name=processor_name, raw_document=raw_document)
    result = client.process_document(request=request)
    return getattr(result.document, "text", "")

def summarize_with_claude(raw_text):
    """
    Sends raw text to Claude via Bedrock and returns a human-readable summary
    """
    prompt = f"""
You are an invoice assistant.

Summarise the following invoice text in a clear, human-readable way.
Include:
- Invoice number
- Supplier
- Total amount
- Due date (if present)
- Short line-item summary

Invoice text:
{raw_text}
"""

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 300,
        "temperature": 0.3,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    response = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(request_body)
    )

    response_body = json.loads(response["body"].read())
    summary = response_body["content"][0]["text"]
    return summary

# -----------------------
# Lambda handler
# -----------------------
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    results = []

    for record in event.get("Records", []):
        key = record["s3"]["object"]["key"]
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(key)
        # Extract userId from S3 key: userId/filename.pdf
        user_id = key.split("/")[0] if "/" in key else "unknown"


        try:
            if bucket != S3_BUCKET:
                logger.warning(f"Skipping file {key} from unexpected bucket {bucket}")
                continue

            # Get file
            s3_obj = s3.get_object(Bucket=bucket, Key=key)
            file_bytes = s3_obj["Body"].read()

            # Extract raw text from DocAI (pass key!)
            raw_text = process_document_with_docai(file_bytes, key)
            logger.info(f"Extracted raw text, length={len(raw_text)}")

            # Get summary from Claude
            summary = summarize_with_claude(raw_text)
            logger.info(f"Claude summary: {summary}")

            dynamo_item = {
            "userId": user_id,
            "filename": key,
            "timestamp": datetime.utcnow().isoformat(),
            "raw_text": raw_text,
            "summary": summary
            }

            table.put_item(Item=dynamo_item)

            results.append({"file": key, "status": "success", "summary": summary})

        except Exception as e:
            logger.exception(f"Error processing file {key}")
            results.append({"file": key, "status": "error", "error": str(e)})

    return {"statusCode": 200, "results": results}
