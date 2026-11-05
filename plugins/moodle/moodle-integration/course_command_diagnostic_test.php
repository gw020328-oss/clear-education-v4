<?php
// Actual command client; modeled identity/clock/transport, no live owner or credentials.
define('CLEAR_COMMAND_AUTHORITY_LIBRARY_ONLY', true);
require __DIR__ . '/course_command_authority_test.php';

use local_clearbridge\course_login_authority as Login;
use local_clearbridge\course_login_client as Client;

foreach (['ok', 'http503', 'status0', 'string-status', 'invalid-json', 'schema', 'origin',
        'capture', 'registry', 'sink-throws', 'sink-throws-rejected', 'cleanup-also-fails'] as $scenario) {
    command_case("diagnostic $scenario preserves authorization and records only fixed stages/status", function($q,$r,$registry,$config,$path)
            use ($scenario) {
        $events = [];
        $observer = static function($phase, $event, $http) use (&$events, $scenario): void {
            $events[] = [$phase, $event, $http];
            if (str_starts_with($scenario, 'sink-throws')) {
                throw new RuntimeException('SYNTHETIC_PRIVATE_EXCEPTION');
            }
        };
        $GLOBALS['f']['owner'] = static function() use($scenario,$registry,$config,$path): void {
            $request = $GLOBALS['f']['lastRequest'];
            Login::respond('authorize-command', $request, $config, $registry);
            $GLOBALS['f']['loginreply'] = ['version'=>Login::COMMAND_VERSION,'requestRef'=>$request['requestRef'],
                'status'=>'AUTHORIZED','expiresAtExclusive'=>$request['expiresAtExclusive']];
            if (in_array($scenario, ['http503','status0','string-status'], true)) {
                $GLOBALS['f']['httpstatus'] = match ($scenario) {'http503'=>503,'status0'=>0,default=>'503'};
            }
            if ($scenario === 'invalid-json') { $GLOBALS['f']['rawreply'] = 'SYNTHETIC_PRIVATE_BODY'; }
            if (in_array($scenario, ['schema','sink-throws-rejected','cleanup-also-fails'], true)) {
                $GLOBALS['f']['loginreply']['status'] = 'SYNTHETIC_PRIVATE_STATUS';
            }
            if ($scenario === 'origin') { $GLOBALS['f']['session'] = 32; }
            if ($scenario === 'cleanup-also-fails') { file_put_contents($path, 'SYNTHETIC_CORRUPT_REGISTRY'); }
        };
        if ($scenario === 'capture') { $GLOBALS['f']['capability'] = false; }
        if ($scenario === 'registry') { $config['registry'] .= '-missing'; }
        $client = new Client($config, $r['scope'], 42, 'PARTICIPANT', $observer);
        $call = fn() => $client->request('authorize-command', ['intentRef'=>$q['intentRef'],'commandHash'=>$q['commandHash']]);
        $ok = in_array($scenario, ['ok','sink-throws'], true);
        if ($ok) { expect($call()['status'] === 'AUTHORIZED', 'same success'); }
        else { rejected($call); }
        $lastphase = null;
        $firstfailure = null;
        foreach ($events as [$phase,$event,$http]) {
            if ($phase !== null) { $lastphase = $phase; }
            if ($event === 'REJECTED' && $firstfailure === null) { $firstfailure = $lastphase; }
            expect($http === null || is_int($http) && $http >= 100 && $http <= 599, 'status is bounded integer or null');
        }
        $expected = match ($scenario) {
            'ok','sink-throws'=>'CLIENT_ACCEPTED',
            'http503','status0','string-status'=>'AUTHORITY_TRANSPORT',
            'invalid-json'=>'RESPONSE_DECODE',
            'schema','sink-throws-rejected','cleanup-also-fails'=>'RESPONSE_SCHEMA',
            'origin'=>'ORIGIN_RECHECK',
            'capture'=>'AUTHORITY_CAPTURE',
            'registry'=>'REGISTRY_OPEN',
        };
        expect(($firstfailure ?? $lastphase) === $expected, 'first failure stage preserved');
        $httpEvents = array_values(array_filter($events, static fn($row) => $row[1] === 'HTTP'));
        if (!in_array($scenario, ['capture','registry'], true)) {
            expect(count($httpEvents) === 1 && $httpEvents[0][2] === match($scenario) {
                'http503'=>503,'status0','string-status'=>null,default=>200,
            }, 'observed upstream status');
        }
        $encoded = json_encode($events);
        foreach ([$q['intentRef'], $q['commandHash'], 'SYNTHETIC_PRIVATE', 'run-1', 'owner.test', 'synthetic-sid'] as $forbidden) {
            expect(!str_contains($encoded, $forbidden), 'no request or exception values reach observer');
        }
        if ($scenario !== 'cleanup-also-fails') {
            $state = json_decode(file_get_contents($path), true);
            expect(count($state['leases']) === ($ok ? 1 : 0), 'retention/revocation unchanged');
        }
    });
}

command_case('diagnostic is silent for non-command operations', function($q,$r,$registry,$config) {
    $events = [];
    $GLOBALS['f']['owner'] = static function(): void {
        $request = $GLOBALS['f']['lastRequest'];
        $GLOBALS['f']['loginreply'] = ['version'=>Login::VERSION,'requestRef'=>$request['requestRef'],
            'status'=>'CONNECTED','expiresAtExclusive'=>2000000300,'handback'=>null];
    };
    $client = new Client($config, $r['scope'], 42, 'PARTICIPANT', static function(...$args) use (&$events): void {
        $events[] = $args;
    });
    expect($client->request('status', ['intentRef'=>$q['intentRef']])['status'] === 'CONNECTED', 'same status response');
    expect($events === [], 'no non-command observations');
});
