import asyncio
import logging
from openai import AsyncOpenAI
from config.settings import get_settings
from model.facade import ModelFacade
from controller.agentic_loop import AgenticLoop

logging.basicConfig(level=logging.INFO)

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    client = AsyncOpenAI(
        base_url=settings.ollama_base_url,
        api_key="ollama",
    )
    
    # Step 1: Analyst Reasoning
    query = "Show details of MC10"
    analyst_prompt = f"""You are a senior database analyst. Analyze the user's natural language query before database schema matching.
Analyze the query according to these steps:

Step 1 - Understand Intent: Determine the user's intention (e.g., retrieve records, filter records, aggregate data, compare values, sort results, count rows, find maximum/minimum, metadata question, greeting/non-database conversation). Do not inspect schemas yet.
Step 2 - Identify Important Information: Extract only meaningful entities or values (e.g., business identifiers, names, codes) and identify conversational filler terms to ignore.
Step 3 - Classify Words: Classify tokens into:
  - Action words: (e.g. show, find, list, retrieve, display, tell, fetch, count - never search these in schema)
  - Conversational filler: (e.g. details, record, information, entry, data, about, please, kindly, me - ignore completely, never search in schema)
  - Business entities: (e.g. specific IDs, names, categories, values to search in table data like 'MC10', 'Bhavesh Patel')
  - Possible schema terms: (e.g. terms representing tables, columns, or relationships like 'village', 'price', 'crop')
Step 4 - Reason Before Schema Lookup: Reason about what information is actually required and what terms are candidates for schema search.

You MUST respond in this exact format (ensure the labels match exactly):

Intent Detected: <intent description>
Ignored Conversational Terms: <comma-separated list of ignored terms, or none>
Business Entities: <comma-separated list of business identifiers/values, or none>
Candidate Schema Terms: <comma-separated list of potential tables/columns, or none. DO NOT include any Action words (like 'show') or Conversational fillers here.>
Reason for Schema Lookup: <brief explanation of what to search for and where to search>

QUERY: {query}
"""
    response = await client.chat.completions.create(
        model=settings.ollama_model,
        messages=[{"role": "user", "content": analyst_prompt}],
        temperature=0.0,
    )
    reasoning = response.choices[0].message.content
    print("=" * 60)
    print("ANALYST REASONING OUTPUT:")
    print("=" * 60)
    print(reasoning)
    print("=" * 60)
    
    await model.shutdown()

asyncio.run(test())
