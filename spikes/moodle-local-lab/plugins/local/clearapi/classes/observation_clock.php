<?php
// GPL-3.0-or-later. Pure time-window check; no Moodle or user data access.
namespace local_clearapi;
class observation_clock {
    public static function bounds($started, $finished, $elapsed) {
        if (!is_finite($started) || !is_finite($finished) || !is_finite($elapsed)
            || $started < 0 || $finished < $started || $elapsed < 0 || $elapsed > 300) {
            throw new \RuntimeException('EXPORT_OBSERVATION_WINDOW');
        }
        $lower=(int)floor($started); $upper=(int)ceil($finished);
        if ($upper > $lower+300) throw new \RuntimeException('EXPORT_OBSERVATION_WINDOW');
        return ['lower'=>$lower,'upper'=>$upper,'validUntil'=>$lower+300];
    }
}
