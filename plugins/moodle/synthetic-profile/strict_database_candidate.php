<?php
namespace clear_synthetic;

// Test-environment-only handler candidate. No production CFG registration.
class strict_database_candidate extends \core\session\database {
    private bool $writefailed = false;

    public function write(string $id, string $data): bool {
        if ($this->failed || $this->writefailed || !$this->recordid || !$this->requires_write_lock()) {
            $this->writefailed = true;
            return false;
        }
        $encoded = base64_encode($data);
        try {
            // Exact comparison with current persistent bytes avoids relying on a stale cached hash.
            $stored = $this->database->get_record('sessions', ['id' => $this->recordid], 'id,sessdata');
            if (!$stored) {
                throw new \RuntimeException('SESSION_GONE');
            }
            if ($stored->sessdata !== $encoded) {
                $this->database->set_field('sessions', 'sessdata', $encoded, ['id' => $this->recordid]);
            }
            $stored = $this->database->get_record('sessions', ['id' => $this->recordid], 'id,sessdata');
            if (!$stored || $stored->sessdata !== $encoded) {
                throw new \RuntimeException('SESSION_PERSISTENCE');
            }
            $this->lasthash = sha1($encoded);
            return true;
        } catch (\Throwable $error) {
            // Sticky failure, generic signal, no sid/raw data/error message logging.
            $this->writefailed = true;
            return false;
        }
    }

    public function flush_for_confirmation(string $id, string $data, object $user, array $session): int {
        reject_assumed_identity($user, $session);
        require_rule($this->write($id, $data), 'SESSION_PERSISTENCE');
        // Caller must still hold session + DB row/authority locks and revalidate profile/generation.
        // This receipt alone is intentionally insufficient to issue a confirmation.
        return $this->recordid;
    }
}
