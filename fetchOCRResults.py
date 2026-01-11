import json
import boto3
import logging
from decimal import Decimal
from boto3.dynamodb.conditions import Attr

# -----------------------
# Config
# -----------------------
TABLE_NAME = "OCRResults"
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

# -----------------------
# Logger
# -----------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# -----------------------
# JSON Encoder
# -----------------------
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

# -----------------------
# Lambda Handler
# -----------------------
def lambda_handler(event, context):
    try:
        logger.info("Starting DynamoDB scan...")

        # ✅ Read userId safely INSIDE handler
        params = event.get("queryStringParameters") or {}
        user_id = params.get("userId")

        if not user_id:
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"error": "Missing userId"})
            }

        items = []

        # ✅ Filter by userId
        response = table.scan(
            FilterExpression=Attr("userId").eq(user_id)
        )
        items.extend(response.get("Items", []))

        # ✅ Pagination WITH filter preserved
        while "LastEvaluatedKey" in response:
            response = table.scan(
                ExclusiveStartKey=response["LastEvaluatedKey"],
                FilterExpression=Attr("userId").eq(user_id)
            )
            items.extend(response.get("Items", []))

        logger.info("Fetched %d items for user %s", len(items), user_id)

        if not items:
            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Content-Type",
                    "Access-Control-Allow-Methods": "GET,OPTIONS"
                },
                "body": json.dumps({
                    "count": 0,
                    "items": []
                })
            }

        # ✅ Sort newest first
        items_sorted = sorted(
            items,
            key=lambda x: x.get("timestamp", ""),
            reverse=True
        )

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET,OPTIONS"
            },
            "body": json.dumps({
                "count": len(items_sorted),
                "items": items_sorted
            }, cls=DecimalEncoder)
        }

    except Exception as e:
        logger.exception("Error scanning DynamoDB")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET,OPTIONS"
            },
            "body": json.dumps({"error": str(e)})
        }
