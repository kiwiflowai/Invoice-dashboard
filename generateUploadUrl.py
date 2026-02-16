import json
import boto3

S3_BUCKET = "invoice-storage1209"
REGION = "ap-southeast-2"

s3 = boto3.client("s3", region_name=REGION)

def lambda_handler(event, context):
    print("🔥 UPLOAD LAMBDA VERSION: NO UUID — FILENAME ONLY 🔥")

    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST,OPTIONS"
            },
            "body": json.dumps({"ok": True})
        }

    body = event.get("body")
    if isinstance(body, str):
        body = json.loads(body)

    print("📦 BODY RECEIVED:", body)

    user_id = body.get("userId")
    file_name = body.get("fileName")
    file_type = body.get("fileType", "application/octet-stream")

    if not user_id or not file_name:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "Missing userId or fileName"})
        }

    # HARD BLOCK UUIDS
    if "-" in file_name and len(file_name) > 30:
        print("🚨 WARNING: filename smells like UUID:", file_name)

    safe_file_name = file_name.replace(" ", "_")
    s3_key = f"{user_id}/{safe_file_name}"

    print("✅ FINAL S3 KEY:", s3_key)

    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": S3_BUCKET,
            "Key": s3_key,
            "ContentType": file_type
        },
        ExpiresIn=3600
    )

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps({
            "uploadUrl": upload_url,
            "s3Key": s3_key,
            "documentId": safe_file_name
        })
    }
