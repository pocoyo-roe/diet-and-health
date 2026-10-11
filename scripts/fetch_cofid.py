"""Download McCance and Widdowson's CoFID spreadsheet from gov.uk.

Usage: python fetch_cofid.py OUT.xlsx
"""
import re
import sys
import urllib.request

PAGE = "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "diet-and-health-builder"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


html = get(PAGE).decode("utf-8", "replace")
links = sorted(set(re.findall(r'href="(https://assets\.publishing\.service\.gov\.uk/[^"]+\.xlsx)"', html)))
print("xlsx links found:", *links, sep="\n  ")
link = next((l for l in links if "integrated" in l.lower() or "cofid" in l.lower()), links[0] if links else None)
if not link:
    sys.exit("No .xlsx link found on " + PAGE)
print("downloading", link)
open(sys.argv[1], "wb").write(get(link))
