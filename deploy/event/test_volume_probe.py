import io
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import controller as c
import volume_probe as p
from test_controller import attestation, writer_fixture

A, B = '1' * 64, '2' * 64
MOUNTPOINT = '/var/lib/docker/volumes/' + c.VOLUME + '/_data'


def record(container_id=A, name=c.CONTAINER_PREFIX + 'dep_new', status='running', rw=True):
    return {'Id': container_id, 'Name': '/' + name, 'State': {'Status': status},
            'Mounts': [{'Type': 'volume', 'Name': c.VOLUME, 'Source': MOUNTPOINT, 'Destination': '/data', 'RW': rw}],
            'Config': {'Env': ['DO_NOT_EMIT=fake-private-content']}}


class DockerFake:
    def __init__(self, records=None):
        self.records = records or {A: record()}
        self.calls = []
        self.lists = 0
        self.race = False

    def get(self, path):
        self.calls.append(path)
        if path == '/volumes/' + c.VOLUME:
            return {'Name': c.VOLUME, 'Mountpoint': MOUNTPOINT}
        if path == p.LIST_PATH:
            self.lists += 1
            if self.race and self.lists == 2:
                return []
            return [{'Id': container_id, 'State': value['State']['Status']} for container_id, value in self.records.items()]
        return self.records[path.split('/')[2]]


class ProbeTests(unittest.TestCase):
    def test_reports_only_approved_metadata_using_fixed_get_paths(self):
        docker = DockerFake()
        self.assertEqual(p.probe(docker), writer_fixture())
        self.assertEqual(docker.lists, 2)
        self.assertTrue(all(path == p.LIST_PATH or path == '/volumes/' + c.VOLUME or path == '/containers/' + A + '/json' for path in docker.calls))
        self.assertNotIn('DO_NOT_EMIT', json.dumps(p.probe(docker)))

    def test_read_only_mount_does_not_claim_a_writer(self):
        result = p.probe(DockerFake({A: record(rw=False)}))
        self.assertEqual(result['count'], 0)
        self.assertEqual(result['users'], [])

    def test_extra_paused_restarting_users_and_bind_alias_are_not_hidden(self):
        for status in ('running', 'paused', 'restarting'):
            with self.subTest(status=status):
                extra = record(B, 'unrelated', status)
                result = p.probe(DockerFake({A: record(), B: extra}))
                self.assertEqual(result['count'], 2)
                self.assertIn(status, [user['status'] for user in result['users']])
        alias = record(B, 'alias')
        alias['Mounts'][0].update(Type='bind', Name=None, Source=MOUNTPOINT + '/nested', Destination='/other')
        self.assertEqual(p.probe(DockerFake({A: record(), B: alias}))['count'], 2)

    def test_ancestor_descendant_normalized_and_symlink_bind_writers_block(self):
        with tempfile.TemporaryDirectory() as directory:
            alias = Path(directory) / 'volume-alias'
            alias.symlink_to(MOUNTPOINT, target_is_directory=True)
            for source in ('/', '/var/lib/docker/volumes', '/var/lib/docker/volumes/../volumes/', MOUNTPOINT, MOUNTPOINT + '/nested', str(alias)):
                with self.subTest(source=source):
                    extra = record(B, 'overlapping-writer')
                    extra['Mounts'][0].update(Type='bind', Name=None, Source=source, Destination='/other')
                    result = p.probe(DockerFake({A: record(), B: extra}))
                    self.assertEqual(result['count'], 2)
                    client = c.Client({'OPENSHIP_TOKEN': 'fake'})
                    client.probe = lambda: result
                    with self.assertRaises(c.Blocked):
                        client.volume_writer('dep_new', attestation())

    def test_sibling_and_read_only_ancestor_mounts_do_not_count(self):
        for source, rw in ((MOUNTPOINT + '-sibling', True), ('/', False)):
            with self.subTest(source=source, rw=rw):
                extra = record(B, 'nonwriter', rw=rw)
                extra['Mounts'][0].update(Type='bind', Name=None, Source=source, Destination='/other')
                result = p.probe(DockerFake({A: record(), B: extra}))
                self.assertEqual(result['count'], 1)
                client = c.Client({'OPENSHIP_TOKEN': 'fake'})
                client.probe = lambda: result
                client.volume_writer('dep_new', attestation())

    def test_race_and_malformed_mount_fail_closed(self):
        docker = DockerFake()
        docker.race = True
        with self.assertRaises(c.Blocked):
            p.probe(docker)
        bad = record()
        bad['Mounts'][0]['RW'] = 'true'
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: bad}))

    def test_oversized_selected_output_fails_closed(self):
        records = {}
        for number in range(100):
            container_id = format(number + 1, '064x')
            value = record(container_id, 'safe-' + 'x' * 120)
            value['Mounts'][0]['Destination'] = '/' + 'x' * 512
            records[container_id] = value
        with self.assertRaisesRegex(c.Blocked, 'response too large'):
            p.probe(DockerFake(records))

    def test_root_entrypoint_emits_only_generic_failure(self):
        output = io.StringIO()
        with patch.object(p.sys, 'argv', ['probe']), patch.object(p.os, 'geteuid', return_value=0), patch.object(p, 'read_activation', side_effect=OSError('private error')), patch.object(p.sys, 'stdout', output):
            self.assertEqual(p.main(), 1)
        self.assertEqual(json.loads(output.getvalue()), {'ok': False})

    def test_docker_get_rejects_nonfixed_endpoint(self):
        for path in ('/containers/x/json', '/containers/prune', '/volumes/other', '/version'):
            with self.assertRaises(c.Blocked):
                p.Docker().get(path)


class SocketClientTests(unittest.TestCase):
    def setUp(self):
        self.client = c.Client({'GITHUB_TOKEN': 'fake', 'OPENSHIP_TOKEN': 'fake'})

    def test_probe_unavailable_and_oversized_response(self):
        with patch.object(c.os, 'lstat', side_effect=OSError('private path')):
            with self.assertRaises(c.Blocked):
                self.client.probe()
        class Stream:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def settimeout(self, value): pass
            def connect(self, path): self.path = path
            def shutdown(self, how): pass
            def recv(self, size): return b'x' * size
        metadata = type('Metadata', (), {'st_mode': 0o140660, 'st_uid': 0})()
        with patch.object(c.os, 'lstat', return_value=metadata), patch.object(c.socket, 'socket', return_value=Stream()):
            with self.assertRaisesRegex(c.Blocked, 'too large'):
                self.client.probe()

    def test_activation_reader_rejects_writable_nonroot_and_symlink_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'activation.json'
            path.write_text(json.dumps(attestation()))
            for mode, owner in ((0o100664, 0), (0o100644, 1000)):
                metadata = SimpleNamespace(st_mode=mode, st_uid=owner, st_size=path.stat().st_size)
                with patch.object(c.os, 'fstat', return_value=metadata), self.assertRaises(c.Blocked):
                    c.read_activation(path)
            link = Path(directory) / 'link.json'
            link.symlink_to(path)
            with self.assertRaises(OSError):
                c.read_activation(link)

    def test_root_activation_permissions_and_fixed_storage(self):
        with self.assertRaises(c.Blocked):
            c.activation_config(dict(attestation(), container_prefix='unrelated-'), 10)
        with self.assertRaises(c.Blocked):
            c.activation_config(dict(attestation(), declared_mounts=['other:/data']), 10)


if __name__ == '__main__':
    unittest.main()
