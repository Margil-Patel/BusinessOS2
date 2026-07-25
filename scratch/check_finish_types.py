import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from model.db.connector import DatabaseConnector

async def check():
    db = DatabaseConnector('postgresql+asyncpg://postgres:Margil%40123@localhost:5432/business_os2')
    await db.connect()
    try:
        rows = await db.execute('SELECT DISTINCT finish_type FROM tiles_business.tile_inventory')
        print("Distinct finish_type values:")
        for row in rows:
            print(f"- {row['finish_type']}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check())
