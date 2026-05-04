"""
Modal app for ModuLearn's BKT batch-update endpoint.

Deploy:
    modal deploy modal_app.py

Endpoint:
    POST https://<workspace>--modulearn-bkt-batch-update.modal.run
    Headers: Authorization: Bearer <supabase-user-jwt>
    Body:    same as the legacy bkt-batch-update Edge Function

Secrets (one Modal Secret named "modulearn-supabase"):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    SUPABASE_JWT_SECRET   # found in Supabase Dashboard > Settings > API > JWT Settings
"""
from __future__ import annotations

import os
from typing import Any

import modal
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

# ============================================================
# Modal image with pyBKT + Supabase client baked in.
# ============================================================
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .add_local_python_source("bkt_engine")
)

app = modal.App("modulearn-bkt", image=image)
secret = modal.Secret.from_name("modulearn-supabase")


# ============================================================
# Auth: verify Supabase JWT to extract user_id (sub claim).
# ============================================================
def verify_jwt(authorization_header: str | None) -> str:
    import jwt

    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization_header.removeprefix("Bearer ")

    secret_key = os.environ["SUPABASE_JWT_SECRET"]
    try:
        decoded = jwt.decode(token, secret_key, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing sub claim")
    return user_id


# ============================================================
# Supabase REST client (service-role) — bypasses RLS, but writes are
# always scoped to the JWT-verified user_id, so this is safe.
# ============================================================
def supabase_client():
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


# ============================================================
# CORS preflight + headers shared across responses.
# ============================================================
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}


# ============================================================
# Endpoint
# ============================================================
@app.function(secrets=[secret], min_containers=0, scaledown_window=300)
@modal.fastapi_endpoint(method="POST")
def batch_update(request: Request) -> JSONResponse:
    import asyncio

    return asyncio.run(_handle(request))


