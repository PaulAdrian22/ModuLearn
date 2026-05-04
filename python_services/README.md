# Python services — pyBKT on Modal

The BKT batch-update endpoint runs on **Modal** (Python serverless) and uses
the **pyBKT** library cited by the thesis. The other two BKT endpoints
(`bkt-knowledge-states`, `bkt-final-history`) are pure SELECT queries and
remain on Supabase Edge Functions (Deno).

## Files

| File              | Purpose                                                      |
|-------------------|--------------------------------------------------------------|
| `bkt_engine.py`   | pyBKT model loader + closed-form update (parity with pyBKT)  |
| `modal_app.py`    | Modal app definition + HTTP endpoint                         |
| `test_bkt_engine.py` | Pytest suite — closed-form vs pyBKT parity, cold-start, etc. |
| `requirements.txt`| Python deps                                                  |

## Local setup

```bash
cd python_services
python -m venv .venv && source .venv/bin/activate    # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
pytest -v          # validates the engine against pyBKT
```

## Modal setup (one-time)

1. **Create a Modal account**: <https://modal.com>. Free tier ($30/mo credit) covers
   thesis-scale traffic many times over.
2. **Install + auth**:
   ```bash
   pip install modal
   modal setup     # opens a browser to authenticate
   ```
3. **Create the Supabase secret** in Modal so the function can talk to your
   project. From the Modal dashboard → Secrets → New custom secret named
   `modulearn-supabase` with three keys:

   | Key                          | Where to find it                                      |
   |------------------------------|-------------------------------------------------------|
   | `SUPABASE_URL`               | Supabase Dashboard → Settings → API                   |
   | `SUPABASE_SERVICE_ROLE_KEY`  | Supabase Dashboard → Settings → API → service_role    |
   | `SUPABASE_JWT_SECRET`        | Supabase Dashboard → Settings → API → JWT Settings    |

## Deploy

```bash
cd python_services
modal deploy modal_app.py
```

Modal prints the production URL — looks like
`https://<workspace>--modulearn-bkt-batch-update.modal.run`.
Copy it into the frontend env file as `REACT_APP_BKT_BATCH_UPDATE_URL`.

## Re-deploying after changes

```bash
modal deploy modal_app.py     # picks up new code, reuses warm containers
```

## Cost notes

- **Cold start**: ~3–6s the first time after idle (loading numpy + pyBKT).
  `min_containers=0` keeps a warm container alive cheaply during demo periods;
  bump to 1 for a defense.
- **Warm requests**: <100ms.
- **Pricing**: Modal charges per CPU-second; this endpoint uses ~0.2 CPU-s
  per call. The free tier accommodates thousands of submissions per month.

## Validation against pyBKT

`test_bkt_engine.py` is the answer to the thesis evaluation's
"No external validation" gap. It verifies, for every skill and every response
sequence we test, that our closed-form update produces the same posterior
P(L_t) as pyBKT's HMM forward pass (`Model.predict_state`). Both implement
the same Corbett & Anderson 1994 model; they should — and do — agree to 4
decimal places.

## Why a closed-form path AND pyBKT?

pyBKT is optimized for **batch** prediction over a fitted dataset, not online
incremental updates. Calling `predict_state` per request would mean rebuilding
a DataFrame and running the forward pass on the full history every time.
Cheaper to use the closed-form update equations (mathematically identical)
and keep pyBKT in the loop for parameter fitting + test validation.

If you later collect real learner data and want pyBKT to *fit* parameters
empirically:

```python
from pyBKT.models import Model
import pandas as pd
df = pd.read_csv('responses.csv')   # user_id, skill_name, correct, order_id
model = Model(seed=42, num_fits=20)
model.fit(data=df)
print(model.coef_)                   # paste these into bkt_engine.SKILL_PARAMS
```
