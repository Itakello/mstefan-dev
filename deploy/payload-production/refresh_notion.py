"""Bounded, attended Notion reconciliation; no credentials or HTTP transport.

plan() is private recovery data. Persist it only in the private run journal.
state['notion'] contains plan, created [{id, data_source_id}], touched [id],
pending (mutation intent or None), applied and rolled_back. save() must persist
state atomically before returning. A pending create without a recorded page ID
requires operator reconciliation; never repeat it or guess which page to trash.
"""
from copy import deepcopy


DATASETS = (
    ('Projects', '24c05536-223f-8010-8423-000b87dc6df2',
     '0c8ae339-7f21-4c12-bd06-74a3fbd0d7d5',
     '24c05536223f80a09016d368aa7e2cb8', '3191aa9d08224689a2d5156d7249cfcb',
     ('Name', 'Status', 'Type', 'Summary', 'Summary IT', 'Short summary',
      'Short summary IT', 'Publication', 'Publication IT', 'URL', 'Website URL',
      'Preview URLs', 'Paper URL', 'Slides URL', 'Tags', 'Language', 'Year')),
    ('Stack', '658f4e30-0002-40e4-9e75-506129258507',
     '2c9329f7-406e-4a30-89c2-f4fd8ba63c78',
     'c187209785eb4783bbd6d9e2e0ab9bd4', 'ad0c8bc959e84d56a6b5c4d212d00e29',
     ('Name', 'Category', 'Icon key', 'Proficiency')),
)
SCALARS = {'title', 'rich_text', 'url', 'number', 'select', 'multi_select', 'status'}


class NotionError(RuntimeError):
    pass


def same_id(a, b):
    return isinstance(a, str) and isinstance(b, str) and a.replace('-', '') == b.replace('-', '')


