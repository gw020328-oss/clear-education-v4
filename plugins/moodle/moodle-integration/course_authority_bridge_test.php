<?php
namespace local_clearbridge {
    function is_siteadmin($id) { return $GLOBALS['f']['admin'] ?? false; }
    function accesslib_clear_all_caches($contexts) { $GLOBALS['f']['clears']++; }
    function get_user_roles_sitewide_accessdata($user) {
        $GLOBALS['f']['acluser'] = $user;
        return ['ra' => ['/1/9' => [5 => 5]]];
    }
    function has_capability_in_accessdata($capability, $context, &$access) {
        $GLOBALS['f']['checkedcapability'] = $capability;
        return $GLOBALS['f']['capability'];
    }
}
namespace {
    define('CLEAR_AUTHORITY_TEST_LIBRARY_ONLY', true);
    require __DIR__ . '/course_authority_lease_test.php';
    foreach (['course_authority_registry', 'course_authority_currentness'] as $file) {
        require __DIR__ . '/../local_clearbridge/classes/' . $file . '.php';
    }
    use local_clearbridge\course_authority_registry as Registry;
    use local_clearbridge\course_authority_currentness as Currentness;
    function reset_bridge(): void {
        reset_fixture();
        $GLOBALS['f'] += ['clears' => 0, 'coursevisible' => true, 'categoryvisible' => true, 'mappingok' => true, 'reads' => [], 'generationhook' => static function () {}];
        $GLOBALS['DB'] = new class {
            public function is_transaction_started() { return $GLOBALS['f']['transaction'] ?? false; }
            public function get_record($table, $where, $fields) {
                $GLOBALS['f']['reads'][] = [$table, array_keys($where), $fields];
                if ($table === 'sessions') {
                    if (!$GLOBALS['f']['session'] || (isset($where['id']) && $where['id'] !== $GLOBALS['f']['session'])) { return false; }
                    return (object)['id' => $GLOBALS['f']['session'], 'timecreated' => 1999999000, 'timemodified' => 2000000000];
                }
                if ($table === 'course') { return $GLOBALS['f']['coursevisible'] ? (object)['id' => 7, 'category' => 3] : false; }
                if ($table === 'course_categories') { return (object)['id' => 3, 'path' => '/2/3']; }
                if ($table === 'config') {
                    $name = $where['name'];
                    return isset($GLOBALS['CFG']->$name) ? (object)['value' => !empty($GLOBALS['f']['configdrift'])
                        ? 'changed' : (string)$GLOBALS['CFG']->$name] : false;
                }
                throw new RuntimeException('Unexpected table');
            }
            public function record_exists($table, $where) {
                $GLOBALS['f']['reads'][] = [$table, array_keys($where), 'exists'];
                return $table === 'user' ? $GLOBALS['f']['user'] : $GLOBALS['f']['categoryvisible'];
            }
        };
    }
    function currentness(): Currentness {
        return new Currentness(static function () { ($GLOBALS['f']['generationhook'])(); return generation(); },
            static function ($binding, $role) {
                return ['binding' => $binding, 'courseId' => 7, 'actorUserId' => 42,
                    'subjectUserId' => $GLOBALS['f']['mappingok'] ? ($role === 'PARTICIPANT' ? 42 : 43) : 44];
            });
    }
    function new_registry(): array {
        $dir = sys_get_temp_dir() . '/clear-authority-' . bin2hex(random_bytes(8));
        mkdir($dir, 0700); $path = $dir . '/run.json';
        file_put_contents($path, json_encode(['version' => 'clear-moodle-authority-registry.1', 'ownerRunId' => 'run-1',
            'wallFloor' => 0, 'leases' => [], 'nonces' => []])); chmod($path,0600);
        return [new Registry($path,'run-1'),$path];
    }
    function cleanup_registry($path): void { if (is_file($path) || is_link($path)) { unlink($path); } rmdir(dirname($path)); }
    function bridge_test($label, $body): void {
        reset_bridge(); [$registry,$path] = new_registry();
        try { $body($registry,$path); echo "PASS $label\n"; } finally { cleanup_registry($path); }
    }
    function publish($registry, $reader = null, $role = 'PARTICIPANT'): array {
        $reader ??= currentness(); $lease = issue($role); $q = query($lease); $q['role'] = $role;
        $lease->attach_bridge($registry,$reader);
        expect($lease->publish_request($q),'publish'); return [$lease,$q,$reader];
    }
    function rejected($fn): void {
        $failed = false; try { $fn(); } catch (Throwable $error) { $failed = true; } expect($failed,'expected rejection');
    }
    function config(): array { return ['enabled' => true,'origin' => 'https://moodle.test','ownerRunId' => 'run-1','key' => str_repeat('a',64)]; }
    function signed($q, $nonce = null): array {
        $raw = json_encode($q,JSON_UNESCAPED_SLASHES); $nonce ??= bin2hex(random_bytes(16)); $stamp = (string)$GLOBALS['f']['wall'];
        $server = ['REQUEST_METHOD' => 'POST','REQUEST_URI' => Currentness::PATH,'HTTP_HOST' => 'moodle.test','HTTPS' => 'on',
            'CONTENT_TYPE' => 'application/json','HTTP_X_CLEAR_TIMESTAMP' => $stamp,'HTTP_X_CLEAR_NONCE' => $nonce,
            'HTTP_X_CLEAR_SIGNATURE' => hash_hmac('sha256',implode("\n",[Currentness::DOMAIN,$stamp,$nonce,'POST',Currentness::PATH,hash('sha256',$raw)]),config()['key'])];
        return [$server,$raw];
    }
    if (($argv[1] ?? '') === 'nonce-worker') {
        reset_bridge(); fgets(STDIN);
        try { (new Registry($argv[2],'run-1'))->claim_nonce(str_repeat('c',32),2000000000); exit(0); }
        catch (Throwable $error) { exit(7); }
    }
    if (defined('CLEAR_AUTHORITY_BRIDGE_LIBRARY_ONLY')) { return; }
    bridge_test('published original request is readable by a separate registry instance with exact 13 fields', function ($registry,$path) {
        [$lease,$q,$reader] = publish($registry); $GLOBALS['f']['reads'] = [];
        $result = $reader->respond($q,new Registry($path,'run-1'));
        expect($result['status'] === 'OK' && count($result) === 13 && $result['actorRef'] === 'actor-1','reply');
        foreach ($GLOBALS['f']['reads'] as [$table,$keys,$fields]) {
            expect(!in_array('sid',$keys,true) && !str_contains($fields,'sessdata'),'no SID or session payload callback read');
        }
        expect($GLOBALS['f']['clears'] >= 3 && $GLOBALS['f']['acluser'] === 42,'fresh actor ACL');
        expect($lease->revoke() && $reader->respond($q,$registry)['status'] === 'UNAVAILABLE','finally-equivalent revoke');
    });
    bridge_test('direction separated MAC and exact authenticated request are accepted', function ($registry) {
        [$lease,$q,$reader] = publish($registry); [$server,$raw] = signed($q);
        [$parsed,$nonce,$stamp] = Currentness::authenticate($server,$raw,config(),str_repeat('b',64));
        $registry->claim_nonce($nonce,$stamp); expect($reader->respond($parsed,$registry)['status'] === 'OK','authenticated read');
        rejected(fn()=>$registry->claim_nonce($nonce,$stamp)); $lease->revoke();
    });
    bridge_test('cookies bearer bad host path method TLS content type and signature fail authentication', function ($registry) {
        [$lease,$q] = publish($registry); [$server,$raw] = signed($q);
        foreach (['HTTP_COOKIE'=>'session=private','HTTP_AUTHORIZATION'=>'Bearer private','HTTP_HOST'=>'other.test',
            'REQUEST_URI'=>Currentness::PATH.'?x=1','REQUEST_METHOD'=>'GET','HTTPS'=>'off','CONTENT_TYPE'=>'text/plain',
            'HTTP_X_CLEAR_SIGNATURE'=>str_repeat('0',64),'HTTP_CONTENT_ENCODING'=>'gzip'] as $key=>$value) {
            $changed=$server; $changed[$key]=$value;
            rejected(fn()=>Currentness::authenticate($changed,$raw,config(),str_repeat('b',64)));
        }
        $lease->revoke();
    });
    bridge_test('outbound key reuse and cross-direction signing material reject', function ($registry) {
        [$lease,$q] = publish($registry); [$server,$raw] = signed($q);
        rejected(fn()=>Currentness::authenticate($server,$raw,config(),config()['key']));
        $server['HTTP_X_CLEAR_SIGNATURE'] = hash_hmac('sha256',implode("\n",[$server['HTTP_X_CLEAR_TIMESTAMP'],
            $server['HTTP_X_CLEAR_NONCE'],'POST',Currentness::PATH,hash('sha256',$raw)]),config()['key']);
        rejected(fn()=>Currentness::authenticate($server,$raw,config(),str_repeat('b',64))); $lease->revoke();
    });
    bridge_test('wrong run expiry and duplicate JSON keys with valid MAC reject', function ($registry) {
        [$lease,$q] = publish($registry);
        foreach (['ownerRunId'=>'run-2','expiresAtExclusive'=>2000000000] as $key=>$value) {
            $bad=$q; $bad[$key]=$value; [$server,$raw]=signed($bad);
            rejected(fn()=>Currentness::authenticate($server,$raw,config(),str_repeat('b',64)));
        }
        [$server,$raw]=signed($q); $raw=substr($raw,0,-1).',"role":"PARTICIPANT"}';
        $server['HTTP_X_CLEAR_SIGNATURE']=hash_hmac('sha256',implode("\n",[Currentness::DOMAIN,$server['HTTP_X_CLEAR_TIMESTAMP'],
            $server['HTTP_X_CLEAR_NONCE'],'POST',Currentness::PATH,hash('sha256',$raw)]),config()['key']);
        rejected(fn()=>Currentness::authenticate($server,$raw,config(),str_repeat('b',64))); $lease->revoke();
    });
    bridge_test('numeric-looking request refs cannot cross registry binding', function ($registry) {
        $lease=issue(); $q=query($lease); $q['requestRef']='0e'.str_repeat('1',62);
        $reader=currentness(); $lease->attach_bridge($registry,$reader); expect($lease->publish_request($q),'publish');
        expect($reader->respond(array_reverse($q,true),$registry)['status']==='OK','key order');
        $q['requestRef']='0e'.str_repeat('2',62);
        expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','strict cross-request'); $lease->revoke();
    });
    bridge_test('session deletion account enrolment role course and parent category revocations deny', function ($registry,$path) {
        foreach (['session'=>0,'user'=>false,'enrol'=>false,'capability'=>false,'definition'=>-1,'coursevisible'=>false,'categoryvisible'=>false,'admin'=>true,'transaction'=>true,'configdrift'=>true] as $key=>$value) {
            reset_bridge(); [$lease,$q,$reader]=publish($registry); $GLOBALS['f'][$key]=$value;
            expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','revocation '.$key);
            expect($registry->lookup($q)===null,'failed authority retired'); $lease->revoke();
        }
    });
    bridge_test('same-final-state epoch change installation generation and current mapping mismatch deny', function ($registry) {
        foreach (['epoch'=>13,'generation'=>'restore-2','mappingok'=>false] as $key=>$value) {
            reset_bridge(); [$lease,$q,$reader]=publish($registry); $GLOBALS['f'][$key]=$value;
            expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','generation mapping'); $lease->revoke();
        }
    });
    bridge_test('teacher uses separate actor ACL while verifying target student enrolment', function ($registry) {
        [$lease,$q,$reader]=publish($registry,null,'COURSE_OPERATOR'); $GLOBALS['f']['reads']=[];
        expect($reader->respond($q,$registry)['status']==='OK' && $GLOBALS['f']['checkedcapability']==='local/clearbridge:configure','teacher');
        $r=$registry->lookup($q); expect($r['actorUserId']===42 && $r['subjectUserId']===43,'separate subjects'); $lease->revoke();
    });
    bridge_test('authority changed between first and final DB verification denies reply', function ($registry) {
        [$lease,$q,$reader]=publish($registry); $calls=0;
        $GLOBALS['f']['generationhook']=static function () use (&$calls) { if (++$calls===3) { $GLOBALS['f']['epoch']++; } };
        expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','final check'); $lease->revoke();
    });
    bridge_test('original page revoke between callback checks denies reply', function ($registry) {
        [$lease,$q,$reader]=publish($registry); $calls=0;
        $GLOBALS['f']['generationhook']=static function () use (&$calls,$lease) { if (++$calls===2) { $lease->revoke(); } };
        expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','revoked during read');
    });
    bridge_test('exclusive expiry wall rollback and original monotonic deadline deny', function ($registry) {
        foreach (['mono'=>15000000000,'wall'=>2000000005] as $key=>$value) {
            reset_bridge(); [$lease,$q,$reader]=publish($registry); $GLOBALS['f'][$key]=$value;
            expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','expiry'); $lease->revoke();
        }
    });
    bridge_test('registry missing unsafe permissions corrupt data and lock contention never repair or allow', function ($registry,$path) {
        [$lease,$q,$reader]=publish($registry);
        rejected(fn()=>new Registry($path.'.absent','run-1'));
        $handle=fopen($path,'r+b'); flock($handle,LOCK_EX); rejected(fn()=>$registry->lookup($q)); flock($handle,LOCK_UN); fclose($handle);
        chmod($path,0644); rejected(fn()=>$registry->lookup($q)); chmod($path,0600);
        file_put_contents($path,'{broken'); rejected(fn()=>$registry->lookup($q));
        expect(file_get_contents($path)==='{broken','no repair');
    });
    bridge_test('page publishes exact wire request before owner and finally removes it', function ($registry) {
        $lease=issue(); $reader=currentness(); $seen=null;
        $GLOBALS['CFG']->local_clearbridge_course_authority_bridge=static fn()=>['registry'=>$registry,'currentness'=>$reader];
        $GLOBALS['CFG']->local_clearbridge_course_authority=static fn()=>$lease;
        $GLOBALS['CFG']->local_clearbridge_course_read=['enabled'=>true,'origin'=>'https://fixture.invalid','ca'=>__FILE__,
            'ownerRunId'=>'run-1','key'=>str_repeat('d',64),'synthetic'=>true];
        // The read-client shim runs after publish_request; inspect the private registry only in this fixture.
        $GLOBALS['f']['owner']=static function () use ($lease) { expect($lease->bridge_current(),'visible to callback before owner'); };
        $view=\local_clearbridge\course_projection_page::data((object)['id'=>7],true);
        expect($view['hasrecords'] && !$lease->is_current(),'page success and cleanup');
    });
    bridge_test('two processes cannot consume the same authenticated nonce', function ($registry,$path) {
        $children=[];
        for ($i=0;$i<2;$i++) {
            $pipes=[];
            $process=proc_open([PHP_BINARY,__FILE__,'nonce-worker',$path],
                [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
            expect(is_resource($process),'worker start'); $children[]=[$process,$pipes];
        }
        foreach ($children as [$process,$pipes]) { fwrite($pipes[0],"go\n"); fclose($pipes[0]); }
        $codes=[];
        foreach ($children as [$process,$pipes]) {
            expect(stream_get_contents($pipes[1])==='' && stream_get_contents($pipes[2])==='','no worker output');
            fclose($pipes[1]); fclose($pipes[2]); $codes[]=proc_close($process);
        }
        sort($codes); expect($codes===[0,7],'one accepted');
    });
}

namespace {
    bridge_test('registry wall rollback and absent generation source deny without substituting an epoch', function ($registry) {
        [$lease,$q,$reader]=publish($registry);
        $GLOBALS['f']['generationhook']=static function () { throw new RuntimeException('generation unavailable'); };
        expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','missing generation'); $lease->revoke();
        reset_bridge(); [$lease,$q,$reader]=publish($registry); $GLOBALS['f']['wall']--;
        expect($reader->respond($q,$registry)['status']==='UNAVAILABLE','wall rollback');
    });
    bridge_test('installed endpoint runs in a separate cookie-free HTTP worker and preserves fail-closed responses', function ($registry,$path) {
        [$lease,$q,$reader]=publish($registry);
        $root=dirname($path).'/web'; mkdir($root,0700); mkdir($root.'/local',0700); mkdir($root.'/local/clearbridge',0700);
        copy(__DIR__.'/../local_clearbridge/authority.php',$root.'/local/clearbridge/authority.php');
        // Synthetic bootstrap only. HTTPS server flag is modeled here; this is not TLS validation.
        $configcode="<?php\ndefine('CLEAR_AUTHORITY_BRIDGE_LIBRARY_ONLY',true);\nrequire ".var_export(__FILE__,true).";\nreset_bridge();\n";
        $configcode.="\$_SERVER['HTTPS']='on';\n\$CFG->local_clearbridge_authority_service=config();\n";
        $configcode.="\$CFG->local_clearbridge_course_read=['key'=>str_repeat('b',64)];\n";
        $configcode.="\$CFG->local_clearbridge_course_authority_bridge=static fn()=>['registry'=>new \\local_clearbridge\\course_authority_registry(".
            var_export($path,true).",'run-1'),'currentness'=>currentness()];\n";
        file_put_contents($root.'/config.php',$configcode);
        $port=random_int(20000,45000); $log=dirname($path).'/http.log';
        $pipes=[]; $server=proc_open([PHP_BINARY,'-S','127.0.0.1:'.$port,'-t',$root],
            [0=>['pipe','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes);
        expect(is_resource($server),'HTTP worker'); fclose($pipes[0]);
        try {
            $ready=false;
            for ($i=0;$i<40;$i++) {
                $socket=@fsockopen('127.0.0.1',$port,$errno,$errstr,0.05);
                if ($socket) { fclose($socket); $ready=true; break; } usleep(25000);
            }
            expect($ready,'HTTP ready');
            $call=static function ($headers,$body) use ($port) {
                $ch=curl_init('http://127.0.0.1:'.$port.'/local/clearbridge/authority.php');
                $out=[];
                curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,CURLOPT_HTTPHEADER=>$headers,
                    CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>2,CURLOPT_PROXY=>'',
                    CURLOPT_HEADERFUNCTION=>static function ($handle,$line) use (&$out) { $out[]=$line; return strlen($line); }]);
                $result=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
                expect(!str_contains(strtolower(implode('',$out)),'set-cookie:'),'no response session cookie');
                return [$status,json_decode($result,true,32,JSON_THROW_ON_ERROR)];
            };
            $headers=static function ($server) {
                return ['Content-Type: application/json','Host: moodle.test','X-Clear-Timestamp: '.$server['HTTP_X_CLEAR_TIMESTAMP'],
                    'X-Clear-Nonce: '.$server['HTTP_X_CLEAR_NONCE'],'X-Clear-Signature: '.$server['HTTP_X_CLEAR_SIGNATURE']];
            };
            [$signed,$raw]=signed($q); [$status,$result]=$call($headers($signed),$raw);
            expect($status===200 && $result['status']==='OK' && count($result)===13,'HTTP verified reply');
            [$status]=$call($headers($signed),$raw); expect($status===403,'HTTP replay');
            [$signed,$raw]=signed($q); [$status]=$call([...$headers($signed),'Cookie: MoodleSession=private'],$raw);
            expect($status===403,'HTTP cookie reject before bootstrap');
            $lease->revoke(); [$signed,$raw]=signed($q); [$status,$result]=$call($headers($signed),$raw);
            expect($status===200 && $result['status']==='UNAVAILABLE' && $result['authorityEpoch']===null,'HTTP revoked reply');
        } finally {
            proc_terminate($server); proc_close($server);
            foreach ([$root.'/local/clearbridge/authority.php',$root.'/config.php',$log] as $file) { unlink($file); }
            rmdir($root.'/local/clearbridge'); rmdir($root.'/local'); rmdir($root);
        }
    });
}
