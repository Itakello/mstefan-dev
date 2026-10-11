import copy
import unittest

from refresh_notion import DATASETS, Notion, NotionError


def text(value):
    return [{'type': 'text', 'text': {'content': value}, 'annotations': {}}] if value else []


class Fake:
    def __init__(self):
        self.schemas, self.pages, self.calls = {}, {}, []
        self.failure = None
        self.counter = 0
        for name, source, target, source_db, target_db, _ in DATASETS:
            schema = {'Name': {'type': 'title'}, 'Summary' if name == 'Projects' else 'Icon key': {'type': 'rich_text'}}
            if name == 'Projects':
                schema['Status'] = {'type': 'select', 'select': {'options': [{'name': 'Added'}]}}
            for ds, db in ((source, source_db), (target, target_db)):
                self.schemas[ds] = {'id': ds, 'parent': {'database_id': db}, 'properties': copy.deepcopy(schema)}
            self.add(source, name + ' A', 'fresh')
            self.add(source, name + ' B', '')
            self.add(target, name + ' A', 'old')
            self.add(target, name + ' stale', 'experiment')

    def add(self, ds, name, description):
        self.counter += 1
        props = {}
        for key, definition in self.schemas[ds]['properties'].items():
            kind = definition['type']
            value = text(name) if kind == 'title' else text(description) if kind == 'rich_text' else {'name': 'Added'}
            props[key] = {'type': kind, kind: value}
        page = {'id': 'page-' + str(self.counter), 'parent': {'data_source_id': ds},
                'properties': props, 'in_trash': False}
        self.pages[page['id']] = page
        return page

    def request(self, role, method, path, body=None):
        self.calls.append((role, method, path, copy.deepcopy(body)))
        if self.failure and self.failure(role, method, path, body):
            self.failure = None
            raise TimeoutError('injected transport failure')
        if path.startswith('/data_sources/'):
            ds = path.split('/')[2]
            if method == 'GET':
                return copy.deepcopy(self.schemas[ds])
            pages = [p for p in self.pages.values() if p['parent']['data_source_id'] == ds and not p['in_trash']]
            offset = int((body or {}).get('start_cursor', '0'))
            # Every query paginates, including rollback verification.
            result = pages[offset:offset + 1]
            more = offset + 1 < len(pages)
            return {'results': copy.deepcopy(result), 'has_more': more,
                    'next_cursor': str(offset + 1) if more else None}
        if method == 'POST':
            ds = body['parent']['data_source_id']
            self.counter += 1
            page = {'id': 'created-' + str(self.counter), 'parent': {'data_source_id': ds},
                    'in_trash': False, 'properties': {}}
            for key, value in body['properties'].items():
                kind = next(iter(value))
                page['properties'][key] = {'type': kind, **copy.deepcopy(value)}
            self.pages[page['id']] = page
            return copy.deepcopy(page)
        page = self.pages[path.split('/')[2]]
        if method == 'PATCH':
            if 'properties' in body:
                for key, value in body['properties'].items():
                    page['properties'][key] = {'type': next(iter(value)), **copy.deepcopy(value)}
            if 'in_trash' in body:
                page['in_trash'] = body['in_trash']
        return copy.deepcopy(page)


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.notion = Notion(self.fake.request)
        self.state, self.saved = {}, []

    def save(self):
        self.saved.append(copy.deepcopy(self.state))

    def fail_after(self, predicate):
        original = self.fake.request
        failed = False
        def request(role, method, path, body=None):
            nonlocal failed
            result = original(role, method, path, body)
            if not failed and predicate(method, path, body):
                failed = True
                raise TimeoutError('server accepted mutation before connection loss')
            return result
        self.notion.request = request

    def test_paginated_create_update_clear_trash_and_exact_rollback(self):
        # A matched row must have its old scalar explicitly cleared.
        ds = DATASETS[0][2]
        self.fake.add(ds, 'Projects B', 'must clear')
        before = copy.deepcopy(self.fake.pages)
        plan = self.notion.plan()
        self.assertEqual(plan['summary']['Projects'], {'source': 2, 'target': 3, 'create': 0, 'trash': 1, 'update': 2})
        self.notion.apply(plan, self.state, self.save)
        self.assertTrue(self.state['notion']['applied'])
        self.assertTrue(any(s['notion']['pending'] for s in self.saved))
        cleared = next(p for p in self.fake.pages.values() if p['parent']['data_source_id'] == ds and p['properties']['Name']['title'] == text('Projects B'))
        self.assertEqual(cleared['properties']['Summary']['rich_text'], [])
        self.notion.rollback(self.state, self.save)
        self.assertTrue(self.state['notion']['rolled_back'])
        for page_id, page in before.items():
            self.assertEqual(self.fake.pages[page_id], page)
        for row in self.state['notion']['created']:
            self.assertTrue(self.fake.pages[row['id']]['in_trash'])
        self.assertFalse(any(role == 'source' and (method == 'PATCH' or path == '/pages') for role, method, path, _ in self.fake.calls))

    def test_duplicate_names_refused_in_source_and_target(self):
        for ds in (DATASETS[0][1], DATASETS[0][2]):
            with self.subTest(ds=ds):
                fake = Fake()
                fake.add(ds, 'Projects A', 'duplicate')
                with self.assertRaisesRegex(NotionError, 'duplicate'):
                    Notion(fake.request).plan()

    def test_schema_and_database_parent_refused(self):
        for change in ('type', 'options', 'parent'):
            with self.subTest(change=change):
                fake = Fake()
                schema = fake.schemas[DATASETS[0][2]]
                if change == 'parent':
                    schema['parent']['database_id'] = DATASETS[0][3]
                elif change == 'type':
                    schema['properties']['Summary']['type'] = 'relation'
                else:
                    schema['properties']['Status']['select']['options'] = []
                with self.assertRaises(NotionError):
                    Notion(fake.request).plan()

    def test_scalar_nulls_and_empty_multiselect_clear_existing_values(self):
        source, target = DATASETS[0][1:3]
        fields = {'URL': ('url', 'https://mstefan.dev', None),
                  'Year': ('number', 2026, None),
                  'Type': ('select', {'name': 'Web'}, None),
                  'Tags': ('multi_select', [{'name': 'Web'}], [])}
        for ds in (source, target):
            for name, (kind, old, empty) in fields.items():
                definition = {'type': kind}
                if kind in ('select', 'multi_select'):
                    definition[kind] = {'options': [{'name': 'Web'}]}
                self.fake.schemas[ds]['properties'][name] = definition
                for page in self.fake.pages.values():
                    if page['parent']['data_source_id'] == ds:
                        page['properties'][name] = {'type': kind, kind: copy.deepcopy(empty if ds == source else old)}
        plan = self.notion.plan()
        self.notion.apply(plan, self.state, self.save)
        self.notion.rollback(self.state, self.save)
        self.assertTrue(self.state['notion']['rolled_back'])

    def test_richtext_links_annotations_preserved_and_read_metadata_removed(self):
        rich = next(iter(self.fake.pages.values()))['properties']['Summary']['rich_text'][0]
        rich['text']['link'] = {'url': 'https://mstefan.dev'}
        rich['annotations'] = {'bold': True, 'italic': False, 'strikethrough': False,
                               'underline': False, 'code': False, 'color': 'default'}
        rich.update(plain_text='fresh', href='https://mstefan.dev')
        plan = self.notion.plan()
        expected = plan['datasets'][0]['source']['Projects A']['properties']['Summary']['rich_text'][0]
        self.assertNotIn('plain_text', expected)
        self.assertNotIn('href', expected)
        self.assertEqual(expected['text']['link'], rich['text']['link'])
        self.assertEqual(expected['annotations'], rich['annotations'])
        self.notion.apply(plan, self.state, self.save)

    def test_source_write_guard(self):
        for method, path in (('PATCH', '/pages/x'), ('POST', '/pages'), ('DELETE', '/data_sources/x')):
            with self.assertRaises(NotionError):
                self.notion._request('source', method, path)
        self.assertEqual(self.fake.calls, [])

    def test_wrong_page_parent_at_mutation_is_refused(self):
        plan = self.notion.plan()
        page_id = plan['datasets'][0]['target']['Projects A']['id']
        original = self.fake.request
        def request(role, method, path, body=None):
            result = original(role, method, path, body)
            if method == 'GET' and path == '/pages/' + page_id:
                result['parent']['data_source_id'] = DATASETS[0][1]
            return result
        self.notion.request = request
        with self.assertRaisesRegex(NotionError, 'page parent'):
            self.notion.apply(plan, self.state, self.save)
        self.assertFalse(any(call[1] == 'PATCH' for call in self.fake.calls))

    def test_update_and_trash_timeouts_recover_originals(self):
        for mutation in ('update', 'trash'):
            with self.subTest(mutation=mutation):
                self.setUp()
                plan = self.notion.plan()
                originals = copy.deepcopy(self.fake.pages)
                self.fail_after(lambda method, path, body: method == 'PATCH' and (('properties' in body) if mutation == 'update' else body.get('in_trash') is True))
                with self.assertRaises(TimeoutError):
                    self.notion.apply(plan, self.state, self.save)
                self.assertEqual(self.saved[-1], self.state)
                self.assertIsNotNone(self.state['notion']['pending'])
                self.notion.rollback(self.state, self.save)
                for page_id, page in originals.items():
                    self.assertEqual(self.fake.pages[page_id], page)

    def test_unknown_create_timeout_keeps_durable_intent_and_refuses_recovery(self):
        plan = self.notion.plan()
        self.fail_after(lambda method, path, body: method == 'POST' and path == '/pages')
        with self.assertRaises(TimeoutError):
            self.notion.apply(plan, self.state, self.save)
        self.assertEqual(self.saved[-1], self.state)
        self.assertIsNone(self.state['notion']['pending']['page_id'])
        calls = len(self.fake.calls)
        with self.assertRaisesRegex(NotionError, 'Unknown creation'):
            self.notion.rollback(self.state, self.save)
        self.assertEqual(len(self.fake.calls), calls)

    def test_created_id_persisted_before_verification_failure(self):
        plan = self.notion.plan()
        self.fake.failure = lambda role, method, path, body: method == 'GET' and path.startswith('/pages/created-')
        with self.assertRaises(TimeoutError):
            self.notion.apply(plan, self.state, self.save)
        self.assertEqual(self.saved[-1], self.state)
        self.assertEqual(self.state['notion']['pending']['page_id'], self.state['notion']['created'][0]['id'])
        self.notion.rollback(self.state, self.save)
        self.assertTrue(self.fake.pages[self.state['notion']['created'][0]['id']]['in_trash'])

    def test_incomplete_or_nontext_richtext_refused(self):
        for data in ([{'type': 'mention'}], text('x') * 25):
            fake = Fake()
            next(iter(fake.pages.values()))['properties']['Summary']['rich_text'] = data
            with self.assertRaises(NotionError):
                Notion(fake.request).plan()

    def test_cursor_cycle_refused(self):
        original = self.fake.request
        def request(role, method, path, body=None):
            if path.endswith('/query'):
                return {'results': [], 'has_more': True, 'next_cursor': 'same'}
            return original(role, method, path, body)
        self.notion.request = request
        with self.assertRaisesRegex(NotionError, 'cursor'):
            self.notion.plan()


if __name__ == '__main__':
    unittest.main()
