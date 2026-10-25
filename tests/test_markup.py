"""Cheap offline regression for the real content dropdown; no browser/package needed."""
from html.parser import HTMLParser
from pathlib import Path
import os
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ContentSelectParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.selects = []
        self.current_select = None
        self.current_option = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'select':
            self.current_select = {'attrs': attrs, 'options': []}
            if attrs.get('id') == 'view':
                self.selects.append(self.current_select)
        elif tag == 'option' and self.current_select is not None:
            self.current_option = {'attrs': attrs, 'text': '', 'closed': False}
            self.current_select['options'].append(self.current_option)

    def handle_data(self, data):
        if self.current_option is not None:
            self.current_option['text'] += data

    def handle_endtag(self, tag):
        if tag == 'option' and self.current_option is not None:
            self.current_option['closed'] = True
            self.current_option = None
        elif tag == 'select':
            self.current_select = None
            self.current_option = None


class ContentSelectTests(unittest.TestCase):
    def test_three_explicit_enabled_content_options(self):
        # The override binds identical final test bytes to an immutable OLD index.
        source = Path(os.environ.get('TARIFF_INDEX_FILE', ROOT / 'index.html'))
        parser = ContentSelectParser()
        parser.feed(source.read_text(encoding='utf-8'))
        parser.close()
        self.assertEqual(len(parser.selects), 1, 'Exactly one real #view select')
        select = parser.selects[0]
        options = select['options']
        self.assertEqual(
            [option['attrs'].get('value') for option in options],
            ['reference', 'positions', 'contexts'],
            'The native dropdown must expose the positions view, not only its text',
        )
        self.assertNotIn('disabled', select['attrs'])
        self.assertEqual(
            [option['text'].strip() for option in options],
            ['Regeln & Quellen (öffentlich)', 'Tarifpositionen (lokaler Import)',
             'Begleittabellen (lokaler Import)'],
        )
        for option in options:
            with self.subTest(value=option['attrs']['value']):
                self.assertNotIn('disabled', option['attrs'])
                self.assertTrue(option['closed'], 'Each option is explicitly closed')


if __name__ == '__main__':
    unittest.main()
