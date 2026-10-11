"""Convert McCance and Widdowson's CoFID 2021 spreadsheet into data/cofid.js.

Usage: python build_cofid.py cofid.xlsx data/cofid.js

Nutrients that the app tracks are keyed by USDA nutrient number so UK and
USDA foods share one nutrient model; everything else is keyed "c:<CoFID code>".
All values are per 100 g of food (alcoholic drinks: per 100 ml).
"""
import json
import os
import re
import sys

import openpyxl

# sheet -> default deep-dive group
SHEETS = {
    "1.3 Proximates": "proximates",
    "1.4 Inorganics": "minerals",
    "1.5 Vitamins": "vitamins",
    "1.6 Vitamin Fractions": "vitamins",
    "1.8 (SFA per 100gFood)": "lipids",
    "1.10 (MUFA per 100gFood)": "lipids",
    "1.12 (PUFA per 100gFood)": "lipids",
    "1.13 Phytosterols": "lipids",
    "1.14 Organic Acids": "other",
}

# CoFID code -> USDA nutrient number
USDA = {
    "WATER": "255", "PROT": "203", "FAT": "204", "CHO": "205", "KCALS": "208", "KJ": "268",
    "STAR": "209", "TOTSUG": "269", "GLUC": "211", "GALACT": "287", "FRUCT": "212",
    "SUCR": "210", "MALT": "214", "LACT": "213", "ALCO": "221", "AOACFIB": "291",
    "SATFOD": "606", "MONOFOD": "645", "POLYFOD": "646", "FODTRANS": "605", "CHOL": "601",
    "NA": "307", "K": "306", "CA": "301", "MG": "304", "P": "305", "FE": "303", "CU": "312",
    "ZN": "309", "MN": "315", "SE": "317", "I": "314",
    "RET": "319", "RETEQU": "320", "VITD": "328", "VITE": "323", "VITK1": "430",
    "THIA": "404", "RIBO": "405", "NIAC": "406", "VITB6": "415", "VITB12": "418",
    "FOLT": "417", "PANTO": "410", "BIOT": "416", "VITC": "401",
    "BCAR": "321", "ACAR": "322", "CRYPT": "334", "LYCO": "337", "LUT": "338", "VITD3": "326",
    "FOD18:2": "618", "FOD18:2cn6": "675", "FOD18:3": "619", "FOD18:3cn3": "851",
    "FOD20:5cn3": "629", "FOD22:5cn3": "631", "FOD22:6cn3": "621",
}
SUGARS = {"STAR", "OLIGO", "TOTSUG", "GLUC", "GALACT", "FRUCT", "SUCR", "MALT", "LACT"}
OTHER = {"ALCO"}

UNIT_RE = re.compile(r"\s*\(([^()]*)\)\s*$")


def split_header(h):
    h = (h or "").strip()
    m = UNIT_RE.search(h)
    unit = m.group(1).strip() if m else ""
    name = UNIT_RE.sub("", h) if m else h
    name = re.sub(r"\s*/\s*100\s*g?\s*food\b", "", name, flags=re.I).strip()
    return name, {"ug": "µg", "kj": "kJ"}.get(unit.lower(), unit)


def parse_value(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s.lower() == "tr":
        return 0.0  # trace
    try:
        return float(s)
    except ValueError:
        return None  # "N" (present, not measured) and blanks


def main(src, out):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    nutrients = []  # [key, name, unit, group]
    index = {}
    foods = {}  # code -> {name, values{idx: v}}
    order = []
    for sheet, group in SHEETS.items():
        rows = list(wb[sheet].iter_rows(values_only=True))
        headers, codes = rows[0], rows[1]
        cols = []
        for c in range(7, len(headers)):
            code = codes[c] if c < len(codes) else None
            if not code or not headers[c]:
                continue
            code = str(code).strip()
            name, unit = split_header(str(headers[c]))
            if "/100g fa" in str(headers[c]).lower() or "per 100g fatty acid" in name.lower():
                continue  # per-100 g-fatty-acid columns; we only want per 100 g food
            key = USDA.get(code, "c:" + code)
            if key in index:
                continue
            g = "sugars" if code in SUGARS else "other" if code in OTHER else group
            if sheet == "1.3 Proximates" and ("FA" in code or "FOD" in code or code == "CHOL"):
                g = "lipids"
            index[key] = len(nutrients)
            nutrients.append([key, name, unit, g])
            cols.append((c, index[key]))
        for row in rows[3:]:
            if not row or not row[0] or not row[1]:
                continue
            code = str(row[0]).strip()
            food = foods.get(code)
            if food is None:
                food = foods[code] = {"name": str(row[1]).strip(), "values": {}}
                order.append(code)
            for c, idx in cols:
                v = parse_value(row[c] if c < len(row) else None)
                if v is not None:
                    food["values"][idx] = round(v, 4)
    packed = []
    for code in order:
        f = foods[code]
        flat = []
        for idx in sorted(f["values"]):
            flat += [idx, f["values"][idx]]
        packed.append([code, f["name"], flat])
    data = {
        "source": "McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (OHID). "
                  "Contains public sector information licensed under the Open Government Licence v3.0.",
        "nutrients": nutrients,
        "foods": packed,
    }
    text = "window.COFID = " + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";\n"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"{len(packed)} foods, {len(nutrients)} nutrients, {len(text) / 1e6:.2f} MB -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
