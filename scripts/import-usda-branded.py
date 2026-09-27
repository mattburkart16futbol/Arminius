"""Stream USDA's large branded archive and keep a small, traceable product sample."""
import hashlib
import io
import json
import math
import pathlib
import urllib.request
import uuid
import zipfile

URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_json_2026-04-30.zip"
RELEASE = "2026-04-30"
# A small starter selection. Add brands deliberately; never mirror the full 3.1 GB archive.
BRAND_TERMS = (
    "quaker", "chobani", "oikos", "fairlife", "quest", "jif", "mission",
    "silk", "kodiak", "kind", "kirkland", "nature valley", "fage", "siggi",
    "premier protein", "dave's killer", "bob's red mill", "dannon",
)
PER_BRAND_LIMIT = 8
MAX_PRODUCTS = 160
CHUNK = 1 << 20
DECODER = json.JSONDecoder()


def records_from_archive(stream):
    text = io.TextIOWrapper(stream, encoding="utf-8")
    buffer = ""
    while '"BrandedFoods"' not in buffer:
        chunk = text.read(CHUNK)
        if not chunk:
            raise ValueError("BrandedFoods array not found in USDA archive")
        buffer = (buffer + chunk)[-CHUNK:]
    property_position = buffer.index('"BrandedFoods"') + len('"BrandedFoods"')
    while "[" not in buffer[property_position:]:
        buffer += text.read(CHUNK)
    position = buffer.index("[", property_position) + 1
    while True:
        while True:
            while position < len(buffer) and (buffer[position].isspace() or buffer[position] == ","):
                position += 1
            if position < len(buffer):
                break
            chunk = text.read(CHUNK)
            if not chunk:
                raise ValueError("Unexpected end of USDA BrandedFoods array")
            buffer = ""
            position = 0
            buffer += chunk
        if buffer[position] == "]":
            return
        try:
            row, end = DECODER.raw_decode(buffer, position)
        except json.JSONDecodeError:
            chunk = text.read(CHUNK)
            if not chunk:
                raise
            buffer = buffer[position:] + chunk
            position = 0
            continue
        position = end
        if isinstance(row, dict):
            yield row
        if position > CHUNK:
            buffer = buffer[position:]
            position = 0


def normalize(row):
    if not row.get("fdcId") or not row.get("description") or not row.get("gtinUpc"):
        return None
    serving = row.get("servingSize")
    unit = str(row.get("servingSizeUnit", "")).casefold()
    if not isinstance(serving, (int, float)) or not math.isfinite(serving) or serving <= 0 or unit not in {"g", "grm", "gram", "grams"}:
        return None
    values = {}
    definitions = {}
    for fact in row.get("foodNutrients", []):
        nutrient = fact.get("nutrient") or {}
        nutrient_id = nutrient.get("id")
        amount = fact.get("amount")
        if isinstance(nutrient_id, int) and isinstance(amount, (int, float)) and math.isfinite(amount) and amount >= 0:
            values[str(nutrient_id)] = amount
            definitions[nutrient_id] = {
                "id": nutrient_id,
                "name": str(nutrient.get("name", "Nutrient"))[:120],
                "unit": str(nutrient.get("unitName", ""))[:16].replace("\ufffdg", "µg"),
            }
    if any(str(key) not in values for key in (1008, 1003, 1004, 1005)):
        return None
    fdc_id = str(row["fdcId"])
    url = f"https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients"
    household = str(row.get("householdServingFullText") or "").strip()
    portions = [{"label": household[:160], "grams": serving}] if household else []
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, url)),
        "name": str(row["description"])[:200],
        "brand": str(row.get("brandName") or row.get("brandOwner") or "")[:120] or None,
        "gtin_upc": str(row["gtinUpc"])[:32],
        "source": "USDA FoodData Central",
        "source_id": fdc_id,
        "source_url": url,
        "source_release": RELEASE,
        "source_data_type": "Branded",
        "serving_grams": 100,
        "portions": portions,
        "nutrient_values": values,
        "nutrient_definitions": list(definitions.values()),
        "calories": values["1008"],
        "protein_g": values["1003"],
        "carbs_g": values["1005"],
        "fat_g": values["1004"],
        "fiber_g": values.get("1079"),
        "sugar_g": values.get("2000", values.get("1063")),
        "saturated_fat_g": values.get("1258"),
        "sodium_mg": values.get("1093"),
        "potassium_mg": values.get("1092"),
    }


