#!/usr/bin/python3
"""Socket-activated read-only probe. No input, command or environment arguments."""
import http.client
import json
import os
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


def snapshot(docker, mountpoint):
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
                source_path = os.path.realpath(source)
            same_storage = mount.get('Name') == VOLUME or (source_path is not None and os.path.commonpath([source_path, mountpoint]) in {source_path, mountpoint})
            if same_storage and mount['RW']:
                destination = mount.get('Destination')
                if mount.get('Type') not in {'volume', 'bind'} or not isinstance(destination, str) or not re.fullmatch('/[A-Za-z0-9_./-]*', destination):
                    raise Blocked('approved volume mount invalid')
                if mount.get('Type') == 'volume' and (mount.get('Name') != VOLUME or source_path != mountpoint):
                    raise Blocked('approved volume identity inconsistent')
                users.append({'id': container_id, 'name': name[1:], 'status': row['State'],
                              'destination': destination, 'rw': True, 'mount_type': mount['Type']})
    return sorted(identities), sorted(users, key=lambda user: (user['id'], user['destination'], user['mount_type']))


def probe(docker):
    volume = docker.get('/volumes/' + VOLUME)
    mountpoint = volume.get('Mountpoint') if isinstance(volume, dict) else None
    if not isinstance(volume, dict) or volume.get('Name') != VOLUME or not isinstance(mountpoint, str) or not mountpoint.startswith('/') or mountpoint == '/' or mountpoint.endswith('/'):
        raise Blocked('approved Docker volume unavailable')
    mountpoint = os.path.realpath(mountpoint)
    if mountpoint == '/':
        raise Blocked('approved Docker volume mountpoint invalid')
    before = snapshot(docker, mountpoint)
    after = snapshot(docker, mountpoint)
    if before != after:
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
