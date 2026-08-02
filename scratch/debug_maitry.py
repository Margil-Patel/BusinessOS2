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
    intent = parser.parse("give details of maitry")

    orchestrator = ToolOrchestrator(model, settings)
    reasoning_analysis = await AgenticLoop(model, settings)._run_analyst_reasoning("give details of maitry")
    print("=== SENIOR ANALYST REASONING ===")
    print(reasoning_analysis)

    context = await orchestrator.gather_context(intent, reasoning_analysis=reasoning_analysis)
    print("\n=== GATHERED CONTEXT ===")
    print(context.to_prompt_text())

    generator = SQLGenerator(settings)
    user_prompt = generator._build_user_prompt(intent, context, reasoning_analysis=reasoning_analysis)
    print("\n=== SQL GENERATOR PROMPT ===")
    print(user_prompt)

    try:
        sql = await generator.generate(intent, context, reasoning_analysis=reasoning_analysis)
        print("\n=== GENERATED SQL ===")
        print(sql)
    except Exception as e:
        print("\n=== GENERATION ERROR ===")
        print(e)

    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
