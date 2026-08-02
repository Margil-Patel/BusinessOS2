import sys
import asyncio
sys.path.insert(0, '.')
from config.settings import Settings
from controller.sql_generator import SQLGenerator
from controller.intent_parser import Intent
from controller.tool_orchestrator import SchemaContext

async def main():
    settings = Settings()
    generator = SQLGenerator(settings)

    context = SchemaContext()
    context.tables_found = [{
        "qualified_name": "public.student",
        "schema": "public",
        "name": "student",
        "columns": [
            {"name": "Sr_No", "type": "INTEGER"},
            {"name": "Name", "type": "VARCHAR"},
            {"name": "Enrollment_No", "type": "BIGINT"},
            {"name": "sem", "type": "INTEGER"},
            {"name": "Back", "type": "INTEGER"}
        ]
    }]
    context.schemas = {
        "public.student": {
            "columns": [
                {"name": "Sr_No", "type": "INTEGER"},
                {"name": "Name", "type": "VARCHAR"},
                {"name": "Enrollment_No", "type": "BIGINT"},
                {"name": "sem", "type": "INTEGER"},
                {"name": "Back", "type": "INTEGER"}
            ]
        }
    }

    intent1 = Intent(nl_query="how many back does vishwas and margil have", entities=["student"])
    sql1 = await generator.generate(intent1, context)
    print("Query 1 SQL:", sql1)

    intent2 = Intent(nl_query="how many number of backs does vishwas and margil has", entities=["student"])
    sql2 = await generator.generate(intent2, context)
    print("Query 2 SQL:", sql2)

if __name__ == "__main__":
    asyncio.run(main())
