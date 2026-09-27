"""Normalize one pinned USDA FoodData Central archive; never writes to Supabase."""
import argparse
import hashlib
import io
import json
import math
import pathlib
import urllib.request
import uuid
import zipfile

DATASETS = {
    "foundation": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip",
        "release": "2026-04-30",
        "key": "FoundationFoods",
    },
    "fndds": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip",
        "release": "2024-10-31",
        "key": "SurveyFoods",
    },
}


def normalize(food, data_type, release):
    if not isinstance(food, dict) or not food.get("fdcId") or not food.get("description"):
        return None
    values = {}
    definitions = {}
    for row in food.get("foodNutrients", []):
        nutrient = row.get("nutrient") or {}
        nutrient_id = nutrient.get("id")
        amount = row.get("amount")
        if (
            isinstance(nutrient_id, int)
            and isinstance(amount, (int, float))
            and math.isfinite(amount)
            and amount >= 0
        ):
            values[str(nutrient_id)] = amount
            unit = str(nutrient.get("unitName", ""))[:16].replace("\ufffdg", "µg")
            definitions[nutrient_id] = {
                "id": nutrient_id,
                "name": str(nutrient.get("name", "Nutrient"))[:120],
                "unit": unit,
            }

    def first(*ids):
        return next((values[str(i)] for i in ids if str(i) in values), None)

    fixed = {
        "calories": first(1008, 2048, 2047),
        "protein_g": first(1003),
        "carbs_g": first(1005),
        "fat_g": first(1004),
        "fiber_g": first(1079),
        "sugar_g": first(2000, 1063),
        "saturated_fat_g": first(1258),
        "sodium_mg": first(1093),
        "potassium_mg": first(1092),
    }
    if any(fixed[k] is None for k in ("calories", "protein_g", "carbs_g", "fat_g")):
        return None

    source_id = str(food["fdcId"])
    source_url = "https://fdc.nal.usda.gov/food-details/" + source_id + "/nutrients"
    portions = []
    for portion in food.get("foodPortions", []):
        grams = portion.get("gramWeight")
        amount = portion.get("amount", 1)
        unit = (portion.get("measureUnit") or {}).get("name", "")
        description = portion.get("portionDescription") or portion.get("modifier") or ""
        if unit in ("undetermined", "Quantity not specified"):
            unit = ""
        label = (
            str(description).strip()
            if description and str(description).strip().casefold() != "quantity not specified"
            else " ".join(str(x) for x in (amount, unit, portion.get("modifier")) if x and x != "undetermined")
        )
        if isinstance(grams, (int, float)) and math.isfinite(grams) and 0 < grams <= 100000 and label:
            item = {"label": label[:160], "grams": grams}
            if item not in portions:
                portions.append(item)

    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, source_url)),
        "name": food["description"][:200],
        "brand": food.get("brandOwner") or food.get("brandName"),
        "gtin_upc": str(food["gtinUpc"]) if food.get("gtinUpc") else None,
        "source": "USDA FoodData Central",
        "source_id": source_id,
        "source_url": source_url,
        "source_release": release,
        "source_data_type": data_type,
        "serving_grams": 100,
        "portions": portions[:20],
        "nutrient_values": values,
        "nutrient_definitions": list(definitions.values()),
        **fixed,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", choices=DATASETS, default="foundation")
    parser.add_argument("archive", nargs="?", help="optional local ZIP for offline import")
    args = parser.parse_args()
    source = DATASETS[args.dataset]
    raw = pathlib.Path(args.archive).read_bytes() if args.archive else urllib.request.urlopen(source["url"], timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        filename = next(n for n in archive.namelist() if n.endswith(".json"))
        dataset = json.loads(archive.read(filename))
    rows = dataset[source["key"]]
    data_type = "FNDDS" if args.dataset == "fndds" else "Foundation"
    foods = [f for row in rows if (f := normalize(row, data_type, source["release"])) is not None]
    foods.sort(key=lambda f: (f["name"].casefold(), f["source_id"]))
    assert len(foods) >= 100, "Unexpectedly small source: inspect before importing"
    definitions = {}
    for food in foods:
        for item in food.pop("nutrient_definitions"):
            old = definitions.get(item["id"])
            if old and old != item:
                raise ValueError(f"USDA nutrient definition changed within release: {item['id']}")
            definitions[item["id"]] = item
    output_data = {
        "source_url": source["url"],
        "archive_sha256": hashlib.sha256(raw).hexdigest(),
        "release": source["release"],
        "data_type": data_type,
        "license": "CC0-1.0",
        "total_source_foods": len(rows),
        "nutrient_definitions": sorted(definitions.values(), key=lambda n: n["id"]),
        "foods": foods,
    }
    output = json.dumps(output_data, ensure_ascii=False, separators=(",", ":"))
    normalized_path = pathlib.Path(f"data/usda-{args.dataset}-normalized.json")
    normalized_path.write_text(output + "\n", encoding="utf-8")
    pathlib.Path("usda-catalog.json").write_text(output + "\n", encoding="utf-8")
    print(
        f"Imported {len(foods)} {data_type} foods with complete energy/macros; "
        f"retained {len(definitions)} nutrient definitions; omitted {len(rows)-len(foods)} incomplete records"
    )


if __name__ == "__main__":
    main()

