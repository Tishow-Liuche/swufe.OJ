import unittest
from judge_tunnel_origin import direct_origin_unit


class OriginTunnelTests(unittest.TestCase):
    unit = ('[Service]\nEnvironmentFile=/private/credentials\n'
            'ExecStart=/opt/chisel client --auth ${AUTH} --keepalive 25s '
            'https://oj.example/judge-worker-tunnel '
            '127.0.0.1:15432:postgres:5432 127.0.0.1:16379:redis:6379\n'
            'Restart=always\nNoNewPrivileges=true\n')
    fingerprint = 'A' * 43 + '='

    def convert(self, unit=None):
        return direct_origin_unit(unit or self.unit, '192.0.2.10', 'oj.example', self.fingerprint)

    def test_direct_route_retains_tls_auth_bindings_and_hardening(self):
        result = self.convert()
        self.assertIn('--hostname oj.example --sni oj.example', result)
        self.assertIn('--fingerprint ' + self.fingerprint, result)
        self.assertIn('https://192.0.2.10/judge-worker-tunnel', result)
        for text in ['--auth ${AUTH}', 'EnvironmentFile=/private/credentials', '127.0.0.1:15432:postgres:5432', '127.0.0.1:16379:redis:6379', 'NoNewPrivileges=true']:
            self.assertIn(text, result)
        self.assertNotIn('skip-verify', result)

    def test_retains_existing_pin(self):
        unit = self.unit.replace('client ', 'client --fingerprint ' + self.fingerprint + ' ')
        self.assertEqual(self.convert(unit).count('--fingerprint'), 1)

    def test_rejects_different_pin(self):
        with self.assertRaises(ValueError):
            self.convert(self.unit.replace('client ', 'client --fingerprint ' + 'B' * 43 + '= '))

    def test_rejects_unexpected_or_insecure_units(self):
        for unit in [self.unit.replace('https://', 'http://'), self.unit.replace('client ', 'client --tls-skip-verify '), self.unit.replace('oj.example/', 'other.example/'), self.unit + 'ExecStart=/bin/true\n', self.unit.replace('client ', 'client --proxy http://proxy '), self.unit.replace('client ', 'client --sni other.example ')]:
            with self.subTest(unit=unit), self.assertRaises(ValueError):
                self.convert(unit)

    def test_rejects_hostname_as_origin_and_malformed_pin(self):
        with self.assertRaises(ValueError):
            direct_origin_unit(self.unit, 'other.example', 'oj.example', self.fingerprint)
        with self.assertRaises(ValueError):
            direct_origin_unit(self.unit, '192.0.2.10', 'oj.example', '')

    def test_rejects_quoted_destination_instead_of_inserting_options_inside_quotes(self):
        for quote in ['"', "'"]:
            with self.subTest(quote=quote), self.assertRaises(ValueError):
                self.convert(self.unit.replace('https://oj.example/judge-worker-tunnel', quote + 'https://oj.example/judge-worker-tunnel' + quote))


if __name__ == '__main__':
    unittest.main()