class Notion:
    def __init__(self, request):
        self.request = request

    def _request(self, role, method, path, body=None):
        if role not in ('source', 'target') or (role == 'source' and
                not (method == 'GET' or (method == 'POST' and path.endswith('/query')))):
            raise NotionError('Source writes are forbidden')
        return self.request(role, method, path, body)

    def _schema(self, role, ds, db):
        result = self._request(role, 'GET', '/data_sources/' + ds)
        if not same_id(result.get('id'), ds) or not same_id(result.get('parent', {}).get('database_id'), db):
            raise NotionError('Unexpected data source/database parent')
        return result['properties']

    def _properties(self, page, schema):
        props = {}
        for name, definition in schema.items():
            kind = definition['type']
            value = page.get('properties', {}).get(name)
            if not value or value.get('type') != kind:
                raise NotionError('Missing or wrong property: ' + name)
            data = value.get(kind)
            if kind in ('title', 'rich_text'):
                # shortcut: refuse 25+ segments; paginate property items if longer text is needed.
                if not isinstance(data, list) or len(data) >= 25 or value.get('has_more'):
                    raise NotionError('Incomplete rich text: ' + name)
                converted = []
                for part in data:
                    if part.get('type') != 'text' or not isinstance(part.get('text', {}).get('content'), str):
                        raise NotionError('Non-text rich text: ' + name)
                    text = {'content': part['text']['content']}
                    if part['text'].get('link') is not None:
                        text['link'] = deepcopy(part['text']['link'])
                    converted.append({'type': 'text', 'text': text,
                                      'annotations': deepcopy(part.get('annotations', {}))})
                data = converted
            elif kind in ('select', 'status'):
                data = {'name': data['name']} if data is not None else None
            elif kind == 'multi_select':
                data = [{'name': option['name']} for option in data]
            props[name] = {kind: data}
        return props

    def _parent(self, page, ds):
        if not same_id(page.get('parent', {}).get('data_source_id'), ds):
            raise NotionError('Unexpected page parent')

    def _rows(self, role, ds, schema, published=False):
        rows, page_ids, cursors, cursor = {}, set(), set(), None
        for _ in range(1000):
            body = {'page_size': 100}
            if published:
                body['filter'] = {'property': 'Status', schema['Status']['type']: {'equals': 'Added'}}
            if cursor:
                body['start_cursor'] = cursor
            response = self._request(role, 'POST', '/data_sources/' + ds + '/query', body)
            results = response.get('results')
            if not isinstance(results, list) or len(results) > 100:
                raise NotionError('Invalid query results')
            for page in results:
                self._parent(page, ds)
                if page.get('in_trash') or page.get('archived'):
                    raise NotionError('Query returned trashed page')
                props = self._properties(page, schema)
                name = ''.join(p['text']['content'] for p in props['Name']['title'])
                if not name or name in rows or page['id'] in page_ids:
                    raise NotionError('Empty or duplicate Name/page ID')
                if published and props['Status'][schema['Status']['type']] != {'name': 'Added'}:
                    raise NotionError('Query returned unpublished Project')
                page_ids.add(page['id'])
                rows[name] = {'id': page['id'], 'properties': props}
            if not response.get('has_more'):
                return rows
            cursor = response.get('next_cursor')
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise NotionError('Invalid or repeated pagination cursor')
            cursors.add(cursor)
        raise NotionError('Pagination limit exceeded')

    def plan(self):
        datasets, summary = [], {}
        for name, source, target, source_db, target_db, allowed in DATASETS:
            source_schema = self._schema('source', source, source_db)
            target_schema = self._schema('target', target, target_db)
            schema = {key: deepcopy(source_schema[key]) for key in allowed if key in source_schema}
            if schema.get('Name', {}).get('type') != 'title' or (name == 'Projects' and
                    schema.get('Status', {}).get('type') not in ('select', 'status')):
                raise NotionError('Required Name/Status schema missing')
            for key, definition in schema.items():
                kind = definition['type']
                if kind not in SCALARS or target_schema.get(key, {}).get('type') != kind:
                    raise NotionError('Schema mismatch: ' + key)
                if kind in ('select', 'multi_select', 'status'):
                    options = {o['name'] for o in definition[kind]['options']}
                    target_options = {o['name'] for o in target_schema[key][kind]['options']}
                    if not options <= target_options:
                        raise NotionError('Missing target options: ' + key)
                    if key == 'Status' and 'Added' not in options:
                        raise NotionError('Missing Added option')
            src = self._rows('source', source, schema, name == 'Projects')
            dst = self._rows('target', target, schema)
            datasets.append({'name': name, 'source_id': source, 'target_id': target,
                             'schema': schema, 'source': src, 'target': dst})
            summary[name] = {'source': len(src), 'target': len(dst),
                             'create': len(src.keys() - dst.keys()),
                             'trash': len(dst.keys() - src.keys()),
                             'update': sum(src[n]['properties'] != dst[n]['properties'] for n in src.keys() & dst.keys())}
        return {'datasets': datasets, 'summary': summary}

    def _mutate(self, journal, save, method, path, body, ds, page_id=None):
        if page_id:
            self._parent(self._request('target', 'GET', '/pages/' + page_id), ds)
        journal['pending'] = {'method': method, 'path': path, 'body': deepcopy(body),
                              'data_source_id': ds, 'page_id': page_id}
        save()
        result = self._request('target', method, path, body)
        if method == 'POST':
            created_id = result.get('id')
            if not isinstance(created_id, str) or not created_id:
                raise NotionError('Creation returned no page ID; recovery requires operator')
            journal['created'].append({'id': created_id, 'data_source_id': ds})
            journal['pending']['page_id'] = created_id
            save()
            self._parent(self._request('target', 'GET', '/pages/' + created_id), ds)
        else:
            self._parent(self._request('target', 'GET', '/pages/' + page_id), ds)
        journal['pending'] = None
        save()

    def _compare(self, dataset, expected, ids=False):
        actual = self._rows('target', dataset['target_id'], dataset['schema'])
        if actual.keys() != expected.keys() or any(
                actual[n]['properties'] != expected[n]['properties'] or
                (ids and actual[n]['id'] != expected[n]['id']) for n in expected):
            raise NotionError('Target verification mismatch: ' + dataset['name'])

    def apply(self, plan, state, save):
        if state.get('notion'):
            raise NotionError('Existing Notion journal; recover before applying')
        for dataset in plan['datasets']:
            self._compare(dataset, dataset['target'], ids=True)
        journal = state['notion'] = {'plan': deepcopy(plan), 'created': [], 'touched': [],
                                     'pending': None, 'applied': False, 'rolled_back': False}
        save()
        for dataset in plan['datasets']:
            src, dst, ds = dataset['source'], dataset['target'], dataset['target_id']
            for name, row in src.items():
                if name not in dst:
                    self._mutate(journal, save, 'POST', '/pages',
                                 {'parent': {'type': 'data_source_id', 'data_source_id': ds},
                                  'properties': row['properties']}, ds)
                elif row['properties'] != dst[name]['properties']:
                    page_id = dst[name]['id']
                    journal['touched'].append(page_id)
                    self._mutate(journal, save, 'PATCH', '/pages/' + page_id,
                                 {'properties': row['properties']}, ds, page_id)
            for name in dst.keys() - src.keys():
                page_id = dst[name]['id']
                journal['touched'].append(page_id)
                self._mutate(journal, save, 'PATCH', '/pages/' + page_id,
                             {'in_trash': True}, ds, page_id)
            self._compare(dataset, src)
        journal['applied'] = True
        save()
        return plan['summary']

    def rollback(self, state, save):
        journal = state.get('notion')
        if not journal:
            return
        pending = journal['pending']
        if pending and pending['method'] == 'POST' and not pending['page_id']:
            raise NotionError('Unknown creation outcome; operator must reconcile pending create')
        for dataset in journal['plan']['datasets']:
            ds = dataset['target_id']
            for row in dataset['target'].values():
                if row['id'] in journal['touched']:
                    self._mutate(journal, save, 'PATCH', '/pages/' + row['id'],
                                 {'properties': row['properties'], 'in_trash': False}, ds, row['id'])
            for row in journal['created']:
                if same_id(row['data_source_id'], ds):
                    self._mutate(journal, save, 'PATCH', '/pages/' + row['id'],
                                 {'in_trash': True}, ds, row['id'])
            self._compare(dataset, dataset['target'], ids=True)
        journal['rolled_back'] = True
        journal['applied'] = False
        save()
