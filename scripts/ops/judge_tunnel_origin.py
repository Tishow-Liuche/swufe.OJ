"""Generate a reviewed direct-origin chisel unit; never restart services or print secrets.

The operator must drain the judge queue and retain the original unit before installing.
The original HTTPS name remains both SNI and Host, with certificate and key pin checks.
"""
import argparse
import ipaddress
import os
from pathlib import Path
import re
import shlex


def direct_origin_unit(unit, origin, hostname, fingerprint):
    address = ipaddress.ip_address(origin)
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', hostname):
        raise ValueError('Invalid TLS hostname')
    if not re.fullmatch(r'[A-Za-z0-9+/]{43}=', fingerprint):
        raise ValueError('Expected pinned SHA256 fingerprint')
    lines = unit.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.strip().startswith('ExecStart=')]
    if len(starts) != 1:
        raise ValueError('Expected exactly one ExecStart')
    index = starts[0]
    line = lines[index]
    if line.rstrip().endswith('\\'):
        raise ValueError('Multiline commands require manual review')
    tokens = shlex.split(line.split('=', 1)[1])
    if len(tokens) < 3 or tokens[1] != 'client':
        raise ValueError('Expected direct chisel client command')
    forbidden = ('--tls-skip-verify', '--proxy', '--hostname', '--sni')
    if any(t.split('=', 1)[0] in forbidden for t in tokens):
        raise ValueError('Unexpected TLS/routing override; review manually')
    url = 'https://' + hostname + '/judge-worker-tunnel'
    if tokens.count(url) != 1 or line.count(url) != 1 or not re.search(r'\s' + re.escape(url) + r'(?=\s|$)', line):
        raise ValueError('Unexpected tunnel destination')
    pin_args = [i for i, t in enumerate(tokens) if t.split('=', 1)[0] == '--fingerprint']
    if len(pin_args) > 1:
        raise ValueError('Duplicate fingerprint')
    pin_option = '--fingerprint ' + fingerprint + ' '
    if pin_args:
        i = pin_args[0]
        old_pin = tokens[i].split('=', 1)[1] if '=' in tokens[i] else tokens[i + 1] if i + 1 < len(tokens) else ''
        if old_pin != fingerprint:
            raise ValueError('Existing fingerprint differs; refusing key replacement')
        pin_option = ''
    destination = '[' + str(address) + ']' if address.version == 6 else str(address)
    options = '--hostname ' + hostname + ' --sni ' + hostname + ' ' + pin_option
    # Replace only this URL: auth variables, local bindings and hardening stay byte-for-byte.
    lines[index] = line.replace(url, options + 'https://' + destination + '/judge-worker-tunnel')
    return ''.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['unit', 'output', 'origin', 'hostname', 'fingerprint']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    result = direct_origin_unit(Path(args.unit).read_text(), args.origin, args.hostname, args.fingerprint)
    # Exclusive creation prevents accidental overwrite of a live unit or backup.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write(result)
    print('Candidate unit written with verified-name TLS and pinned server identity; no service changed.')
