// Canonical universe of has_* flags emitted by runAnalysis. Shared by every catalogue that
// gates on flags (OPTION_METADATA, HELP_TOPICS), because two copies of this list is exactly
// how `has_games_howell` came to exist in the driver and in ANALYSIS.md but not in the test.
export const KNOWN_FLAGS = new Set([
  'has_q', 'has_n', 'has_l',
  'has_qq', 'has_nq', 'has_qn', 'has_nn', 'has_lq', 'has_ql', 'has_ln', 'has_nl', 'has_ll',
  'has_residuals', 'has_tukey', 'has_games_howell', 'has_kruskal_sign',
  'has_paired', 'has_paired_n', 'has_paired_q',
  'has_multi_db_broadcast', 'has_multi_db_missing_response', 'has_multi_db_level_mismatch',
  'has_likert_eligible'
]);
