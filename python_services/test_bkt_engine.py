"""
BKT engine validation tests.

Run:  pytest test_bkt_engine.py -v

These tests address two of the gaps the thesis evaluation flagged:
  * "No unit tests on BKT math" (eval §5.1)
  * "No external validation of the custom engine" (eval §2.4)

We verify our closed-form per-skill update against pyBKT's HMM forward pass
(``Model.predict_state``) — both should produce the same posterior P(L_t)
for any sequence of responses, since they implement the same model.
"""
from __future__ import annotations

import pytest

from bkt_engine import (
    SKILL_PARAMS, AnswerInput, predict_with_pybkt, proficiency_level,
    update_skill_mastery,
)


# ============================================================
# Closed-form vs pyBKT parity
# ============================================================
@pytest.mark.parametrize("skill", list(SKILL_PARAMS.keys()))
@pytest.mark.parametrize("sequence", [
    [True],
    [False],
    [True, True, True, True, True],
    [False, False, False, False, False],
    [True, False, True, False, True],
    [False, True, True, True, False, True],
])
def test_closed_form_matches_pybkt(skill, sequence):
    prior = SKILL_PARAMS[skill]['pInit']
    answers = [AnswerInput(skill=skill, is_correct=c) for c in sequence]
    result = update_skill_mastery(skill, prior, answers)

    pybkt_posterior = predict_with_pybkt(skill, sequence)

    # Tight tolerance — same model, same parameters, same data.
    assert abs(result.final_l - pybkt_posterior) < 1e-4, (
        f"Closed-form ({result.final_l}) diverges from pyBKT ({pybkt_posterior}) "
        f"on skill={skill} sequence={sequence}"
    )


# ============================================================
# Behavioral sanity checks
# ============================================================
def test_cold_start_returns_prior_when_no_answers():
    result = update_skill_mastery('Memorization', 0.42, [])
    assert result.final_l == 0.42
    assert result.questions_answered == 0


def test_all_correct_drives_mastery_up():
    answers = [AnswerInput(skill='Memorization', is_correct=True) for _ in range(20)]
    result = update_skill_mastery('Memorization', 0.01, answers)
    assert result.final_l > 0.5, f"Expected mastery > 0.5 after 20 correct, got {result.final_l}"


def test_all_incorrect_keeps_mastery_low():
    answers = [AnswerInput(skill='Memorization', is_correct=False) for _ in range(10)]
    result = update_skill_mastery('Memorization', 0.5, answers)
    # Learning transition still adds a small positive nudge each step, but
    # 10 wrong answers should keep us well below mastery threshold.
    assert result.final_l < 0.6


def test_unknown_skill_falls_back_to_memorization():
    answers = [AnswerInput(skill='Unknown', is_correct=True)]
    result = update_skill_mastery('Unknown', 0.01, answers)
    assert result.skill_name == 'Memorization'


def test_proficiency_level_thresholds():
    assert proficiency_level(0.96) == 'Mastered'
    assert proficiency_level(0.71) == 'Advanced'
    assert proficiency_level(0.51) == 'Intermediate'
    assert proficiency_level(0.31) == 'Beginner'
    assert proficiency_level(0.10) == 'Novice'


def test_threshold_crossing_at_corbett_anderson_value():
    """0.95 is the threshold cited in the thesis literature review."""
    assert proficiency_level(0.95) == 'Mastered'
    assert proficiency_level(0.9499) == 'Advanced'


# ============================================================
# Process-diagram conformance
# These tests are direct readings of the General Process diagram.
# ============================================================
from bkt_engine import (
    MASTERY_THRESHOLD, FINAL_TOTAL_QUESTIONS,
    compute_lesson_weight, compute_m_lesson, compute_overall_mastery,
    compute_remaining_l, compute_wm_initial,
)


def test_diagram_step4_mastery_threshold_is_0_85():
    """Diagram Step 4: 'Determine mastery by ruling out if the OverallM >= 0.85'."""
    assert MASTERY_THRESHOLD == 0.85


