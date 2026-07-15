import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// 12-type remote-judge status state machine (Judge0-inspired)
//
// Terminal states — no further polling needed:
//   ACCEPTED, WRONG_ANSWER, TIME_LIMIT_EXCEEDED, MEMORY_LIMIT_EXCEEDED,
//   RUNTIME_ERROR, COMPILE_ERROR, CANCELLED, SYSTEM_ERROR, REMOTE_ERROR
//
// Transient states — polling continues:
//   JUDGING, QUEUING, SUBMITTING
// ---------------------------------------------------------------------------

export type OjStatus =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'CANCELLED'
  | 'JUDGING'
  | 'QUEUING'
  | 'SUBMITTING'
  | 'SYSTEM_ERROR'
  | 'REMOTE_ERROR';

/**
 * Lookup table mapping raw Codeforces API verdict strings to the unified
 * OJ status state machine.  Mirrors the VerdictMapping model
 * (platform = 'CODEFORCES') so entries stay synchronised.
 */
const VERDICT_LOOKUP: Record<string, OjStatus> = {
  OK:                   'ACCEPTED',
  WRONG_ANSWER:         'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED:  'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',
  RUNTIME_ERROR:        'RUNTIME_ERROR',
  COMPILATION_ERROR:    'COMPILE_ERROR',
  SKIPPED:              'CANCELLED',
  TESTING:              'JUDGING',
  REJECTED:             'SYSTEM_ERROR',
  FAILED:               'SYSTEM_ERROR',
  CRASHED:              'SYSTEM_ERROR',
  CHALLENGED:           'CANCELLED',
  SUBMITTED:            'SUBMITTING',
  PRESENTATION_ERROR:   'WRONG_ANSWER',
  SECURITY_VIOLATED:    'SYSTEM_ERROR',
  INPUT_PREPARATION_CRASHED: 'SYSTEM_ERROR',
  CLONE_FAILED:         'SYSTEM_ERROR',
  IDLENESS_LIMIT_EXCEEDED:   'RUNTIME_ERROR',
  PARTIAL:              'ACCEPTED',
};

const TERMINAL_SET: ReadonlySet<OjStatus> = new Set([
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'CANCELLED',
  'SYSTEM_ERROR',
  'REMOTE_ERROR',
]);

const ZERO_SCORE_SET: ReadonlySet<OjStatus> = new Set([
  'ACCEPTED',
]);

/**
 * Pure, stateless utility that maps raw Codeforces verdict strings into
 * the unified 12-type OJ status state machine.
 *
 * No dependencies — designed to be injected anywhere.
 */
@Injectable()
export class CfVerdictMapper {
  private readonly log = new Logger(CfVerdictMapper.name);

  /**
   * Convert a raw CF API verdict to a typed OJ status.
   *
   * - `null` / `undefined` / empty  →  JUDGING  (still running on CF)
   * - Unknown value                  →  SYSTEM_ERROR  + logged warning
   * - Known value                    →  corresponding terminal or transient status
   */
  mapVerdict(raw: string | null | undefined): OjStatus {
    if (!raw) {
      return 'JUDGING';
    }

    const normalised = raw.toUpperCase().trim();
    const mapped = VERDICT_LOOKUP[normalised];

    if (!mapped) {
      this.log.warn(`Unrecognised CF verdict "${raw}" — mapping to SYSTEM_ERROR`);
      return 'SYSTEM_ERROR';
    }

    return mapped;
  }

  /**
   * Compute a normalised integer score from a verdict.
   *
   * ACCEPTED              → 100
   * Everything else       → 0
   */
  verdictScore(status: OjStatus): number {
    return ZERO_SCORE_SET.has(status) ? 100 : 0;
  }

  /**
   * Returns `true` when polling should stop for this status.
   * Returns `false` when the submission is still in-flight on CF.
   */
  isTerminal(status: OjStatus): boolean {
    return TERMINAL_SET.has(status);
  }
}
