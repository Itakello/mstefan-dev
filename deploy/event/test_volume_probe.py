import io
import json
import os
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


def topology_fixture(extra='', metadata=None):
    text = '10 1 8:1 / / rw - ext4 /dev/test rw\n' + extra
    return p.MountTopology(text, stat_path=metadata or (lambda path: SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=abs(hash(path)))), canonical=os.path.realpath)


class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.topology_patch = patch.object(p.MountTopology, 'read', side_effect=topology_fixture)
        self.topology_patch.start()
        self.addCleanup(self.topology_patch.stop)

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


class KernelTopologyTests(unittest.TestCase):
    def alias_topology(self):
        volume_root = os.path.realpath(MOUNTPOINT)
        return topology_fixture('11 10 8:1 ' + volume_root + ' /srv/payload-data rw - ext4 /dev/test rw\n')

    def test_visible_stacked_mount_unrelated_to_volume_allows_probe(self):
        binfmt = ('20 10 0:40 / /proc/sys/fs/binfmt_misc rw - autofs none rw\n'
                  '21 20 0:41 / /proc/sys/fs/binfmt_misc rw - binfmt_misc none rw\n')
        factory = lambda: topology_fixture(binfmt)
        self.assertEqual(factory().entries['/proc/sys/fs/binfmt_misc'], ((0, 41), '/'))
        self.assertEqual(p.probe(DockerFake(), topology_factory=factory), writer_fixture())

    def test_stacked_alias_visible_mount_controls_overlap(self):
        volume_root = os.path.realpath(MOUNTPOINT)
        alias = '/srv/payload-data'
        fixture = ('20 10 8:2 / ' + alias + ' rw - ext4 /dev/hidden rw\n'
                   '21 20 8:1 ' + volume_root + ' ' + alias + ' rw - ext4 /dev/visible rw\n')
        def metadata(path):
            return SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=abs(hash(path)))
        factory = lambda: topology_fixture(fixture, metadata=metadata)
        extra = record(B, 'alias')
        extra['Mounts'][0].update(Type='bind', Name=None, Source=alias, Destination='/other')
        result = p.probe(DockerFake({A: record(), B: extra}), topology_factory=factory)
        self.assertEqual(result['count'], 2)
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        with self.assertRaises(c.Blocked):
            client.volume_writer('dep_new', attestation())

    def test_ambiguous_unrelated_stack_is_allowed_but_affected_source_blocks(self):
        ambiguous = ('20 10 0:40 / /proc/sys/fs/binfmt_misc rw - autofs none rw\n'
                     '21 10 0:41 / /proc/sys/fs/binfmt_misc rw - binfmt_misc none rw\n')
        factory = lambda: topology_fixture(ambiguous)
        self.assertEqual(p.probe(DockerFake(), topology_factory=factory), writer_fixture())
        extra = record(B, 'uncertain')
        extra['Mounts'][0].update(Type='bind', Name=None, Source='/proc', Destination='/other')
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: extra}), topology_factory=factory)

    def test_read_only_parent_with_child_volume_alias_blocks(self):
        parent = record(B, 'read-only-parent', rw=False)
        parent['Mounts'][0].update(Type='bind', Name=None, Source='/srv', Destination='/other')
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: parent}), topology_factory=self.alias_topology)
        direct = record(B, 'read-only-exact', rw=False)
        direct['Mounts'][0].update(Type='bind', Name=None, Source='/srv/payload-data', Destination='/other')
        result = p.probe(DockerFake({A: record(), B: direct}), topology_factory=self.alias_topology)
        self.assertEqual(result['count'], 1)

    def test_host_namespace_file_mounts_are_opaque_but_unrelated(self):
        namespace_mounts = ''.join(
            f'{number + 20} 10 0:45 net:[4026532{number:04d}] /run/docker/netns/ns{number} rw - nsfs nsfs rw\n'
            for number in range(30)
        )
        factory = lambda: topology_fixture(namespace_mounts)
        topology = factory()
        self.assertEqual(len(topology.unresolved_points), 30)
        self.assertEqual(p.probe(DockerFake(), topology_factory=factory), writer_fixture())
        with self.assertRaises(c.Blocked):
            topology.identity('/run/docker/netns/ns3')
        safe = record(B, 'read-only-ns-file', rw=False)
        safe['Mounts'][0].update(Type='bind', Name=None, Source='/run/docker/netns/ns3', Destination='/other')
        def ns_metadata(path):
            return SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=abs(hash(path)), st_mode=0o100444)
        safe_factory = lambda: topology_fixture(namespace_mounts, metadata=ns_metadata)
        self.assertEqual(p.probe(DockerFake({A: record(), B: safe}), topology_factory=safe_factory)['count'], 1)
        safe['Mounts'][0]['RW'] = True
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: safe}), topology_factory=safe_factory)
        extra = record(B, 'namespace-parent')
        extra['Mounts'][0].update(Type='bind', Name=None, Source='/run/docker/netns', Destination='/other')
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: extra}), topology_factory=factory)

    def test_only_exact_net_namespace_roots_are_opaque(self):
        for root in ('relative', 'net:[]', 'net:[abc]', 'mnt:[4026532000]', 'net:[4026532000]/child'):
            with self.subTest(root=root), self.assertRaises(c.Blocked):
                topology_fixture(f'20 10 0:45 {root} /run/docker/netns/ns1 rw - nsfs nsfs rw\n')
        for point, filesystem in (('/srv/alias', 'nsfs'), ('/run/docker/netns/sub/child', 'nsfs'), ('/run/docker/netns/ns1', 'ext4')):
            with self.subTest(point=point, filesystem=filesystem), self.assertRaises(c.Blocked):
                topology_fixture(f'20 10 0:45 net:[4026532000] {point} rw - {filesystem} none rw\n')

    def test_non_symlink_bind_alias_root_descendant_and_parent_block(self):
        for source in ('/srv/payload-data', '/srv/payload-data/nested', '/srv'):
            with self.subTest(source=source):
                extra = record(B, 'bind-mounted-alias')
                extra['Mounts'][0].update(Type='bind', Name=None, Source=source, Destination='/other')
                result = p.probe(DockerFake({A: record(), B: extra}), topology_factory=self.alias_topology)
                self.assertEqual(result['count'], 2)
                client = c.Client({'OPENSHIP_TOKEN': 'fake'})
                client.probe = lambda: result
                with self.assertRaises(c.Blocked):
                    client.volume_writer('dep_new', attestation())

    def test_unrelated_bind_filesystem_and_sibling_are_not_overlap(self):
        topology = self.alias_topology()
        self.assertFalse(topology.overlaps('/srv/other', MOUNTPOINT))
        self.assertFalse(topology.overlaps('/srv/payload-data-sibling', MOUNTPOINT))
        other = topology_fixture('11 10 8:2 ' + os.path.realpath(MOUNTPOINT) + ' /srv/unrelated rw - ext4 /dev/other rw\n',
            metadata=lambda path: SimpleNamespace(st_dev=os.makedev(8, 2 if path.startswith('/srv/unrelated') else 1), st_ino=100))
        self.assertFalse(other.overlaps('/srv/unrelated', MOUNTPOINT))

    def test_topology_changes_and_unresolvable_sources_fail_closed(self):
        extra = record(B, 'alias')
        extra['Mounts'][0].update(Type='bind', Name=None, Source='/srv/payload-data', Destination='/other')
        topologies = iter((self.alias_topology(), topology_fixture()))
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: extra}), topology_factory=lambda: next(topologies))
        def missing(path):
            raise FileNotFoundError(path)
        with self.assertRaises(OSError):
            p.probe(DockerFake(), topology_factory=lambda: topology_fixture(metadata=missing))
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake(), topology_factory=lambda: topology_fixture(metadata=lambda path: SimpleNamespace(st_dev=os.makedev(8, 2), st_ino=100)))

    def test_mount_topology_generation_change_blocks_even_same_mapping(self):
        topologies = iter((topology_fixture(), p.MountTopology('12 1 8:1 / / rw - ext4 /dev/test rw\n',
            stat_path=lambda path: SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=abs(hash(path))), canonical=os.path.realpath)))
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake(), topology_factory=lambda: next(topologies))

    def test_namespace_mismatch_and_malformed_topology_refused(self):
        with patch.object(p.os, 'readlink', side_effect=('mnt:[1]', 'mnt:[2]')):
            with self.assertRaises(c.Blocked):
                p.MountTopology.read()
        for text in ('', 'invalid', '10 1 invalid / / rw - ext4 /dev/test rw',
                     'bad 1 8:1 / / rw - ext4 /dev/test rw',
                     '10 parent 8:1 / / rw - ext4 /dev/test rw',
                     r'10 1 8:1 /\777 / rw - ext4 /dev/test rw',
                     r'10 1 8:1 / /\000 rw - ext4 /dev/test rw',
                     '10 1 8:1 /srv/../alias / rw - ext4 /dev/test rw',
                     '10 1 8:1 / / invalid - ext4 /dev/test rw'):
            with self.subTest(text=text), self.assertRaises(c.Blocked):
                p.MountTopology(text)

    def test_ambiguous_root_stack_blocks_checked_volume(self):
        fixture = ('10 1 8:1 / / rw - ext4 /dev/test rw\n'
                   '11 10 8:1 / / rw - ext4 /dev/test rw\n'
                   '12 10 8:1 / / rw - ext4 /dev/test rw\n')
        topology = p.MountTopology(fixture, stat_path=lambda path: SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=1), canonical=os.path.realpath)
        with self.assertRaises(c.Blocked):
            topology.identity(MOUNTPOINT)

    def test_exact_inode_identity_also_detects_alias_root(self):
        target = os.path.realpath(MOUNTPOINT)
        topology = topology_fixture(metadata=lambda path: SimpleNamespace(st_dev=os.makedev(8, 1), st_ino=1 if path in {target, '/srv/unusual-alias'} else abs(hash(path))))
        self.assertTrue(topology.overlaps('/srv/unusual-alias', MOUNTPOINT))


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
