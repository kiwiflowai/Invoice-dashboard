import json
import boto3

S3_BUCKET = "invoice-storage1209"
REGION = "ap-southeast-2"

s3_client = boto3.client("s3", region_name=REGION)

def lambda_handler(event, context):

    print("Event received:", event)

    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    # Handle OPTIONS (CORS)
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST,OPTIONS"
            },
            "body": json.dumps({"message": "CORS preflight OK"})
        }

    try:
        body = json.loads(event['body'])

        file_name = body['fileName']
        file_type = body.get('fileType', 'application/octet-stream')
        user_id = body.get("userId")

        if not user_id:
            return {
                "statusCode": 400,
                "headers": { "Access-Control-Allow-Origin": "*" },
                "body": json.dumps({"error": "Missing userId"})
            }

        # ✅ VERY IMPORTANT
        # Store file under user folder
        s3_key = f"{user_id}/{file_name}"

        print("Uploading to S3 key:", s3_key)

        # Generate the presigned URL
        url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=3600
        )

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'uploadUrl': url,
                's3Key': s3_key   # optional but useful for debugging
            })
        }

    except Exception as e:
        print("ERROR:", str(e))
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
