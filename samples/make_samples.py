"""Generate the messy sample files for the UZBL portal demo.

All people, schools and serials are fictional ("Pinecrest Valley USD (Demo)").
The serials line up with the demo inventory in src/shared/inventory.ts, and each
row is built to trigger one pre-check (see the `# ->` comments).

Run:  python3 samples/make_samples.py
"""

import csv
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "samples"

HEADERS = ["Kid", "S/N", "Asset #", "Model?", "what happened", "When", "Where", "case on?", "Ship to", "Notes"]

ROWS = [
    # -> GetCover claim: accidental, in case, covered by UZBL warranty
    ["Jaden M.", "PF3XK2L9", "PVH-10432", "Lenovo 300e", "dropped it off the bleachers, screen cracked in the corner", "10/3", "gym", "yes", "", ""],
    # -> GetCover claim: liquid damage, in case
    ["Sofia R.", "PF3XK2M1", "PVH-10433", "lenovo 300e yoga", "spilled gatorade on the keyboard, keys sticky now", "Oct 7th", "cafeteria", "y", "", ""],
    # -> OEM warranty (Lenovo): defect, no accident
    ["Marcus T.", "PF2ZQ8K4", "PVH-10377", "Lenovo 100e", "screen just went black on its own, no drop", "last Tuesday", "room 204", "yes", "", "worked fine friday"],
    # -> serial typo: not in inventory (closest match PF3XK2N1)
    ["Emma L.", "PF3XK2N7", "PVH-10434", "Lenovo 300e", "hinge snapped when she opened it", "10/14", "library", "yes", "", ""],
    # -> intentional damage: warranty excludes it, suggest a Break-Fix credit
    ["Liam K.", "5CD2341KPQ", "PVH-30021", "HP 11 G9", "kid threw it across the hallway during a fight", "10/9", "hallway", "no", "", "admin has incident report"],
    # -> likely GetCover denial: not in case, suggest a Break-Fix credit
    ["Ava P.", "PF3XK2P5", "PVH-10440", "Lenovo 300e", "dog knocked it off the counter at home", "Oct 12", "home", "case was off", "", ""],
    # -> missing what happened
    ["Noah B.", "PF3XK2Q2", "PVH-10441", "Lenovo 300e", "", "10/15", "", "", "", "broken"],
    # -> duplicate serial (same device as row 1)
    ["Mia W.", "PF3XK2L9", "PVH-10432", "Lenovo 300e", "same one as above, charger port is loose too", "10/16", "gym", "yes", "", ""],
    # -> BER risk: 3rd repair on this device
    ["Ethan G.", "PF3XK2R8", "PVH-10442", "Lenovo 300e", "screen cracked again (3rd time this year)", "10/16", "bus", "yes", "", ""],
    # -> not covered: offer Break-Fix credits by card
    ["Olivia H.", "C02FK3XYQ6L4", "PVH-40007", "MacBook Air", "won't charge, battery looks swollen", "10/11", "art room", "yes", "", ""],
    # -> PO Box ship-to: FedEx can't deliver, blocking
    ["Lucas D.", "PF3XK2S3", "PVH-10443", "Lenovo 300e", "keys popped off, he keeps picking at them", "10/17", "room 112", "yes", "PO Box 1187, Pinecrest CO 80999", "send back to district office"],
    # -> GetCover claim: accidental, in case
    ["Chloe S.", "PF4AB7T2", "PVH-10450", "Lenovo 500e", "cracked screen, crushed in her backpack", "yesterday", "home", "yes", "", ""],
    # -> Break-Fix credit: covered by credits, non-touch
    ["Henry V.", "5CD2341KR2", "PVH-30025", "HP 11 G9", "charging port loose, only charges at an angle", "10/13", "room 118", "?", "", ""],
    # -> lost/stolen: not a repair
    ["Grace N.", "PF3XK2T6", "PVH-10444", "Lenovo 300e", "stolen out of her locker", "10/8", "locker room", "n/a", "", "police report filed"],
]


def make_xlsx():
    wb = Workbook()
    ws = wb.active
    ws.title = "Oct repairs"
    ws["A1"] = "PINECREST HS TECH REPAIR LIST - DO NOT DELETE!!"
    ws["A1"].font = Font(bold=True, size=14, color="C00000")
    ws.merge_cells("A1:F1")
    ws["H1"] = "updated by Ms. Whitfield"
    ws.append([])
    ws.append(HEADERS)
    for cell in ws[3]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="FFF2CC")
    for row in ROWS:
        ws.append(row)
    ws.append([])
    ws.append(["TOTAL", "14 devices"])
    widths = [11, 15, 11, 16, 48, 12, 12, 12, 32, 26]
    for i, width in enumerate(widths):
        ws.column_dimensions[chr(65 + i)].width = width
    for row in ws.iter_rows(min_row=4):
        for cell in row:
            cell.alignment = Alignment(wrap_text=True, vertical="top")

    notes = wb.create_sheet("how to fill this out")
    notes["A1"] = "put the kid's name, serial on the bottom of the chromebook, and what happened."
    notes["A2"] = "Ask Dana if you're not sure. DON'T sort the sheet."

    wb.save(OUT / "pinecrest-repairs-oct.xlsx")


def make_csv():
    rows = [
        ["Serial Number", "Device", "Problem", "Date Reported", "Teacher", "Notes"],
        ["PF4AB7U9", "Lenovo 500e", "Screen has a big crack, student dropped it in the hallway", "10/20/2026", "Mr. Okafor", "was in the blue UZBL case"],
        ["PF4AB7V3", "Lenovo 500e", "Kid spilled water on it, now it won't turn on", "10/21/2026", "Mr. Okafor", ""],
        ["5CD2341KS7", "HP Chromebook 11 G9 EE", "Trackpad doesn't click", "10/21/2026", "Ms. Alvarez", "non-touch"],
        ["PF2ZQ8L6", "Lenovo 100e Gen 4", "Stopped charging, no damage", "10/22/2026", "Ms. Alvarez", ""],
        ["PF4AB7W1", "Lenovo 500e", "", "10/22/2026", "Mr. Okafor", "pls fix asap"],
        ["PF4AB7X8", "Lenovo 500e", "Hinge cracked, \"it just broke\" per student", "10/22/2026", "Coach Reyes", "return to: P.O. Box 22, Pinecrest CO 80999"],
    ]
    with open(OUT / "pinecrest-repairs.csv", "w", newline="") as f:
        csv.writer(f).writerows(rows)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_xlsx()
    make_csv()
    print("wrote", sorted(p.name for p in OUT.iterdir()))