async def _handle(request: Request) -> JSONResponse:
    if request.method == "OPTIONS":
        return JSONResponse({}, headers=CORS)

    try:
        user_id = verify_jwt(request.headers.get("authorization"))
    except HTTPException as exc:
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=CORS)

    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400, headers=CORS)

    answers_raw = body.get("answers") or []
    if not isinstance(answers_raw, list) or not answers_raw:
        return JSONResponse({"error": "answers array is required"}, status_code=400, headers=CORS)

    from bkt_engine import (
        SKILL_PARAMS, AnswerInput, apply_final_time_rules, apply_review_time_rules,
        compute_lesson_weight, compute_m_lesson, compute_overall_mastery,
        compute_remaining_l, compute_wm_initial, normalize_assessment_type,
        update_skill_mastery,
    )

    assessment_type = normalize_assessment_type(body.get("assessmentType"))
    module_id = body.get("moduleId")  # uuid str or None

    # Group answers by skill (skip 'No Skill').
    grouped: dict[str, list[AnswerInput]] = {}
    for a in answers_raw:
        skill = a.get("skill") or "Memorization"
        if skill == "No Skill":
            continue
        grouped.setdefault(skill, []).append(AnswerInput(
            skill=skill,
            is_correct=bool(a.get("isCorrect")),
            response_time=int(a.get("responseTime") or 0),
            question_type=a.get("questionType") or "Easy",
            question_id=a.get("questionId"),
            attempt_number=int(a.get("attemptNumber") or 1),
        ))

    db = supabase_client()
    skill_results: list[dict] = []
    time_rules: list[dict] = []  # surfaced in the response so the frontend
                                 # can enforce review cooldown / final retake routing.

    # Per the General Process diagram (Step 3, Diagnostic box):
    #   "Competency = Dominant Skills (no direct effect to value;
    #    only for categorization purpose)"
    # Diagnostic responses are tracked for the equivalent-question-removal
    # rule but MUST NOT update bkt_models or bkt_assessment_mastery.
    if assessment_type == "Diagnostic":
        for skill_name, answer_list in grouped.items():
            diag_rows = [
                {
                    "user_id": user_id,
                    "module_id": module_id,
                    "question_id": a.question_id,
                    "skill_name": skill_name,
                    "is_correct": a.is_correct,
                    # remove_from_lesson + equivalent_question_id are populated
                    # by a content-level rule the question bank owns; we just
                    # record correctness here.
                }
                for a in answer_list if a.question_id
            ]
            if diag_rows:
                try:
                    db.table("bkt_diagnostic_results").insert(diag_rows).execute()
                except Exception as exc:
                    print(f"bkt_diagnostic_results insert failed (non-fatal): {exc}")
            skill_results.append({
                "skillName": skill_name,
                "questionsAnswered": len(answer_list),
                "questionsCorrect": sum(1 for a in answer_list if a.is_correct),
                "finalL": None,  # explicitly null — diagnostic does not compute mastery
            })

        return JSONResponse(
            {
                "ok": True,
                "engine": "pyBKT",
                "assessmentType": "Diagnostic",
                "moduleId": module_id,
                "skills": skill_results,
                "note": "Diagnostic recorded but did not update mastery (per process diagram).",
            },
            headers=CORS,
        )

    for skill_name, answer_list in grouped.items():
        params = SKILL_PARAMS.get(skill_name, SKILL_PARAMS["Memorization"])

        # Load (or create) the per-user BKT row.
        existing = (
            db.table("bkt_models")
            .select("*").eq("user_id", user_id).eq("skill_name", skill_name)
            .maybe_single().execute()
        )
        if existing and existing.data:
            prior_l = float(existing.data.get("current_l") or existing.data.get("p_known") or params["pInit"])
        else:
            # bkt_models now stores ONLY per-user mastery values (P(L) / Current L /
            # Base L). Skill parameters live in the skill_parameters reference table
            # and in bkt_engine.SKILL_PARAMS.
            prior_l = params["pInit"]
            db.table("bkt_models").insert({
                "user_id": user_id, "skill_name": skill_name,
                "p_known": params["pInit"],
                "base_l": params["pInit"], "current_l": params["pInit"],
            }).execute()

        result = update_skill_mastery(skill_name, prior_l, answer_list)

        # Time-based rules per the diagram. Computed per response and surfaced
        # in the response body — the frontend uses these to gate review
        # cooldown and to route Final retakes.
        if assessment_type == "Review":
            for a in answer_list:
                rule = apply_review_time_rules(
                    response_time=a.response_time,
                    attempt_number=a.attempt_number,
                    is_correct=a.is_correct,
                )
                time_rules.append({"skillName": skill_name, **rule})
        elif assessment_type == "Final":
            for a in answer_list:
                rule = apply_final_time_rules(
                    response_time=a.response_time,
                    question_type=a.question_type,
                    is_correct=a.is_correct,
                )
                time_rules.append({"skillName": skill_name, "questionType": a.question_type, **rule})

        # Persist per-item snapshots (only when question_id is a valid uuid).
        item_rows = [
            {
                "user_id": user_id,
                "question_id": i["question_id"],
                "module_id": module_id,
                "skill_name": skill_name,
                "assessment_type": "Review" if assessment_type == "Quiz" else assessment_type,
                "is_correct": i["is_correct"],
                "response_time": i["response_time"],
                "attempt_number": i["attempt_number"],
                "base_l_before": i["base_l_before"],
                "transition_l": i["transition_l"],
                "post_test_l": i["post_test_l"],
                "current_l_after": i["current_l_after"],
            }
            for i in result.interactions if i["question_id"]
        ]
        if item_rows:
            try:
                db.table("bkt_item_responses").insert(item_rows).execute()
            except Exception as exc:
                print(f"bkt_item_responses insert failed (non-fatal): {exc}")

        if assessment_type == "Initial":
            wm_init = compute_wm_initial(result.final_l)
            rem = compute_remaining_l(wm_init)
            db.table("bkt_overall_mastery").upsert({
                "user_id": user_id, "skill_name": skill_name,
                "initial_l": result.final_l, "wm_initial": wm_init, "remaining_l": rem,
            }, on_conflict="user_id,skill_name").execute()
            db.table("bkt_assessment_mastery").upsert({
                "user_id": user_id, "module_id": None, "skill_name": skill_name,
                "assessment_type": "Initial", "mastery_value": result.final_l,
                "questions_answered": result.questions_answered,
                "questions_correct": result.questions_correct,
            }, on_conflict="user_id,module_id,skill_name,assessment_type").execute()
            # Initial assessment is informational only; bkt_models mastery
            # progress (current_l) is NOT updated. The legacy table had a
            # post_test_l scratch column that was reset here; it has been
            # dropped — initial assessment now only writes overall + per-
            # assessment mastery rows.
        else:
            # Per Step 4 sidebar of the diagram:
            #   "The last value of Post-Test L for each skill will then be
            #    assigned to a different variable based on the assessment
            #    type AND to current L. Clear value of Post-Test L."
            # post_test_l column has been dropped from bkt_models — the
            # "clear" semantics are now implicit (we just write current_l).
            db.table("bkt_models").update({
                "current_l": result.final_l,
                "p_known": result.final_l,
            }).eq("user_id", user_id).eq("skill_name", skill_name).execute()

            if assessment_type in ("Review", "Simulation", "Final"):
                db.table("bkt_assessment_mastery").upsert({
                    "user_id": user_id, "module_id": module_id, "skill_name": skill_name,
                    "assessment_type": assessment_type, "mastery_value": result.final_l,
                    "questions_answered": result.questions_answered,
                    "questions_correct": result.questions_correct,
                }, on_conflict="user_id,module_id,skill_name,assessment_type").execute()

                # Recompute lesson + overall mastery for this skill.
                # MLesson(n) = max(ReviewL, SimulationL, FinalL)
                # WMLesson(n) = W_lesson * MLesson
                # TMLesson = sum of all WMLesson(n) across this user's lessons + this skill
                # OverallM = WMInitial + TMLesson  (Step 4 of diagram)
                if module_id is not None:
                    per_assessment = (
                        db.table("bkt_assessment_mastery")
                        .select("assessment_type, mastery_value")
                        .eq("user_id", user_id).eq("module_id", module_id).eq("skill_name", skill_name)
                        .execute()
                    )
                    by_type = {row["assessment_type"]: float(row["mastery_value"] or 0) for row in (per_assessment.data or [])}
                    review_l = by_type.get("Review", 0.0)
                    sim_l = by_type.get("Simulation", 0.0)
                    final_l = by_type.get("Final", 0.0)
                    m_lesson = compute_m_lesson(review_l, sim_l, final_l)
                    w_lesson = compute_lesson_weight()
                    wm_lesson = round(w_lesson * m_lesson, 6)

                    # w_lesson column dropped — it's a global constant (0.9/7),
                    # so we no longer persist it per row.
                    db.table("bkt_lesson_mastery").upsert({
                        "user_id": user_id, "module_id": module_id, "skill_name": skill_name,
                        "review_l": review_l, "simulation_l": sim_l, "final_l": final_l,
                        "m_lesson": m_lesson, "wm_lesson": wm_lesson,
                        "is_passed": m_lesson >= 0.85,
                    }, on_conflict="user_id,module_id,skill_name").execute()

                # Recompute TMLesson + OverallM after the per-lesson row settles.
                lesson_rows = (
                    db.table("bkt_lesson_mastery")
                    .select("wm_lesson")
                    .eq("user_id", user_id).eq("skill_name", skill_name)
                    .execute()
                )
                tm_lesson = round(sum(float(r["wm_lesson"] or 0) for r in (lesson_rows.data or [])), 6)

                overall_row = (
                    db.table("bkt_overall_mastery")
                    .select("wm_initial").eq("user_id", user_id).eq("skill_name", skill_name)
                    .maybe_single().execute()
                )
                wm_initial = float((overall_row.data or {}).get("wm_initial") or 0)
                overall = compute_overall_mastery(wm_initial, tm_lesson)

                db.table("bkt_overall_mastery").upsert({
                    "user_id": user_id, "skill_name": skill_name,
                    "tm_lesson": tm_lesson,
                    "overall_mastery": overall["overall_mastery"],
                    "is_mastered": overall["is_mastered"],
                }, on_conflict="user_id,skill_name").execute()

        skill_results.append({
            "skillName": skill_name,
            "questionsAnswered": result.questions_answered,
            "questionsCorrect": result.questions_correct,
            "finalL": result.final_l,
        })

    return JSONResponse(
        {
            "ok": True,
            "engine": "pyBKT",
            "assessmentType": assessment_type,
            "moduleId": module_id,
            "skills": skill_results,
            "timeRules": time_rules,
        },
        headers=CORS,
    )
