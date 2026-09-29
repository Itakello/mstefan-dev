import io
import hashlib
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
    return {'Id': container_id, 'Name': '/' + name, 'State': {'Status': status, 'Pid': int(container_id[-8:], 16)},
            'Mounts': [{'Type': 'volume', 'Name': c.VOLUME, 'Source': MOUNTPOINT, 'Destination': '/data', 'RW': rw}],
            'Config': {'Env': ['DO_NOT_EMIT=fake-private-content']}}


class DockerFake:
    def __init__(self, records=None):
        self.records = records or {A: record()}
        self.calls = []
        self.lists = 0
        self.race = False
        self.process_rows = {}
        self.held_roots = {}

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

    def process_mountinfo(self, pid, container_id):
        assert self.records[container_id]['State']['Pid'] == pid
        rows = ['10 1 8:2 / / rw - overlay overlay rw']
        for number, mount in enumerate(self.records[container_id]['Mounts'], 11):
            source = os.path.realpath(mount['Source'])
            if mount.get('Type') == 'volume':
                root = os.path.realpath(MOUNTPOINT)
            elif source == '/srv/payload-data' or source.startswith('/srv/payload-data/'):
                root = os.path.realpath(MOUNTPOINT) + source[len('/srv/payload-data'):]
            else:
                root = source
            root = self.held_roots.get((container_id, mount['Destination']), root)
            options = 'rw' if mount['RW'] else 'ro'
            rows.append(f'{number} 10 8:1 {root} {mount["Destination"]} {options} - ext4 /dev/test {options}')
            if source == '/srv':
                rows.append(f'{number + 100} {number} 8:1 {os.path.realpath(MOUNTPOINT)} {mount["Destination"]}/payload-data {options} - ext4 /dev/test {options}')
        rows.extend(self.process_rows.get(container_id, []))
        raw = '\n'.join(rows) + '\n'
        return p.MountTopology(raw), hashlib.sha256(raw.encode()).hexdigest()


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

    def test_container_mountinfo_requires_exact_cgroup_and_bounded_read(self):
        pid = 12345
        original_open = os.open
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'cgroup').write_text('0::/docker/' + A + '\n')
            (root / 'mountinfo').write_text('10 1 8:2 / / rw - overlay overlay rw\n')

            def open_proc(path, flags, *args, **kwargs):
                if path == f'/proc/{pid}':
                    path = directory
                return original_open(path, flags, *args, **kwargs)

            with patch.object(p.os, 'open', side_effect=open_proc):
                topology, digest = p.read_process_mountinfo(pid, A)
                self.assertEqual(topology.entries['/'][0], (8, 2))
                self.assertEqual(len(digest), 64)
                (root / 'cgroup').write_text('0::/docker/' + B + '\n')
                with self.assertRaisesRegex(c.Blocked, 'PID/cgroup mismatch'):
                    p.read_process_mountinfo(pid, A)
                (root / 'cgroup').write_text('0::/docker/' + A + '\n')
                (root / 'mountinfo').write_text('x' * (1024 * 1024 + 1))
                with self.assertRaisesRegex(c.Blocked, 'too large'):
                    p.read_process_mountinfo(pid, A)

    def test_container_mount_change_between_snapshots_blocks(self):
        class ChangedMounts(DockerFake):
            def __init__(self):
                super().__init__()
                self.reads = 0

            def process_mountinfo(self, pid, container_id):
                self.reads += 1
                topology, digest = super().process_mountinfo(pid, container_id)
                return topology, digest + str(self.reads)

        with self.assertRaisesRegex(c.Blocked, 'changed during probe'):
            p.probe(ChangedMounts())

    def test_retained_bind_after_host_source_retarget_blocks_submission(self):
        stale = record(B, 'stale-host-source')
        stale['Mounts'][0].update(Type='bind', Name=None, Source='/srv/now-unrelated', Destination='/other')
        docker = DockerFake({A: record(), B: stale})
        docker.held_roots[B, '/other'] = os.path.realpath(MOUNTPOINT)
        result = p.probe(docker)
        self.assertEqual(result['count'], 2)
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        with self.assertRaises(c.Blocked):
            client.volume_writer('dep_new', attestation())

    def test_process_created_writer_outside_docker_mounts_blocks(self):
        docker = DockerFake({A: record(), B: {'Id': B, 'Name': '/other', 'State': {'Status': 'running', 'Pid': 202}, 'Mounts': []}})
        docker.process_rows[B] = [f'11 10 8:1 {os.path.realpath(MOUNTPOINT)} /unexpected rw - ext4 /dev/test rw']
        result = p.probe(docker)
        self.assertEqual(result['count'], 2)
        self.assertEqual(result['users'][1]['mount_type'], 'unknown')
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        with self.assertRaises(c.Blocked):
            client.volume_writer('dep_new', attestation())

    def test_wrong_named_volume_held_on_approved_storage_blocks(self):
        wrong = record()
        wrong['Mounts'][0]['Name'] = 'other-volume'
        result = p.probe(DockerFake({A: wrong}))
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['users'][0]['mount_type'], 'unknown')
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        with self.assertRaises(c.Blocked):
            client.volume_writer('dep_new', attestation())

    def test_read_only_parent_with_writable_recursive_child_blocks(self):
        parent = record(B, 'read-only-parent', rw=False)
        parent['Mounts'][0].update(Type='bind', Name=None, Source='/srv', Destination='/other')
        docker = DockerFake({A: record(), B: parent})
        docker.process_rows[B] = [f'112 111 8:1 {os.path.realpath(MOUNTPOINT)} /other/payload-data/live rw - ext4 /dev/test rw']
        result = p.probe(docker)
        self.assertEqual(result['count'], 2)
        self.assertIn('/other/payload-data/live', [user['destination'] for user in result['users']])
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        with self.assertRaises(c.Blocked):
            client.volume_writer('dep_new', attestation())

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

    def test_container_view_accepts_only_observed_mirrored_netns_files(self):
        base = '10 1 8:2 / / rw - overlay overlay rw\n'
        mirrored = '11 10 0:4 net:[4026532591] /host/root/run/docker/netns/ns1 ro - nsfs nsfs rw\n'
        viewed = p.MountTopology(base + mirrored, container_view=True)
        self.assertIn('/host/root/run/docker/netns/ns1', viewed.unresolved_points)
        with self.assertRaises(c.Blocked):
            p.MountTopology(base + mirrored)
        for point, filesystem in (('/other/run/docker/netns/ns1', 'nsfs'),
                                  ('/host/root/run/docker/netns/deep/ns1', 'nsfs'),
                                  ('/host/root/run/docker/netns/ns1', 'ext4')):
            with self.subTest(point=point, filesystem=filesystem), self.assertRaises(c.Blocked):
                p.MountTopology(base + f'11 10 0:4 net:[4026532591] {point} ro - {filesystem} none rw\n', container_view=True)

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

    def test_host_read_only_root_bind_ignores_foreign_unresolved_devices(self):
        host_mounts = ('20 10 0:32 / /proc/sys/fs/binfmt_misc rw - autofs none rw\n'
                       '21 20 0:35 / /proc/sys/fs/binfmt_misc rw - binfmt_misc none rw\n'
                       + ''.join(f'{number + 30} 10 0:4 net:[4026532{number:04d}] /run/docker/netns/ns{number} rw - nsfs nsfs rw\n' for number in range(30)))
        def metadata(path):
            dev = (0, 35) if path == '/proc/sys/fs/binfmt_misc' else (8, 1)
            return SimpleNamespace(st_dev=os.makedev(*dev), st_ino=abs(hash(path)))
        factory = lambda: topology_fixture(host_mounts, metadata=metadata)
        monitoring = record(B, 'mstefan-devops-node-1', rw=False)
        monitoring['Mounts'][0].update(Type='bind', Name=None, Source='/', Destination='/host/root')
        result = p.probe(DockerFake({A: record(), B: monitoring}), topology_factory=factory)
        self.assertEqual(result['count'], 1)
        client = c.Client({'OPENSHIP_TOKEN': 'fake'})
        client.probe = lambda: result
        client.volume_writer('dep_new', attestation())
        monitoring['Mounts'][0]['RW'] = True
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: monitoring}), topology_factory=factory)

    def test_read_only_parent_with_ambiguous_same_device_child_blocks(self):
        ambiguous = ('20 10 8:1 / /srv/alias rw - ext4 /dev/possible rw\n'
                     '21 10 0:4 / /srv/alias rw - tmpfs none rw\n')
        parent = record(B, 'read-only-parent', rw=False)
        parent['Mounts'][0].update(Type='bind', Name=None, Source='/srv', Destination='/other')
        with self.assertRaises(c.Blocked):
            p.probe(DockerFake({A: record(), B: parent}), topology_factory=lambda: topology_fixture(ambiguous))

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
        with patch.object(p.os, 'readlink', return_value='mnt:[1]') as readlink:
            with self.assertRaises(c.Blocked):
                p.MountTopology.read('mnt:[2]')
            readlink.assert_called_once_with('/proc/self/ns/mnt')
        with patch.object(p.os, 'readlink', return_value='mnt:[7]') as readlink, patch('builtins.open', return_value=io.StringIO('10 1 8:1 / / rw - ext4 /dev/test rw\n')):
            self.assertIn('/', p.MountTopology.read('mnt:[7]').entries)
            readlink.assert_called_once_with('/proc/self/ns/mnt')
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
        for value in (None, '', 'mnt:[abc]', 'mnt:[0]', 'mnt:[1] suffix'):
            with self.subTest(value=value), self.assertRaises(c.Blocked):
                c.activation_config(dict(attestation(), host_mount_namespace=value), 10)


if __name__ == '__main__':
    unittest.main()
