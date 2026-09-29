#!/usr/bin/python3
import os
import re
import sys

if len(sys.argv) != 2 or not re.fullmatch('[0-9a-f]{40}-[1-9][0-9]{0,19}', sys.argv[1]):
    sys.exit(1)
sha, run_id = sys.argv[1].split('-')
os.execv('/usr/bin/python3', ['/usr/bin/python3', '/opt/mstefan-event-deploy/controller.py', sha, run_id])
