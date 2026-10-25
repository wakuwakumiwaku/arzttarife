"""Offline tests. Tiny OOXML fixtures are parser structure, not tariff examples."""
import unittest
import importlib.util
import tempfile
import pathlib
import hashlib
import json
import zipfile
import sys
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m
IMP = load('arzttarife_import', ROOT / 'scripts/import_catalog.py')
ACQ = load('arzttarife_acquire', ROOT / 'scripts/acquire_sources.py')

class ImportTests(unittest.TestCase):
    def test_amount_types_and_explicit_rounding(self):
        self.assertEqual(IMP.amount(''), {'kind':'missing','raw':''})
        self.assertEqual(IMP.amount('unbewertet'), {'kind':'open','raw':'unbewertet'})
        self.assertEqual(IMP.amount("3'005.08"), {'kind':'numeric','decimal':'3005.08','raw':"3'005.08"})
        self.assertEqual(IMP.amount('10.564307888454852')['decimal'], '10.56')
        self.assertEqual(IMP.amount('1.005')['decimal'], '1.01')
        self.assertEqual(IMP.amount('0')['decimal'], '0.00')
        with self.assertRaises(ValueError): IMP.amount('1000001')

    def test_hash_failure_precedes_parsing(self):
        with tempfile.TemporaryDirectory(prefix='arzttarife-import-') as d:
            path = pathlib.Path(d)
            (path / 'tardoc.xlsx').write_bytes(b'not a workbook')
            with self.assertRaisesRegex(ValueError, 'hash/size'):
                IMP.convert(path)

    def test_inline_shared_unicode_and_exact_literals(self):
        with tempfile.TemporaryDirectory(prefix='arzttarife-xml-') as d:
            file = pathlib.Path(d) / 'structure.xlsx'
            ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
            with zipfile.ZipFile(file,'w') as z:
                z.writestr('xl/workbook.xml',f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Structure" sheetId="1" r:id="r1"/></sheets></workbook>')
                z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
                z.writestr('xl/sharedStrings.xml',f'<sst xmlns="{ns}"><si><r><t>Ä</t></r><r><t>rztlich</t></r></si></sst>')
                z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="{ns}"><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>00.0010</t></is></c><c r="C1" t="s"><v>0</v></c><c r="D1" t="inlineStr"><is><t>A_x000D_\nB</t></is></c></row></sheetData></worksheet>')
            name, rows = list(IMP.workbook(file))[0]
            self.assertEqual(name,'Structure')
            self.assertEqual(rows[0]['cells'],{'B':'00.0010','C':'Ärztlich','D':'A\r\nB'})

    def test_acquisition_mismatch_preserves_previous_original(self):
        class Response:
            url='https://oaat-otma.ch/checked';headers={'Content-Type':'application/octet-stream'}
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,n): return b'changed source'
        pin={'file':'original.xlsx','url':'https://oaat-otma.ch/checked','bytes':3,'sha256':hashlib.sha256(b'old').hexdigest()}
        with tempfile.TemporaryDirectory(prefix='arzttarife-acquire-') as d:
            target=pathlib.Path(d);(target/'original.xlsx').write_bytes(b'old')
            with patch.object(ACQ,'urlopen',return_value=Response()):
                with self.assertRaisesRegex(ValueError,'Source changed'): ACQ.acquire(pin,target)
            self.assertEqual((target/'original.xlsx').read_bytes(),b'old')
            self.assertEqual((target/'original.xlsx.unrecognized').read_bytes(),b'changed source')
            self.assertTrue((target/'original.xlsx.unrecognized.meta.json').exists())

    @unittest.skipUnless((ROOT/'sources/tardoc.xlsx').exists() and (ROOT/'sources/pauschalen.xlsx').exists(), 'Originals intentionally absent in public checkout; parser/hash tests still run')
    def test_real_pinned_workbooks_complete_and_reproducible(self):
        c=IMP.convert(ROOT/'sources')
        self.assertEqual(len(c['positions']),1702)
        self.assertEqual(len(c['contexts']),9)
        self.assertEqual(sum(p['mode']=='tardoc' for p in c['positions']),1388)
        self.assertEqual(sum(p['mode']=='pauschalen' for p in c['positions']),314)
        by_id={p['id']:p for p in c['positions']}
        self.assertEqual(by_id['tardoc:AA.00.0010']['amounts']['al']['decimal'],'10.56')
        self.assertEqual(by_id['tardoc:AA.30.0050']['amounts']['al']['kind'],'missing')
        self.assertEqual(by_id['pauschalen:C90.03Z']['amounts']['points']['kind'],'open')
        data=(json.dumps(c,ensure_ascii=False,separators=(',',':'))+'\n').encode()
        profile=json.loads((ROOT/'public/data/local-profile.json').read_text())
        self.assertEqual(hashlib.sha256(data).hexdigest(),profile['sha256'])
        self.assertEqual(len(data),profile['bytes'])

if __name__ == '__main__': unittest.main()
