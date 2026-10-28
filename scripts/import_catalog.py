"""Convert the two hash-pinned official workbooks for PRIVATE local use only.
No network, no public output. Raw source strings remain literal (OOXML CR escapes decoded).
"""
from __future__ import annotations
from pathlib import Path
from zipfile import ZipFile
from decimal import Decimal, ROUND_HALF_UP
import xml.etree.ElementTree as ET
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
PINS = json.loads((ROOT / 'scripts/source-pins.json').read_text())
COUNTS = {'tardoc': 1388, 'pauschalen': 314}
PATTERNS = {'tardoc': r'[A-Z]{2}\.[0-9]{2}\.[0-9]{4}', 'pauschalen': r'C[0-9]{2}\.[0-9]{2}[A-Z]'}

def text(value):
    return value.replace('_x000D_', '\r')

def workbook(path):
    with ZipFile(path) as z:
        if len(z.infolist()) > 2000 or sum(i.file_size for i in z.infolist()) > 40_000_000:
            raise ValueError('Workbook archive exceeds safe limits')
        def xml(name):
            raw = z.read(name)
            if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
                raise ValueError('DTD/entities not accepted')
            return ET.fromstring(raw)
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(t.text or '' for t in n.iterfind('.//m:t', NS)) for n in xml('xl/sharedStrings.xml').findall('m:si', NS)]
        rels = {r.attrib['Id']: r.attrib['Target'].lstrip('/') for r in xml('xl/_rels/workbook.xml.rels')}
        for s in xml('xl/workbook.xml').findall('m:sheets/m:sheet', NS):
            target = rels[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            if not target.startswith('xl/'):
                target = 'xl/' + target
            if '..' in target.split('/'):
                raise ValueError('Unsafe sheet target')
            rows = []
            for row in xml(target).findall('m:sheetData/m:row', NS):
                cells = {}
                for c in row.findall('m:c', NS):
                    ref = c.attrib['r']
                    col = re.sub(r'[0-9]+$', '', ref)
                    v = c.find('m:v', NS)
                    raw = v.text or '' if v is not None else ''.join(t.text or '' for t in c.findall('m:is//m:t', NS))
                    if c.attrib.get('t') == 's':
                        raw = shared[int(raw)]
                    if raw:
                        cells[col] = text(raw)
                if cells:
                    rows.append({'row': int(row.attrib['r']), 'cells': cells})
            yield s.attrib['name'], rows

def amount(raw):
    if not raw:
        return {'kind': 'missing', 'raw': ''}
    normalized = raw.replace("'", '')
    if re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', normalized):
        d = Decimal(normalized)
        # OAAT release notes define the public calculation/display basis at 2dp.
        # The acquired XLSX nevertheless contains long raw values: preserve them,
        # apply the declared 2dp policy explicitly, never silently discard them.
        rounded = d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if d > 1_000_000:
            raise ValueError('Unexpected range in published taxpoints: ' + raw)
        return {'kind': 'numeric', 'decimal': format(rounded, '.2f'), 'raw': raw}
    return {'kind': 'open', 'raw': raw}

def convert(source_dir):
    result = {'app': 'arzttarife.local-catalog', 'version': 1, 'edition': '2026-1.4c-1.1c', 'sources': [], 'positions': [], 'contexts': []}
    for mode in ('tardoc', 'pauschalen'):
        pin = next(p for p in PINS if p['file'] == mode + '.xlsx')
        file = source_dir / pin['file']
        raw = file.read_bytes()
        if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
            raise ValueError('Source hash/size differs: ' + pin['file'] + '. No silent version upgrade.')
        result['sources'].append({'id': mode, 'sha256': pin['sha256']})
        count = 0
        for name, rows in workbook(file):
            if name != ('Tarifpositionen' if mode == 'tardoc' else 'Tarifkatalog'):
                result['contexts'].append({'id': mode + ':' + name, 'mode': mode, 'sheet': name, 'rows': rows})
                continue
            headers = next(r['cells'] for r in rows if r['row'] == 5)
            group = ''
            for r in rows:
                cells = r['cells']; code = cells.get('B', '')
                if not re.fullmatch(PATTERNS[mode], code):
                    if r['row'] > 7 and code and mode == 'pauschalen':
                        group = code
                    continue
                count += 1
                amounts = {'al': amount(cells.get('E', '')), 'ipl': amount(cells.get('F', ''))} if mode == 'tardoc' else {'points': amount(cells.get('E', ''))}
                result['positions'].append({
                    'id': mode + ':' + code, 'mode': mode, 'code': code,
                    'title': cells.get('C', ''), 'interpretation': cells.get('D', ''),
                    'amounts': amounts, 'chapter': cells.get('K', '') if mode == 'tardoc' else group,
                    'parent': cells.get('J', '') if mode == 'tardoc' else '',
                    'fields': [{'name': headers.get(col, col).strip(), 'text': val} for col, val in cells.items() if col not in ('B', 'C', 'D', 'E', 'F') or mode == 'pauschalen' and col == 'F'],
                    'source': {'id': mode, 'sheet': name, 'row': r['row']}
                })
        if count != COUNTS[mode]:
            raise ValueError(f'Expected {COUNTS[mode]} {mode} positions, got {count}')
    ids = [p['id'] for p in result['positions']]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate position IDs')
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sources', type=Path, default=ROOT / 'sources')
    p.add_argument('--output', type=Path, default=ROOT / '.local/catalog.json')
    args = p.parse_args()
    output = args.output.resolve()
    # Never emit protected catalog material into a publishable tree.
    # Resolve the requested target, not the allowlist directories: resolving
    # .local/ or sources/ would let a symlink authorize a public/external tree.
    if not any(output.is_relative_to(ROOT.resolve() / d) for d in ('.local', 'sources')):
        p.error('Output must be inside ignored .local/ or sources/. Never publish the local catalog.')
    catalog = convert(args.sources)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    output.write_bytes(payload)
    print(json.dumps({'positions': len(catalog['positions']), 'byMode': COUNTS, 'contextSheets': len(catalog['contexts']), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}, ensure_ascii=False))
if __name__ == '__main__':
    main()
