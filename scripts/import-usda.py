"""Normalize a pinned public-domain USDA archive. No credentials or database writes."""
import base64
import hashlib
import io
import json
import math
import pathlib
import sys
import urllib.request
import uuid
import zipfile

URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip'
RELEASE = '2026-04-30'


def normalize(food):
    if not isinstance(food, dict) or not food.get('fdcId') or not food.get('description'):
        return None
    values = {}
    for row in food.get('foodNutrients', []):
        nutrient = row.get('nutrient', {})
        amount = row.get('amount')
        if isinstance(amount, (int, float)) and math.isfinite(amount) and amount >= 0:
            values[nutrient.get('id')] = amount
    def first(*ids):
        return next((values[i] for i in ids if i in values), None)
    nutrients = dict(calories=first(1008, 2048, 2047), protein_g=first(1003),
                     carbs_g=first(1005), fat_g=first(1004), fiber_g=first(1079),
                     sugar_g=first(2000, 1063), saturated_fat_g=first(1258),
                     sodium_mg=first(1093), potassium_mg=first(1092))
    if any(nutrients[key] is None for key in ('calories', 'protein_g', 'carbs_g', 'fat_g')):
        return None
    source_id = str(food['fdcId'])
    source_url = 'https://fdc.nal.usda.gov/food-details/' + source_id + '/nutrients'
    portions = []
    for p in food.get('foodPortions', []):
        grams = p.get('gramWeight')
        amount = p.get('amount', 1)
        unit = p.get('measureUnit', {}).get('name', '')
        description = p.get('portionDescription') or p.get('modifier') or ''
        if unit in ('undetermined', 'Quantity not specified'):
            unit = ''
        label = ' '.join(str(x) for x in (amount, unit, description) if x).strip()
        if isinstance(grams, (int, float)) and math.isfinite(grams) and 0 < grams <= 100000 and label:
            portion = dict(label=label[:160], grams=grams)
            if portion not in portions:
                portions.append(portion)
    return dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, source_url)),
                name=food['description'][:200], source='USDA FoodData Central',
                source_id=source_id, source_url=source_url, source_release=RELEASE,
                source_data_type='Foundation', serving_grams=100,
                portions=portions[:20], **nutrients)


if __name__ == '__main__':
    # Optional archive path permits fully offline, reproducible re-imports.
    raw = pathlib.Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        filename = next(n for n in archive.namelist() if n.endswith('.json'))
        source = json.loads(archive.read(filename))
    rows = next(v for v in source.values() if isinstance(v, list))
    foods = [f for row in rows if (f := normalize(row)) is not None]
    foods.sort(key=lambda f: (f['name'].casefold(), f['source_id']))
    assert len(foods) >= 100, 'Unexpectedly small source: inspect before importing'
    payload = dict(source_url=URL, archive_sha256=hashlib.sha256(raw).hexdigest(),
                   release=RELEASE, license='CC0-1.0', total_source_foods=len(rows), foods=foods)
    output = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
    pathlib.Path('usda-catalog.json').write_text(output + '\n', encoding='utf-8')
    print('Imported', len(foods), 'foods with complete energy/macros; omitted', len(rows)-len(foods), 'incomplete records')
    print('ARMINIUS_CATALOG_BASE64=' + base64.b64encode(output.encode()).decode())

