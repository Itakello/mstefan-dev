#!/usr/bin/python3
"""Socket-activated read-only probe. No input, command or environment arguments."""
import http.client
import json
import os
import posixpath
import re
import socket
import sys
import time
import urllib.parse
from controller import Blocked, PROBE_LIMIT, VOLUME, activation_config, read_activation

LIVE = {'running', 'paused', 'restarting'}
IDS = re.compile('[0-9a-f]{64}')
LIST_PATH = '/containers/json?all=1&filters=' + urllib.parse.quote(json.dumps({'status': sorted(LIVE)}, separators=(',', ':')))
DOCKER_LIMIT = 4 * 1024 * 1024


class Docker:
    def get(self, path):
        if path != LIST_PATH and path != '/volumes/' + VOLUME and not re.fullmatch('/containers/[0-9a-f]{64}/json', path):
            raise Blocked('probe endpoint refused')
        connection = http.client.HTTPConnection('localhost', timeout=2)
        connection.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            connection.sock.settimeout(2)
            connection.sock.connect('/var/run/docker.sock')
            connection.request('GET', path)
            response = connection.getresponse()
            if response.status != 200:
                raise Blocked('Docker read failed')
            raw = response.read(DOCKER_LIMIT + 1)
            if len(raw) > DOCKER_LIMIT:
                raise Blocked('Docker response too large')
            return json.loads(raw)
        finally:
            connection.close()


def path_overlap(left, right):
    return posixpath.commonpath([left, right]) in {left, right}


class MountTopology:
    """Map visible host paths to kernel filesystem roots; never read data files."""
    def __init__(self, text, stat_path=None, canonical=None):
        self.stat_path = stat_path or os.stat
        self.canonical = canonical or (lambda path: os.path.realpath(path, strict=True))
        self.entries = {}
        self.unresolved_points = set()
        groups = {}
        lines = text.splitlines()
        self.lines = tuple(lines)
        if not lines or len(lines) > 8192:
            raise Blocked('host mount topology incomplete')
        seen_ids = set()
        for line in lines:
            fields, separator, filesystem = line.partition(' - ')
            values = fields.split()
            if not separator or len(values) < 6 or len(filesystem.split()) < 3 or not re.fullmatch('[1-9][0-9]*', values[0]) or not re.fullmatch('[0-9]+', values[1]) or values[0] in seen_ids or not re.fullmatch('[0-9]+:[0-9]+', values[2]) or not re.fullmatch(r'(?:ro|rw)(?:,[A-Za-z0-9_=.-]+)*', values[5]):
                raise Blocked('host mount topology invalid')
            seen_ids.add(values[0])
            device = tuple(int(part) for part in values[2].split(':'))
            paths = []
            for encoded in values[3:5]:
                if not re.fullmatch(r'(?:[^\\]|\\(?:040|011|012|134))*', encoded):
                    raise Blocked('host mount topology escape invalid')
                decoded = re.sub(r'\\(040|011|012|134)', lambda match: chr(int(match[1], 8)), encoded)
                if not posixpath.isabs(decoded) or posixpath.normpath(decoded) != decoded:
                    raise Blocked('host mount topology path invalid')
                paths.append(posixpath.normpath(decoded))
            root, mountpoint = paths
            groups.setdefault(mountpoint, []).append((values[0], values[1], device, root))
        for mountpoint, group in groups.items():
            if len(group) == 1:
                self.entries[mountpoint] = (group[0][2], group[0][3])
                continue
            parents = {row[1] for row in group}
            visible = [row for row in group if row[0] not in parents]
            by_id = {row[0]: row for row in group}
            if len(visible) != 1:
                self.unresolved_points.add(mountpoint)
                continue
            chain = set()
            current = visible[0]
            while current[0] not in chain:
                chain.add(current[0])
                current = by_id.get(current[1])
                if current is None:
                    break
            if len(chain) != len(group):
                self.unresolved_points.add(mountpoint)
                continue
            self.entries[mountpoint] = (visible[0][2], visible[0][3])
        if '/' not in self.entries and '/' not in self.unresolved_points:
            raise Blocked('host mount topology root missing')

    @classmethod
    def read(cls):
        own = os.readlink('/proc/self/ns/mnt')
        host = os.readlink('/proc/1/ns/mnt')
        if not re.fullmatch(r'mnt:\[[0-9]+\]', own) or own != host:
            raise Blocked('probe must observe the host mount namespace')
        with open('/proc/self/mountinfo') as stream:
            text = stream.read(1024 * 1024 + 1)
        if len(text.encode()) > 1024 * 1024:
            raise Blocked('host mount topology too large')
        return cls(text)

    def identity(self, path):
        canonical = self.canonical(path)
        if not posixpath.isabs(canonical):
            raise Blocked('host path unresolved')
        if any(posixpath.commonpath([point, canonical]) == point for point in self.unresolved_points):
            raise Blocked('host mount stack unresolved for checked path')
        candidates = [point for point in self.entries if posixpath.commonpath([point, canonical]) == point]
        point = max(candidates, key=len)
        device, root = self.entries[point]
        metadata = self.stat_path(canonical)
        if (os.major(metadata.st_dev), os.minor(metadata.st_dev)) != device:
            raise Blocked('host path device changed')
        relative = posixpath.relpath(canonical, point)
        location = root if relative == '.' else posixpath.normpath(posixpath.join(root, relative))
        return canonical, device, location, metadata.st_ino

    def overlaps(self, source, approved):
        actual = self.identity(source)
        target = self.identity(approved)
        if any(posixpath.commonpath([point, actual[0]]) == actual[0] for point in self.unresolved_points):
            raise Blocked('host mount stack unresolved under bind source')
        regions = [actual]
        # A parent bind recursively exposes child mounts, including aliases.
        for point in self.entries:
            if point != actual[0] and posixpath.commonpath([point, actual[0]]) == actual[0]:
                regions.append(self.identity(point))
        return any(region[1] == target[1] and (region[3] == target[3] or path_overlap(region[2], target[2])) for region in regions)



