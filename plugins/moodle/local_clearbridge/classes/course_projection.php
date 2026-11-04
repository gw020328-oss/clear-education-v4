<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * In-process result of an owner-verified, read-only course lookup.
 * The provider owns current CLEAR authorization and cross-service scope matching.
 */
final class course_projection {
    public function __construct(
        public readonly array $evidence,
        public readonly array $payment,
        public readonly bool $synthetic = false,
        public readonly ?int $expiresAtExclusive = null,
    ) {
    }
}
