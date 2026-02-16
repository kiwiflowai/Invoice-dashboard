import json
import boto3
from boto3.dynamodb.conditions import Attr
from decimal import Decimal
import logging

# -----------------------
# Config
# -----------------------
TABLE_NAME = "OCRResults"
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        user_id = params.get("userId")

        if not user_id:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Missing userId"})
            }

        items = []
        response = table.scan(FilterExpression=Attr("userId").eq(user_id))
        items.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = table.scan(
                ExclusiveStartKey=response["LastEvaluatedKey"],
                FilterExpression=Attr("userId").eq(user_id)
            )
            items.extend(response.get("Items", []))

        # Sort newest first
        items_sorted = sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)

        # Only include filename + summary
        clean_items = [{"fileName": i.get("filename"), "summary": i.get("summary")} for i in items_sorted]

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET,OPTIONS"
            },
            "body": json.dumps({"count": len(clean_items), "items": clean_items}, cls=DecimalEncoder)
        }

    except Exception as e:
        logger.exception("Error fetching OCR results")
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET,OPTIONS"
            },
            "body": json.dumps({"error": str(e)})
        }