def snapshot(docker, mountpoint, topology):
    listed = docker.get(LIST_PATH)
    if not isinstance(listed, list) or len(listed) > 128:
        raise Blocked('Docker active container listing invalid')
    ids = set()
    users = []
    identities = []
    for row in listed:
        container_id = row.get('Id') if isinstance(row, dict) else None
        if not isinstance(container_id, str) or not IDS.fullmatch(container_id) or container_id in ids or row.get('State') not in LIVE:
            raise Blocked('Docker active container identity invalid')
        ids.add(container_id)
        record = docker.get('/containers/' + container_id + '/json')
        if not isinstance(record, dict) or record.get('Id') != container_id or not isinstance(record.get('State'), dict) or record['State'].get('Status') != row['State']:
            raise Blocked('Docker container changed during probe')
        name = record.get('Name')
        mounts = record.get('Mounts')
        if not isinstance(name, str) or not re.fullmatch('/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', name) or not isinstance(mounts, list):
            raise Blocked('Docker container metadata invalid')
        identities.append((container_id, name, row['State']))
        for mount in mounts:
            if not isinstance(mount, dict) or not isinstance(mount.get('Source'), str) or type(mount.get('RW')) is not bool:
                raise Blocked('Docker mount metadata invalid')
            source = mount['Source']
            source_path = None
            if mount.get('Type') in {'volume', 'bind'}:
                if not os.path.isabs(source):
                    raise Blocked('Docker host mount source invalid')
                source_path = topology.identity(source)[0]
            same_storage = mount.get('Name') == VOLUME or (source_path is not None and topology.overlaps(source_path, mountpoint))
            if same_storage and mount['RW']:
                destination = mount.get('Destination')
                if mount.get('Type') not in {'volume', 'bind'} or not isinstance(destination, str) or not re.fullmatch('/[A-Za-z0-9_./-]*', destination):
                    raise Blocked('approved volume mount invalid')
                if mount.get('Type') == 'volume' and (mount.get('Name') != VOLUME or source_path != mountpoint):
                    raise Blocked('approved volume identity inconsistent')
                users.append({'id': container_id, 'name': name[1:], 'status': row['State'],
                              'destination': destination, 'rw': True, 'mount_type': mount['Type']})
    return sorted(identities), sorted(users, key=lambda user: (user['id'], user['destination'], user['mount_type']))


def probe(docker, topology_factory=None):
    volume = docker.get('/volumes/' + VOLUME)
    mountpoint = volume.get('Mountpoint') if isinstance(volume, dict) else None
    if not isinstance(volume, dict) or volume.get('Name') != VOLUME or not isinstance(mountpoint, str) or not mountpoint.startswith('/') or mountpoint == '/' or mountpoint.endswith('/'):
        raise Blocked('approved Docker volume unavailable')
    topology_factory = topology_factory or MountTopology.read
    topology = topology_factory()
    mountpoint = topology.identity(mountpoint)[0]
    if mountpoint == '/':
        raise Blocked('approved Docker volume mountpoint invalid')
    before_identity = topology.identity(mountpoint)
    before = snapshot(docker, mountpoint, topology)
    after_topology = topology_factory()
    after = snapshot(docker, mountpoint, after_topology)
    if topology.lines != after_topology.lines or before_identity != after_topology.identity(mountpoint) or before != after:
        raise Blocked('volume users changed during probe')
    result = {'ok': True, 'volume': VOLUME, 'count': len(after[1]), 'users': after[1]}
    if len(json.dumps(result).encode()) > PROBE_LIMIT:
        raise Blocked('probe response too large')
    return result


def main():
    try:
        if len(sys.argv) != 1 or os.geteuid() != 0:
            raise Blocked('probe invocation refused')
        activation_config(read_activation(), time.time())
        result = probe(Docker())
    except (Blocked, OSError, ValueError, TypeError, KeyError, http.client.HTTPException):
        result = {'ok': False}
    sys.stdout.write(json.dumps(result, separators=(',', ':')) + '\n')
    sys.stdout.flush()
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