def test_diagram_final_assessment_question_count_is_30():
    """Diagram (Final Assessments box): '30 Questions Inside the Lesson'."""
    assert FINAL_TOTAL_QUESTIONS == 30


def test_diagram_step4_overallm_includes_wm_initial():
    """Diagram Step 4: M_k^overall = M_k^IA + M_k^lessons.

    The legacy JS engine ignored WMInitial. This test guards against
    that regression.
    """
    res = compute_overall_mastery(wm_initial=0.05, tm_lesson=0.40)
    assert res["overall_mastery"] == 0.45      # NOT 0.40
    assert res["is_mastered"] is False

    # 0.10 (max WMInitial) + 0.75 (TMLesson) = 0.85 → just at threshold.
    res = compute_overall_mastery(wm_initial=0.10, tm_lesson=0.75)
    assert res["overall_mastery"] == 0.85
    assert res["is_mastered"] is True


def test_diagram_step2_wm_initial_uses_0_1_weight():
    """Diagram Step 2 formula: M_k^IA = 0.1 * P(L_k^IA)."""
    assert compute_wm_initial(0.5) == 0.05
    assert compute_wm_initial(1.0) == 0.1


def test_diagram_step2_remaining_l_is_complement():
    """Diagram Step 2 formula: R_k = 1.00 - M_k^IA."""
    assert compute_remaining_l(0.05) == 0.95
    assert compute_remaining_l(0.0) == 1.0


def test_diagram_step3_w_lesson_is_0_9_div_7():
    """Diagram Step 3 (Final Assessment box): 'W_lesson is equal to 0.9 / 7'."""
    assert compute_lesson_weight() == round(0.9 / 7, 6)


def test_diagram_step3_m_lesson_is_max():
    """Diagram Step 3 formula: P(L_k,j) = max(P(L_k^rev), P(L_k^final), P(L_k^sim))."""
    assert compute_m_lesson(review_l=0.6, simulation_l=0.7, final_l=0.5) == 0.7
    assert compute_m_lesson(review_l=0.0, simulation_l=0.0, final_l=0.0) == 0.0


def test_diagram_max_overall_mastery_is_reachable_at_threshold():
    """Sanity: at the diagram's 0.85 threshold, mastery is mathematically
    reachable. (At 0.95 it would be unreachable since perfect MLesson on all
    7 lessons gives WMInitial<=0.1 + 7*(0.9/7)*1.0 = 1.0 ceiling, but realistic
    learners hit ~0.7-0.9 MLesson, so 0.85 OverallM is the live design target.)"""
    perfect_initial = compute_wm_initial(1.0)            # 0.10
    seven_perfect_lessons = 7 * compute_lesson_weight() * 1.0   # 0.9 * 1.0 = 0.9
    res = compute_overall_mastery(perfect_initial, seven_perfect_lessons)
    assert res["overall_mastery"] == 1.0
    assert res["is_mastered"] is True


# ============================================================
# Time-rule conformance — Review (per Item Interaction sidebar)
# ============================================================
from bkt_engine import apply_review_time_rules, apply_final_time_rules


def test_review_incorrect_triggers_redo_and_30s_cooldown():
    rule = apply_review_time_rules(response_time=5, attempt_number=1, is_correct=False)
    assert rule['needsRedoDiscussion'] is True
    assert rule['cooldownSeconds'] == 30
    assert rule['finalVersionType'] is None


def test_review_correct_under_30s_after_first_attempt_routes_to_situational():
    """Diagram: Time < 30s AND after first attempt AND correct → Situational in Final."""
    rule = apply_review_time_rules(response_time=20, attempt_number=2, is_correct=True)
    assert rule['finalVersionType'] == 'Situational'
    assert rule['needsRedoDiscussion'] is False


def test_review_correct_first_attempt_routes_to_easy():
    """First-attempt correctness without speed bonus stays on Easy."""
    rule = apply_review_time_rules(response_time=20, attempt_number=1, is_correct=True)
    assert rule['finalVersionType'] == 'Easy'


