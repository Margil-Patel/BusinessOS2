import asyncio
import logging
from config.settings import get_settings
from model.facade import ModelFacade
from controller.agentic_loop import AgenticLoop
from controller.intent_parser import IntentParser
from controller.tool_orchestrator import ToolOrchestrator
from controller.sql_generator import SQLGenerator

logging.basicConfig(level=logging.INFO)

async def main():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()

    parser = IntentParser()
    intent = parser.parse("give details of bhavesh patel")

    orchestrator = ToolOrchestrator(model, settings)
    reasoning_analysis = """
Intent Detected: Retrieve details of a specific person ("Bhavesh Patel")
Ignored Conversational Terms: give, details, of
Business Entities: Bhavesh Patel
Candidate Schema Terms: none
Reason for Schema Lookup: Need to find which table contains records for "Bhavesh Patel".
"""
    context = await orchestrator.gather_context(intent, reasoning_analysis=reasoning_analysis)

    print("=== GATHERED CONTEXT PROMPT TEXT ===")
    print(context.to_prompt_text())
    print("====================================")

    generator = SQLGenerator(settings)
    user_prompt = generator._build_user_prompt(intent, context, reasoning_analysis=reasoning_analysis)
    print("=== SQL GENERATOR USER PROMPT ===")
    print(user_prompt)
    print("==================================")

    try:
        sql = await generator.generate(intent, context, reasoning_analysis=reasoning_analysis)
        print("GENERATED SQL:", sql)
    except Exception as e:
        print("GENERATION ERROR:", e)

    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
