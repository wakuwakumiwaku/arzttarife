"""Offline tests. Tiny OOXML fixtures are parser structure, not tariff examples."""
import unittest
import importlib.util
import tempfile
import pathlib
import hashlib
import json
import zipfile
import sys
import os
import io
from contextlib import redirect_stdout, redirect_stderr
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

class OutputBoundaryTests(unittest.TestCase):
    # Only the source-conversion boundary is adapted. Exercise real main(),
    # argument parsing, output authorization, directory creation and file writes.
    catalog = {'positions': [], 'contexts': [], 'synthetic': 'PRIVATE TEST CANARY'}

    def invoke(self, root, output):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(IMP, 'ROOT', root), \
             patch.object(IMP, 'convert', return_value=self.catalog) as convert, \
             patch.object(sys, 'argv', ['import_catalog.py', '--output', str(output)]), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            try:
                IMP.main()
                code = 0
            except SystemExit as exc:
                code = exc.code
        return code, convert.call_count, stdout.getvalue(), stderr.getvalue()

    def assert_refused_without_write(self, root, output, exposed):
        previous = exposed.read_bytes() if exposed.exists() else None
        code, calls, _, stderr = self.invoke(root, output)
        after = exposed.read_bytes() if exposed.exists() else None
        print(json.dumps({'output': str(output.relative_to(root)),
                          'exit_code': code, 'conversion_calls': calls,
                          'public_or_external_bytes_changed': after != previous}))
        self.assertEqual(after, previous, 'private catalog must not be emitted into a public or external target')
        self.assertEqual(code, 2, 'unsafe output must be rejected by argparse')
        self.assertEqual(calls, 0, 'reject unsafe output before reading/converting private sources')
        self.assertIn('Output must be inside ignored', stderr)

    def test_symlinked_private_root_cannot_publish_into_public(self):
        for private in ('.local', 'sources'):
            with self.subTest(private=private), tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
                root = pathlib.Path(d)
                public = root / 'public'
                public.mkdir()
                (root / private).symlink_to(public, target_is_directory=True)
                self.assert_refused_without_write(root, root / private / 'catalog.json', public / 'catalog.json')

    def test_symlinked_private_root_cannot_write_outside_repository(self):
        for private in ('.local', 'sources'):
            with self.subTest(private=private), tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
                base = pathlib.Path(d)
                root, external = base / 'repo', base / 'external'
                root.mkdir()
                external.mkdir()
                (root / private).symlink_to(external, target_is_directory=True)
                self.assert_refused_without_write(root, root / private / 'catalog.json', external / 'catalog.json')

    def test_dangling_private_root_cannot_create_public_directory(self):
        for private in ('.local', 'sources'):
            with self.subTest(private=private), tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
                root = pathlib.Path(d)
                public = root / 'public'
                (root / private).symlink_to(public, target_is_directory=True)
                self.assert_refused_without_write(root, root / private / 'catalog.json', public / 'catalog.json')
                self.assertFalse(public.exists(), 'refused output must not even create its public parent')

    def test_nested_directory_and_file_symlinks_preserve_public_bytes(self):
        for private in ('.local', 'sources'):
            for file_link in (False, True):
                with self.subTest(private=private, file_link=file_link), tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
                    root = pathlib.Path(d)
                    public = root / 'public'
                    public.mkdir()
                    exposed = public / 'catalog.json'
                    exposed.write_bytes(b'UNCHANGED PUBLIC CANARY')
                    directory = root / private
                    directory.mkdir()
                    link = directory / ('catalog.json' if file_link else 'nested')
                    link.symlink_to(exposed if file_link else public, target_is_directory=not file_link)
                    self.assert_refused_without_write(root, link if file_link else link / 'catalog.json', exposed)

    def test_real_private_directories_accept_nested_and_normalized_paths(self):
        for private in ('.local', 'sources'):
            with self.subTest(private=private), tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
                root = pathlib.Path(d)
                output = pathlib.Path(private) / 'unused' / '..' / 'nested' / 'catalog.json'
                previous_cwd = pathlib.Path.cwd()
                try:
                    os.chdir(root)
                    code, calls, stdout, stderr = self.invoke(root, output)
                finally:
                    os.chdir(previous_cwd)
                self.assertEqual((code, calls, stderr), (0, 1, ''))
                payload = (root / output).resolve().read_bytes()
                self.assertEqual(json.loads(payload), self.catalog)
                self.assertEqual(json.loads(stdout)['sha256'], hashlib.sha256(payload).hexdigest())

    def test_private_aliases_stay_supported_but_direct_public_output_is_refused(self):
        with tempfile.TemporaryDirectory(prefix='arzttarife-output-') as d:
            root = pathlib.Path(d)
            (root / '.local').mkdir()
            (root / 'sources').symlink_to(root / '.local', target_is_directory=True)
            output = root / 'sources' / 'catalog.json'
            code, calls, _, stderr = self.invoke(root, output)
            self.assertEqual((code, calls, stderr), (0, 1, ''))
            self.assertEqual(json.loads(output.read_bytes()), self.catalog)
            self.assert_refused_without_write(root, root / 'public' / 'catalog.json', root / 'public' / 'catalog.json')


if __name__ == '__main__': unittest.main()
