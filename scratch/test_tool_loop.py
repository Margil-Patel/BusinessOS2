import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import get_settings
from controller.tool_orchestrator import ToolOrchestrator
from model.facade import ModelFacade
from controller.intent_parser import IntentParser

async def test_loop():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    orchestrator = ToolOrchestrator(model, settings)
    parser = IntentParser()
    
    query = "how many tiles are of glossy types"
    intent = parser.parse(query)
    
    print(f"Testing query: {query}")
    context = await orchestrator.gather_context(intent)
    
    print("\nTool Trace:")
    for trace in context.tool_trace:
        print(f"Round {trace['round']}: {trace['tool']}({trace['args']}) -> {trace['result_summary']}")
        
    print("\nSample Values gathered:")
    print(context.sample_values)
    
    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(test_loop())