def test_review_three_or_more_attempts_routes_to_easy_regardless_of_time():
    """Diagram: After 3-5 attempts → Easy version in Final Assessment."""
    for attempt in (3, 4, 5, 6):
        rule = apply_review_time_rules(response_time=10, attempt_number=attempt, is_correct=True)
        assert rule['finalVersionType'] == 'Easy', f'attempt={attempt}'


def test_review_correct_slow_keeps_easy():
    rule = apply_review_time_rules(response_time=60, attempt_number=2, is_correct=True)
    assert rule['finalVersionType'] == 'Easy'


# ============================================================
# Time-rule conformance — Final
# ============================================================
def test_final_situational_fast_correct_skips_retake():
    """Time < 2 mins AND Situational AND correct → no retake."""
    rule = apply_final_time_rules(response_time=90, question_type='Situational', is_correct=True)
    assert rule['needToAnswerAgain'] is False


def test_final_situational_slow_correct_still_retakes():
    rule = apply_final_time_rules(response_time=130, question_type='Situational', is_correct=True)
    assert rule['needToAnswerAgain'] is True


def test_final_easy_fast_correct_skips_retake():
    """Time < 1 min AND Easy AND correct → no retake."""
    rule = apply_final_time_rules(response_time=45, question_type='Easy', is_correct=True)
    assert rule['needToAnswerAgain'] is False


def test_final_incorrect_always_retakes():
    for qtype in ('Easy', 'Situational'):
        rule = apply_final_time_rules(response_time=10, question_type=qtype, is_correct=False)
        assert rule['needToAnswerAgain'] is True, qtype


# ============================================================
# Long-sequence parity — closed-form vs pyBKT over 50 responses
# ============================================================
import random


def test_parity_over_long_random_sequence():
    rng = random.Random(42)
    sequence = [rng.random() < 0.55 for _ in range(50)]   # ~55% correct
    skill = 'Critical Thinking'
    answers = [AnswerInput(skill=skill, is_correct=c) for c in sequence]

    closed_form = update_skill_mastery(skill, SKILL_PARAMS[skill]['pInit'], answers).final_l
    pybkt_state = predict_with_pybkt(skill, sequence)

    assert abs(closed_form - pybkt_state) < 1e-3, (
        f'Closed-form {closed_form} diverges from pyBKT {pybkt_state} '
        f'over 50-step sequence'
    )


# ============================================================
# Cold-start edges
# ============================================================
def test_p_known_clamped_to_unit_interval():
    """No matter the sequence, current_l stays in [0,1]."""
    answers = [AnswerInput(skill='Memorization', is_correct=True) for _ in range(100)]
    result = update_skill_mastery('Memorization', 0.01, answers)
    assert 0.0 <= result.final_l <= 1.0


def test_one_correct_answer_increases_mastery():
    answers = [AnswerInput(skill='Memorization', is_correct=True)]
    result = update_skill_mastery('Memorization', 0.5, answers)
    assert result.final_l > 0.5


def test_one_incorrect_answer_decreases_mastery():
    answers = [AnswerInput(skill='Memorization', is_correct=False)]
    result = update_skill_mastery('Memorization', 0.5, answers)
    # Drop from posterior, then learning transition adds back. Net should
    # still be below the starting point given pSlip < 1.
    assert result.final_l < 0.5


def test_mixed_skill_batch_independence():
    """Updates to one skill do not affect another's mastery."""
    a1 = update_skill_mastery('Memorization', 0.01, [AnswerInput(skill='Memorization', is_correct=True)])
    a2 = update_skill_mastery('Critical Thinking', 0.01, [AnswerInput(skill='Critical Thinking', is_correct=True)])
    assert a1.final_l != a2.final_l   # different skills, different params, different deltas
    assert a1.skill_name == 'Memorization'
    assert a2.skill_name == 'Critical Thinking'