def main():
    archive_path = pathlib.Path("data/.branded.zip")
    if not archive_path.exists():
        request = urllib.request.Request(URL, headers={"User-Agent": "ArminiusNutritionCatalog/1.0"})
        with urllib.request.urlopen(request, timeout=180) as response, archive_path.open("wb") as output:
            while chunk := response.read(CHUNK):
                output.write(chunk)
    sha256 = hashlib.sha256()
    candidates = {term: {} for term in BRAND_TERMS}
    rows_seen = 0
    with archive_path.open("rb") as raw:
        for chunk in iter(lambda: raw.read(CHUNK), b""):
            sha256.update(chunk)
    with zipfile.ZipFile(archive_path) as archive:
        filename = next(name for name in archive.namelist() if name.endswith(".json"))
        with archive.open(filename) as stream:
            for row in records_from_archive(stream):
                rows_seen += 1
                haystack = " ".join(str(row.get(key) or "") for key in ("description", "brandName", "brandOwner")).casefold()
                terms = [term for term in BRAND_TERMS if term in haystack]
                if not terms:
                    continue
                food = normalize(row)
                if not food:
                    continue
                score = len(food["nutrient_values"]) * 100 + len(food["portions"])
                for term in terms:
                    bucket = candidates[term]
                    old = bucket.get(food["gtin_upc"])
                    if old is None or score > old[0] or (score == old[0] and food["source_release"] > old[1]["source_release"]):
                        bucket[food["gtin_upc"]] = (score, food)
                    if len(bucket) > PER_BRAND_LIMIT * 4:
                        keep = sorted(bucket.items(), key=lambda entry: (-entry[1][0], entry[1][1]["name"], entry[1][1]["source_id"]))[:PER_BRAND_LIMIT * 2]
                        candidates[term] = bucket = dict(keep)

    selected = []
    seen = set()
    for term in BRAND_TERMS:
        choices = sorted(candidates[term].values(), key=lambda pair: (-pair[0], pair[1]["name"], pair[1]["source_id"]))
        added = 0
        for _, food in choices:
            if food["gtin_upc"] in seen:
                continue
            seen.add(food["gtin_upc"])
            selected.append(food)
            added += 1
            if added >= PER_BRAND_LIMIT or len(selected) >= MAX_PRODUCTS:
                break
    selected.sort(key=lambda food: (food["name"].casefold(), food["source_id"]))
    definitions = {}
    for food in selected:
        for definition in food.pop("nutrient_definitions"):
            old = definitions.get(definition["id"])
            if old and old != definition:
                raise ValueError(f"USDA nutrient definition changed within archive: {definition['id']}")
            definitions[definition["id"]] = definition
    if not selected:
        raise ValueError("No matching branded foods found; review selection terms before importing")
    output = {
        "source_url": URL,
        "archive_sha256": sha256.hexdigest(),
        "release": RELEASE,
        "data_type": "Branded",
        "license": "CC0-1.0",
        "total_source_foods": rows_seen,
        "selection_terms": list(BRAND_TERMS),
        "foods": selected,
        "nutrient_definitions": sorted(definitions.values(), key=lambda item: item["id"]),
    }
    target = pathlib.Path("data/usda-branded-selected.json")
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Scanned {rows_seen} branded records; selected {len(selected)} items across {len(BRAND_TERMS)} product terms.")
    print("Top rows:", json.dumps([{"name": f["name"], "brand": f["brand"], "gtin_upc": f["gtin_upc"], "nutrients": len(f["nutrient_values"])} for f in selected[:12]], ensure_ascii=False))


if __name__ == "__main__":
    main()

