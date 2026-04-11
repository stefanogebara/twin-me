"""
DPO Training Launcher
=====================
Exports preference pairs from Supabase, writes to JSONL,
uploads via together.ai Python SDK, and launches the DPO job.

Usage: python scripts/launch_dpo.py
"""

import json
import os
import sys
import tempfile

import requests
import together

# ── Config ────────────────────────────────────────────────────────────────────

def require_env(name):
    value = os.getenv(name)
    if not value:
        print(f"ERROR: Required environment variable {name} is not set.")
        sys.exit(1)
    return value


TOGETHER_API_KEY = require_env("TOGETHER_API_KEY")
SUPABASE_URL = require_env("SUPABASE_URL")
SUPABASE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
USER_ID = require_env("DPO_USER_ID")
BASE_MODEL = os.getenv("DPO_BASE_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct-Reference")
MIN_PAIRS = int(os.getenv("DPO_MIN_PAIRS", "200"))
TRAIN_SPLIT = float(os.getenv("DPO_TRAIN_SPLIT", "0.9"))
MIN_QUALITY = float(os.getenv("DPO_MIN_QUALITY", "0.15"))
N_EPOCHS = int(os.getenv("DPO_EPOCHS", "2"))
BATCH_SIZE = int(os.getenv("DPO_BATCH_SIZE", "4"))
LEARNING_RATE = float(os.getenv("DPO_LEARNING_RATE", "5e-6"))
DPO_BETA = float(os.getenv("DPO_BETA", "0.1"))

# ── Fetch preference pairs from Supabase ─────────────────────────────────────

def fetch_pairs():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/preference_pairs",
        headers=headers,
        params={
            "user_id": f"eq.{USER_ID}",
            "quality_score": f"gte.{MIN_QUALITY}",
            "order": "quality_score.desc",
            "select": "id,prompt_messages,chosen_response,rejected_response,quality_score,source",
        },
    )
    resp.raise_for_status()
    return resp.json()


# ── Format as together.ai DPO JSONL ──────────────────────────────────────────

def format_pair(pair):
    msgs = pair["prompt_messages"]
    if isinstance(msgs, str):
        prompt_text = msgs
    elif isinstance(msgs, list):
        # Flatten messages array into a single prompt string
        parts = []
        for m in msgs:
            role = m.get("role", "user")
            content = m.get("content", "")
            parts.append(f"<|{role}|>\n{content}")
        prompt_text = "\n".join(parts)
    else:
        prompt_text = str(msgs)

    return json.dumps({
        "prompt": prompt_text,
        "chosen": pair["chosen_response"],
        "rejected": pair["rejected_response"],
    })


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Fetching preference pairs from Supabase...")
    pairs = fetch_pairs()
    print(f"  {len(pairs)} pairs fetched ({sum(1 for p in pairs if p.get('source') == 'synthetic')} synthetic, "
          f"{sum(1 for p in pairs if p.get('source') == 'reranker')} reranker, "
          f"{sum(1 for p in pairs if p.get('source') == 'user_feedback')} user_feedback)")

    if len(pairs) < MIN_PAIRS:
        print(f"ERROR: Need {MIN_PAIRS} pairs, only have {len(pairs)}. Aborting.")
        sys.exit(1)

    # Format lines
    lines = [format_pair(p) for p in pairs]
    split_idx = int(len(lines) * TRAIN_SPLIT)
    train_lines = lines[:split_idx]
    eval_lines  = lines[split_idx:]
    print(f"  Train: {len(train_lines)}  Eval: {len(eval_lines)}")

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
        train_path = f.name
        f.write("\n".join(train_lines) + "\n")
    print(f"  Written to {train_path}")

    try:
        # Upload via Python SDK (REST upload is broken on together.ai)
        print("\nUploading training file via together SDK...")
        from pathlib import Path
        client = together.Together(api_key=TOGETHER_API_KEY)
        resp = client.files.upload(file=Path(train_path), check=False)
        file_id = resp.id
        print(f"  File uploaded: {file_id}")

        # Launch DPO fine-tuning job
        print("\nLaunching DPO fine-tuning job...")
        suffix = f"twinme-dpo-{USER_ID[:8]}"
        job = client.fine_tuning.create(
            training_file=file_id,
            model=BASE_MODEL,
            n_epochs=N_EPOCHS,
            batch_size=BATCH_SIZE,
            learning_rate=LEARNING_RATE,
            suffix=suffix,
            lora=True,
            n_checkpoints=1,
            training_method="dpo",
            dpo_beta=DPO_BETA,
        )

        job_id = job.id
        status = job.status
        print(f"\nDPO job launched!")
        print(f"  Job ID : {job_id}")
        print(f"  Status : {status}")
        print(f"  Model  : {BASE_MODEL}")
        print(f"  Pairs  : {len(train_lines)} train / {len(eval_lines)} eval")
        print(f"  Suffix : {suffix}")
        print(f"\nSave this job ID — use it to poll status:")
        print(f"  python scripts/check_dpo_status.py {job_id}")
    finally:
        if os.path.exists(train_path):
            os.unlink(train_path)

if __name__ == "__main__":
    main()
