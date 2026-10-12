"""Read only bounded PNG/metadata entries; never extract executable PR content."""
import json
import pathlib
import stat
import sys
import zipfile

root = pathlib.Path(sys.argv[1])
captures = []
metadata = None
total = 0
with zipfile.ZipFile(root / 'artifact.zip') as archive:
    entries = archive.infolist()
    if len(entries) > 2000:
        raise ValueError('Too many artifact entries')
    seen = set()
    for entry in entries:
        path = pathlib.PurePosixPath(entry.filename)
        if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or stat.S_ISLNK(entry.external_attr >> 16) or entry.filename in seen:
            raise ValueError('Unsafe artifact path')
        seen.add(entry.filename)
        total += entry.file_size
        if total > 250 * 1024 * 1024:
            raise ValueError('Artifact expansion limit')
        if entry.filename == 'evidence/metadata.json':
            if entry.file_size > 100000:
                raise ValueError('Metadata limit')
            metadata = json.loads(archive.read(entry))
        elif path.parts[0] in ('test-results', 'workshop') and path.suffix == '.png' and not path.name.endswith(('-actual.png', '-expected.png', '-diff.png')) and not path.name.startswith('test-failed-'):
            if entry.file_size > 5 * 1024 * 1024 or len(captures) >= 102:
                raise ValueError('Capture limit')
            target = f'capture-{len(captures)}.png'
            (root / target).write_bytes(archive.read(entry))
            captures.append({'name': path.name, 'file': target})
if metadata is None:
    raise ValueError('Missing evidence metadata')
(root / 'inventory.json').write_text(json.dumps({'metadata': metadata, 'captures': captures}))
