#!/usr/bin/python3
"""Install root-owned; dedicated account is restricted to this forced command."""
import os
import re
import shlex
import subprocess
import sys


def main():
    if os.geteuid() == 0:
        args = sys.argv[1:]
    else:
        try:
            command = shlex.split(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
        except ValueError:
            return 1
        if len(command) != 3 or command[0] != 'deploy':
            return 1
        args = command[1:]
    if len(args) != 2 or not re.fullmatch('[0-9a-f]{40}', args[0]) or not re.fullmatch('[1-9][0-9]{0,19}', args[1]):
        return 1
    if os.geteuid() != 0:
        return subprocess.run(['/usr/bin/sudo', '-n', '/usr/local/sbin/mstefan-event-deploy-trigger', *args], timeout=2700).returncode
    unit = 'mstefan-event-deploy@' + '-'.join(args) + '.service'
    return subprocess.run(['/usr/bin/systemctl', 'start', '--wait', unit], timeout=2650).returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.TimeoutExpired):
        sys.exit(1)
