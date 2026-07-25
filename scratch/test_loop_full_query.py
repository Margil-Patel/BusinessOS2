import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import get_settings
from controller.agentic_loop import AgenticLoop
from model.facade import ModelFacade

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    loop = AgenticLoop(model, settings)
    
    query = "give me list of glossy tiles buyers"
    print(f"Testing Query: {query}")
    state = await loop.run(query)
    
    print("\n--- LOOP RESULT ---")
    print(f"Success: {state.success}")
    print(f"Final SQL: {state.final_sql}")
    print(f"Errors: {state.errors}")
    print(f"Iterations: {state.iteration}")
    print(f"Confidence: {state.confidence}")
    print(f"Rows count: {len(state.rows)}")
    if state.rows:
        print("Rows sample:", state.rows[:5])
        
    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(test())
